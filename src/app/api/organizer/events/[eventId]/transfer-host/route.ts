import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import type { Course } from '@/types/database';

/**
 * POST /api/organizer/events/[eventId]/transfer-host
 *
 * Transfer host role from one couple to another for specific courses.
 * Used after splitting a couple: the original couple keeps all pairings/assignments,
 * but we need to transfer hosting to the new solo entry (e.g. Astrid takes over from Jan).
 *
 * Updates:
 * - assignments: host role transferred
 * - course_pairings: host_couple_id updated
 * - envelopes: host_couple_id + destination_address updated
 *
 * Input:
 * {
 *   from_couple_id: string,   // current host (e.g. Jan after split)
 *   to_couple_id: string,     // new host (e.g. Astrid after split)
 *   courses: ("starter" | "main" | "dessert")[]  // which courses to transfer
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const auth = await requireEventAccess(eventId);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { from_couple_id, to_couple_id, courses } = body as {
    from_couple_id: string;
    to_couple_id: string;
    courses: Course[];
  };

  const validCourses: Course[] = ['starter', 'main', 'dessert'];
  if (!from_couple_id || !to_couple_id || !Array.isArray(courses) || courses.length === 0) {
    return NextResponse.json(
      { error: 'from_couple_id, to_couple_id, and courses[] required' },
      { status: 400 }
    );
  }
  for (const c of courses) {
    if (!validCourses.includes(c)) {
      return NextResponse.json({ error: `Invalid course: ${c}` }, { status: 400 });
    }
  }

  const supabase = createAdminClient();

  // Get event
  const { data: event } = await supabase
    .from('events')
    .select('id, active_match_plan_id')
    .eq('id', eventId)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;

  // Validate both couples exist and belong to this event
  const { data: fromCouple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name')
    .eq('id', from_couple_id)
    .eq('event_id', eventId)
    .single();

  const { data: toCouple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, address, address_notes')
    .eq('id', to_couple_id)
    .eq('event_id', eventId)
    .single();

  if (!fromCouple) {
    return NextResponse.json({ error: 'Source couple not found' }, { status: 404 });
  }
  if (!toCouple) {
    return NextResponse.json({ error: 'Target couple not found' }, { status: 404 });
  }

  const results: string[] = [];

  for (const course of courses) {
    // 1. Transfer assignment
    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, max_guests, is_flex_host, flex_extra_capacity, is_emergency_host')
      .eq('event_id', eventId)
      .eq('couple_id', from_couple_id)
      .eq('course', course)
      .eq('is_host', true)
      .single();

    if (!assignment) {
      results.push(`⚠️ ${course}: Ingen värd-assignment att överföra`);
      continue;
    }

    // Delete old assignment
    await supabase
      .from('assignments')
      .delete()
      .eq('id', assignment.id);

    // Create new assignment for target couple
    const { error: assignError } = await supabase
      .from('assignments')
      .insert({
        event_id: eventId,
        couple_id: to_couple_id,
        course,
        is_host: true,
        max_guests: assignment.max_guests,
        is_flex_host: assignment.is_flex_host,
        flex_extra_capacity: assignment.flex_extra_capacity,
        is_emergency_host: assignment.is_emergency_host,
      });

    if (assignError) {
      results.push(`❌ ${course}: Assignment-fel: ${assignError.message}`);
      continue;
    }

    // 2. Update pairings: change host_couple_id
    const { error: pairingError, count: pairingCount } = await supabase
      .from('course_pairings')
      .update({ host_couple_id: to_couple_id })
      .eq('match_plan_id', matchPlanId)
      .eq('host_couple_id', from_couple_id)
      .eq('course', course);

    if (pairingError) {
      results.push(`❌ ${course}: Pairing-fel: ${pairingError.message}`);
      continue;
    }

    // 3. Update envelopes: change host_couple_id + destination address
    const { error: envError, count: envCount } = await supabase
      .from('envelopes')
      .update({
        host_couple_id: to_couple_id,
        destination_address: toCouple.address,
        destination_notes: toCouple.address_notes ?? null,
      })
      .eq('match_plan_id', matchPlanId)
      .eq('host_couple_id', from_couple_id)
      .eq('course', course)
      .eq('cancelled', false);

    if (envError) {
      results.push(`❌ ${course}: Kuvert-fel: ${envError.message}`);
      continue;
    }

    results.push(`✅ ${course}: Värdskap överfört (${pairingCount ?? '?'} pairings, ${envCount ?? '?'} kuvert)`);
  }

  // Log
  const fromName = fromCouple.partner_name
    ? `${fromCouple.invited_name} & ${fromCouple.partner_name}`
    : fromCouple.invited_name;
  const toName = toCouple.partner_name
    ? `${toCouple.invited_name} & ${toCouple.partner_name}`
    : toCouple.invited_name;

  await supabase.from('event_log').insert({
    event_id: eventId,
    match_plan_id: matchPlanId,
    action: 'transfer_host',
    actor_id: auth.organizer.id,
    details: {
      from_couple_id,
      from_name: fromName,
      to_couple_id,
      to_name: toName,
      courses,
      results,
    },
  });

  return NextResponse.json({
    success: true,
    from_name: fromName,
    to_name: toName,
    courses,
    results,
  });
}
