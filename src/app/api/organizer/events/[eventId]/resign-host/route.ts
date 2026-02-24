import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import { cascadeChanges } from '@/lib/matching/cascade';
import type { Course } from '@/types/database';

/**
 * POST /api/organizer/events/[eventId]/resign-host
 *
 * Resign host role for a couple (they remain guests).
 * Cancels envelopes for affected guests, removes host pairings and host assignments.
 *
 * Input:
 * {
 *   couple_id: string,
 *   courses?: ("starter" | "main" | "dessert")[]
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const body = await request.json();
  const { couple_id, courses } = body as {
    couple_id: string;
    courses?: Course[];
  };

  const validCourses: Course[] = ['starter', 'main', 'dessert'];
  if (!couple_id) {
    return NextResponse.json({ error: 'couple_id required' }, { status: 400 });
  }
  if (courses && (!Array.isArray(courses) || courses.some(c => !validCourses.includes(c)))) {
    return NextResponse.json({ error: 'Invalid courses array' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get event with active match plan
  const { data: event } = await supabase
    .from('events')
    .select('id, active_match_plan_id')
    .eq('id', eventId)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;

  // Validate couple
  const { data: couple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, cancelled')
    .eq('id', couple_id)
    .eq('event_id', eventId)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Couple not found in this event' }, { status: 404 });
  }
  if (couple.cancelled) {
    return NextResponse.json({ error: 'Couple is cancelled' }, { status: 400 });
  }

  // Ensure couple has host assignments
  let assignmentsQuery = supabase
    .from('assignments')
    .select('id, course')
    .eq('event_id', eventId)
    .eq('couple_id', couple_id)
    .eq('is_host', true);

  if (courses && courses.length > 0) {
    assignmentsQuery = assignmentsQuery.in('course', courses);
  }

  const { data: hostAssignments } = await assignmentsQuery;

  if (!hostAssignments || hostAssignments.length === 0) {
    return NextResponse.json({ error: 'Couple has no host assignments' }, { status: 400 });
  }

  const cascade = await cascadeChanges({
    supabase,
    eventId,
    matchPlanId,
    type: 'resign_host',
    coupleId: couple_id,
  });

  if (!cascade.success) {
    return NextResponse.json(
      { error: cascade.errors.join(', ') || 'Failed to resign host' },
      { status: 500 }
    );
  }

  const warnings: string[] = [];
  if (cascade.pairingsRemoved === 0) {
    warnings.push('No host pairings found for couple');
  }

  // Log
  const coupleName = couple.partner_name
    ? `${couple.invited_name} & ${couple.partner_name}`
    : couple.invited_name;

  await supabase.from('event_log').insert({
    event_id: eventId,
    match_plan_id: matchPlanId,
    action: 'resign_host',
    actor_id: organizer.id,
    details: {
      couple_id,
      couple_name: coupleName,
      courses: courses ?? null,
      assignments_removed: cascade.assignmentsRemoved,
      pairings_removed: cascade.pairingsRemoved,
      envelopes_cancelled: cascade.envelopesCancelled,
      unplaced_guests: cascade.unplacedGuests,
      warnings,
    },
  });

  return NextResponse.json({
    success: true,
    unplaced_guests: cascade.unplacedGuests,
    warnings,
  });
}
