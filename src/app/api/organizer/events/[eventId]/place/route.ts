import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import {
  calculateEnvelopeTimes,
  parseCourseSchedules,
  type CourseTimingOffsets,
} from '@/lib/envelope/timing';
import type { Course } from '@/types/database';

interface Placement {
  guest_couple_id: string;
  host_couple_id: string;
  course: Course;
}

/**
 * POST /api/organizer/events/[eventId]/place
 * 
 * Manually place unplaced couples with hosts.
 * Creates course_pairings + envelopes with correct timing.
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
  const placements: Placement[] = body.placements;

  if (!Array.isArray(placements) || placements.length === 0) {
    return NextResponse.json({ error: 'placements array required' }, { status: 400 });
  }

  const validCourses: Course[] = ['starter', 'main', 'dessert'];
  for (const p of placements) {
    if (!p.guest_couple_id || !p.host_couple_id || !validCourses.includes(p.course)) {
      return NextResponse.json(
        { error: `Invalid placement: ${JSON.stringify(p)}` },
        { status: 400 }
      );
    }
  }

  const supabase = createAdminClient();

  // Get event
  const { data: event } = await supabase
    .from('events')
    .select('*, active_match_plan_id, course_timing_offsets')
    .eq('id', eventId)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;

  // Validate all guest couples exist and are not cancelled
  const guestIds = [...new Set(placements.map(p => p.guest_couple_id))];
  const { data: guestCouples } = await supabase
    .from('couples')
    .select('id, cancelled')
    .eq('event_id', eventId)
    .in('id', guestIds);

  const guestMap = new Map((guestCouples ?? []).map(c => [c.id, c]));
  for (const guestId of guestIds) {
    const guest = guestMap.get(guestId);
    if (!guest) {
      return NextResponse.json({ error: `Guest couple ${guestId} not found` }, { status: 400 });
    }
    if (guest.cancelled) {
      return NextResponse.json({ error: `Guest couple ${guestId} is cancelled` }, { status: 400 });
    }
  }

  // Validate host couples exist as hosts for the relevant courses
  const hostIds = [...new Set(placements.map(p => p.host_couple_id))];
  const { data: hostAssignments } = await supabase
    .from('assignments')
    .select('couple_id, course, is_host, max_guests')
    .eq('event_id', eventId)
    .eq('is_host', true)
    .in('couple_id', hostIds);

  const hostAssignmentMap = new Map(
    (hostAssignments ?? []).map(a => [`${a.couple_id}:${a.course}`, a])
  );

  for (const p of placements) {
    const key = `${p.host_couple_id}:${p.course}`;
    if (!hostAssignmentMap.has(key)) {
      return NextResponse.json(
        { error: `${p.host_couple_id} is not a host for ${p.course}` },
        { status: 400 }
      );
    }
  }

  // Get host couple details for envelope addresses
  const { data: hostCouples } = await supabase
    .from('couples')
    .select('id, address, address_notes')
    .eq('event_id', eventId)
    .in('id', hostIds);

  const hostCoupleMap = new Map((hostCouples ?? []).map(c => [c.id, c]));

  // Calculate envelope timing
  const courseStartTimes = parseCourseSchedules(
    event.event_date,
    event.starter_time || '17:30:00',
    event.main_time || '19:00:00',
    event.dessert_time || '20:30:00'
  );

  // Get timing settings
  const { data: timing } = await supabase
    .from('event_timing')
    .select('*')
    .eq('event_id', eventId)
    .single();

  const courseOffsets: CourseTimingOffsets = event.course_timing_offsets || {};

  // Create pairings
  const pairingsToInsert = placements.map(p => ({
    match_plan_id: matchPlanId,
    course: p.course,
    host_couple_id: p.host_couple_id,
    guest_couple_id: p.guest_couple_id,
  }));

  const { error: pairingError } = await supabase
    .from('course_pairings')
    .insert(pairingsToInsert);

  if (pairingError) {
    console.error('Pairing insert error:', pairingError);
    return NextResponse.json(
      { error: 'Failed to create pairings', details: pairingError.message },
      { status: 500 }
    );
  }

  // Create envelopes with timing for each placed guest
  const envelopesToInsert = placements.map(p => {
    const host = hostCoupleMap.get(p.host_couple_id);
    const times = calculateEnvelopeTimes(
      courseStartTimes[p.course],
      timing ?? {},
      undefined, // No cycling distance available for manual placement
      courseOffsets[p.course]
    );

    return {
      match_plan_id: matchPlanId,
      couple_id: p.guest_couple_id,
      course: p.course,
      host_couple_id: p.host_couple_id,
      destination_address: host?.address ?? null,
      destination_notes: host?.address_notes ?? null,
      scheduled_at: courseStartTimes[p.course].toISOString(),
      cycling_distance_km: null,
      current_state: 'LOCKED' as const,
      teasing_at: times.teasing_at.toISOString(),
      clue_1_at: times.clue_1_at.toISOString(),
      clue_2_at: times.clue_2_at.toISOString(),
      street_at: times.street_at.toISOString(),
      number_at: times.number_at.toISOString(),
      opened_at: times.opened_at.toISOString(),
    };
  });

  const { error: envError } = await supabase
    .from('envelopes')
    .insert(envelopesToInsert);

  if (envError) {
    console.error('Envelope insert error:', envError);
    return NextResponse.json(
      { error: 'Pairings created but envelopes failed', details: envError.message },
      { status: 500 }
    );
  }

  // Log the manual placement
  await supabase.from('event_log').insert({
    event_id: eventId,
    match_plan_id: matchPlanId,
    action: 'manual_placement',
    actor_id: auth.organizer.id,
    details: {
      placements: placements.length,
      couples: guestIds,
    },
  });

  return NextResponse.json({
    success: true,
    pairings_created: placements.length,
    envelopes_created: envelopesToInsert.length,
  });
}
