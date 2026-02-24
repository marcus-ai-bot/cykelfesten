import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';
import { cascadeChanges } from '@/lib/matching/cascade';

/**
 * POST /api/organizer/couples/[coupleId]/resign-host
 *
 * "Avsäg värdskap" — removes the couple's host-pairings (freeing their guests)
 * but keeps any guest-pairings intact.
 *
 * Returns which guests became unplaced and for which course.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get couple
  const { data: couple } = await supabase
    .from('couples')
    .select('id, event_id, invited_name, partner_name')
    .eq('id', coupleId)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
  }

  // Verify organizer access to this event
  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) {
    return NextResponse.json({ error: 'No access' }, { status: 403 });
  }

  // Get event with active match plan
  const { data: event } = await supabase
    .from('events')
    .select('id, active_match_plan_id')
    .eq('id', couple.event_id)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;

  // Find all course_pairings where this couple is HOST
  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('id, course, guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId);

  if (!hostPairings || hostPairings.length === 0) {
    return NextResponse.json({ error: 'Couple is not a host in any course' }, { status: 400 });
  }

  const cascade = await cascadeChanges({
    supabase,
    eventId: couple.event_id,
    matchPlanId,
    type: 'resign_host',
    coupleId,
  });

  if (!cascade.success) {
    return NextResponse.json(
      { error: cascade.errors.join(', ') || 'Failed to resign host' },
      { status: 500 }
    );
  }

  const guestIds = cascade.unplacedGuests;
  let guestNames: { id: string; name: string }[] = [];
  if (guestIds.length > 0) {
    const { data: guestCouples } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name')
      .in('id', guestIds);

    guestNames = (guestCouples ?? []).map(c => ({
      id: c.id,
      name: c.partner_name
        ? `${c.invited_name} & ${c.partner_name}`
        : c.invited_name,
    }));
  }

  const affectedCourses = new Set(hostPairings.map(p => p.course));

  // Log in event_log
  const coupleName = couple.partner_name
    ? `${couple.invited_name} & ${couple.partner_name}`
    : couple.invited_name;

  await supabase.from('event_log').insert({
    event_id: couple.event_id,
    match_plan_id: matchPlanId,
    action: 'resign_host',
    actor_id: organizer.id,
    details: {
      couple_id: coupleId,
      couple_name: coupleName,
      courses: [...affectedCourses],
      freed_guests: guestNames,
      pairings_removed: cascade.pairingsRemoved,
    },
  });

  return NextResponse.json({
    success: true,
    couple_name: coupleName,
    courses: [...affectedCourses],
    freed_guests: guestNames,
    pairings_removed: cascade.pairingsRemoved,
  });
}
