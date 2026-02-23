import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import {
  calculateEnvelopeTimes,
  parseCourseSchedules,
  type CourseTimingOffsets,
} from '@/lib/envelope/timing';
import { getCyclingDistance, type Coordinates } from '@/lib/geo';
import type { Course } from '@/types/database';

function parsePoint(point: unknown): Coordinates | null {
  if (!point || typeof point !== 'string') return null;
  // PostGIS POINT format: "POINT(lng lat)" or "(lng,lat)"
  const match = String(point).match(/\(?\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)?/);
  if (!match) return null;
  const lng = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  if (isNaN(lng) || isNaN(lat)) return null;
  return { lat, lng };
}

/**
 * POST /api/organizer/events/[eventId]/reassign
 *
 * Move a guest from their current host to a different host for a specific course.
 * Used during LIVE events when manual adjustments are needed (e.g. couple separation).
 *
 * - Deletes old pairing + cancels old envelope
 * - Creates new pairing + envelope with correct timing
 * - If guest has no existing pairing for the course, just places them (like /place)
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
  const { guest_couple_id, course, new_host_couple_id } = body as {
    guest_couple_id: string;
    course: Course;
    new_host_couple_id: string;
  };

  const validCourses: Course[] = ['starter', 'main', 'dessert'];
  if (!guest_couple_id || !course || !new_host_couple_id || !validCourses.includes(course)) {
    return NextResponse.json(
      { error: 'guest_couple_id, course (starter/main/dessert), and new_host_couple_id required' },
      { status: 400 }
    );
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

  // Validate guest couple
  const { data: guestCouple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, cancelled, coordinates')
    .eq('id', guest_couple_id)
    .eq('event_id', eventId)
    .single();

  if (!guestCouple) {
    return NextResponse.json({ error: 'Guest couple not found' }, { status: 404 });
  }
  if (guestCouple.cancelled) {
    return NextResponse.json({ error: 'Guest couple is cancelled' }, { status: 400 });
  }

  // Validate new host is a host for this course
  const { data: hostAssignment } = await supabase
    .from('assignments')
    .select('couple_id, max_guests')
    .eq('event_id', eventId)
    .eq('couple_id', new_host_couple_id)
    .eq('course', course)
    .eq('is_host', true)
    .single();

  if (!hostAssignment) {
    return NextResponse.json(
      { error: `${new_host_couple_id} is not a host for ${course}` },
      { status: 400 }
    );
  }

  // Validate new host is not cancelled
  const { data: newHostCouple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, address, address_notes, cancelled, coordinates')
    .eq('id', new_host_couple_id)
    .eq('event_id', eventId)
    .single();

  if (!newHostCouple || newHostCouple.cancelled) {
    return NextResponse.json({ error: 'New host couple not found or cancelled' }, { status: 400 });
  }

  // Check capacity (warn but don't block)
  const { data: currentPairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', new_host_couple_id)
    .eq('course', course);

  const { data: guestCouples } = await supabase
    .from('couples')
    .select('id, person_count')
    .eq('event_id', eventId)
    .in('id', (currentPairings ?? []).map(p => p.guest_couple_id));

  const currentGuestCount = (guestCouples ?? []).reduce((sum, c) => sum + (c.person_count ?? 2), 0);
  const guestPersonCount = guestCouple.partner_name ? 2 : 1; // After split it might be 1
  const overCapacity = (currentGuestCount + guestPersonCount) > hostAssignment.max_guests;

  // --- Remove old pairing + envelope for this guest + course ---
  let oldHostName: string | null = null;

  const { data: oldPairing } = await supabase
    .from('course_pairings')
    .select('id, host_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', guest_couple_id)
    .eq('course', course)
    .single();

  if (oldPairing) {
    // Get old host name for logging
    const { data: oldHost } = await supabase
      .from('couples')
      .select('invited_name, partner_name')
      .eq('id', oldPairing.host_couple_id)
      .single();

    oldHostName = oldHost
      ? (oldHost.partner_name ? `${oldHost.invited_name} & ${oldHost.partner_name}` : oldHost.invited_name)
      : null;

    // Delete old pairing
    await supabase
      .from('course_pairings')
      .delete()
      .eq('id', oldPairing.id);

    // Cancel old envelope
    await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', matchPlanId)
      .eq('couple_id', guest_couple_id)
      .eq('course', course)
      .eq('host_couple_id', oldPairing.host_couple_id);
  }

  // --- Create new pairing ---
  const { error: pairingError } = await supabase
    .from('course_pairings')
    .insert({
      match_plan_id: matchPlanId,
      course,
      host_couple_id: new_host_couple_id,
      guest_couple_id: guest_couple_id,
    });

  if (pairingError) {
    return NextResponse.json(
      { error: 'Failed to create new pairing', details: pairingError.message },
      { status: 500 }
    );
  }

  // --- Create new envelope with timing ---
  const courseStartTimes = parseCourseSchedules(
    event.event_date,
    event.starter_time || '17:30:00',
    event.main_time || '19:00:00',
    event.dessert_time || '20:30:00'
  );

  const { data: timing } = await supabase
    .from('event_timing')
    .select('*')
    .eq('event_id', eventId)
    .single();

  const courseOffsets: CourseTimingOffsets = event.course_timing_offsets || {};

  // Calculate cycling distance between guest and new host
  const guestCoords = parsePoint(guestCouple.coordinates);
  const hostCoords = parsePoint(newHostCouple.coordinates);
  let cyclingDistanceKm: number | null = null;
  let cyclingMinutes: number | null = null;

  if (guestCoords && hostCoords) {
    try {
      const dist = await getCyclingDistance(guestCoords, hostCoords);
      cyclingDistanceKm = dist.distance_km;
      cyclingMinutes = dist.duration_min;
    } catch { /* fallback to null */ }
  }

  const times = calculateEnvelopeTimes(
    courseStartTimes[course],
    timing ?? {},
    cyclingMinutes ?? undefined,
    courseOffsets[course]
  );

  const { error: envError } = await supabase
    .from('envelopes')
    .insert({
      match_plan_id: matchPlanId,
      couple_id: guest_couple_id,
      course,
      host_couple_id: new_host_couple_id,
      destination_address: newHostCouple.address,
      destination_notes: newHostCouple.address_notes ?? null,
      scheduled_at: courseStartTimes[course].toISOString(),
      cycling_distance_km: cyclingDistanceKm,
      cycling_minutes: cyclingMinutes,
      current_state: 'LOCKED' as const,
      teasing_at: times.teasing_at.toISOString(),
      clue_1_at: times.clue_1_at.toISOString(),
      clue_2_at: times.clue_2_at.toISOString(),
      street_at: times.street_at.toISOString(),
      number_at: times.number_at.toISOString(),
      opened_at: times.opened_at.toISOString(),
    });

  if (envError) {
    console.error('Envelope insert error in reassign:', envError);
    return NextResponse.json(
      { error: `Pairing skapad men kuvert misslyckades: ${envError.message}`, details: envError.message },
      { status: 500 }
    );
  }

  // Log
  const guestName = guestCouple.partner_name
    ? `${guestCouple.invited_name} & ${guestCouple.partner_name}`
    : guestCouple.invited_name;
  const newHostName = newHostCouple.partner_name
    ? `${newHostCouple.invited_name} & ${newHostCouple.partner_name}`
    : newHostCouple.invited_name;

  await supabase.from('event_log').insert({
    event_id: eventId,
    match_plan_id: matchPlanId,
    action: 'reassign_guest',
    actor_id: auth.organizer.id,
    details: {
      guest_couple_id,
      guest_name: guestName,
      course,
      old_host: oldHostName,
      new_host: newHostName,
      over_capacity: overCapacity,
    },
  });

  return NextResponse.json({
    success: true,
    guest_name: guestName,
    course,
    old_host: oldHostName,
    new_host: newHostName,
    over_capacity: overCapacity,
  });
}
