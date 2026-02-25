import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import {
  calculateEnvelopeTimes,
  parseCourseSchedules,
  type CourseTimingOffsets,
} from '@/lib/envelope/timing';
import { cascadeChanges } from '@/lib/matching/cascade';
import { parsePoint } from '@/lib/geo';
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

  // Get host couple details for envelope addresses + coordinates for cycling distance
  const { data: hostCouples } = await supabase
    .from('couples')
    .select('id, address, address_notes, coordinates')
    .eq('event_id', eventId)
    .in('id', hostIds);

  const hostCoupleMap = new Map((hostCouples ?? []).map(c => [c.id, c]));

  // Get guest couple coordinates for cycling distance calculation
  const { data: guestCoupleCoords } = await supabase
    .from('couples')
    .select('id, coordinates')
    .eq('event_id', eventId)
    .in('id', guestIds);

  const guestCoordMap = new Map((guestCoupleCoords ?? []).map(c => [c.id, parsePoint(c.coordinates)]));

  // Haversine distance helper
  function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

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

  const { data: existingPairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id, course')
    .eq('match_plan_id', matchPlanId)
    .in('guest_couple_id', guestIds);

  const { data: existingEnvelopes } = await supabase
    .from('envelopes')
    .select('couple_id, course')
    .eq('match_plan_id', matchPlanId)
    .in('couple_id', guestIds)
    .eq('cancelled', false);

  const existingPairingKeys = new Set(
    (existingPairings ?? []).map(p => `${p.guest_couple_id}:${p.course}`)
  );
  const existingEnvelopeKeys = new Set(
    (existingEnvelopes ?? []).map(e => `${e.couple_id}:${e.course}`)
  );

  for (const placement of placements) {
    const key = `${placement.guest_couple_id}:${placement.course}`;
    if (existingPairingKeys.has(key) || existingEnvelopeKeys.has(key)) {
      return NextResponse.json(
        { error: `Guest ${placement.guest_couple_id} already has a placement for ${placement.course}` },
        { status: 409 }
      );
    }
  }

  const envelopesToInsert: any[] = [];

  for (const placement of placements) {
    const cascade = await cascadeChanges({
      supabase,
      eventId,
      matchPlanId,
      type: 'reassign',
      coupleId: placement.guest_couple_id,
      details: {
        course: placement.course,
        newHostCoupleId: placement.host_couple_id,
      },
    });

    if (!cascade.success) {
      return NextResponse.json(
        { error: cascade.errors.join(', ') || 'Failed to place guest' },
        { status: 500 }
      );
    }

    const host = hostCoupleMap.get(placement.host_couple_id);
    const hostCoords = parsePoint(host?.coordinates ?? null);
    const guestCoords = guestCoordMap.get(placement.guest_couple_id);
    const cyclingDistanceKm = (guestCoords && hostCoords)
      ? haversineKm(guestCoords.lat, guestCoords.lng, hostCoords.lat, hostCoords.lng)
      : null;

    const times = calculateEnvelopeTimes(
      courseStartTimes[placement.course],
      timing ?? {},
      undefined,
      courseOffsets[placement.course]
    );

    envelopesToInsert.push({
      match_plan_id: matchPlanId,
      couple_id: placement.guest_couple_id,
      course: placement.course,
      host_couple_id: placement.host_couple_id,
      destination_address: host?.address ?? null,
      destination_notes: host?.address_notes ?? null,
      scheduled_at: courseStartTimes[placement.course].toISOString(),
      current_state: 'LOCKED' as const,
      teasing_at: times.teasing_at.toISOString(),
      clue_1_at: times.clue_1_at.toISOString(),
      clue_2_at: times.clue_2_at.toISOString(),
      street_at: times.street_at.toISOString(),
      number_at: times.number_at.toISOString(),
      opened_at: times.opened_at.toISOString(),
      cycling_distance_km: cyclingDistanceKm,
    });
  }

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

  // Create afterparty envelopes for newly placed guests (if event has afterparty)
  let afterpartyCreated = 0;
  if (event.afterparty_location && event.afterparty_coordinates) {
    const afterpartyCoords = parsePoint(event.afterparty_coordinates);
    const afterpartyTime = event.afterparty_time ?? '23:00:00';
    const normalizedTime = afterpartyTime.length === 5 ? `${afterpartyTime}:00` : afterpartyTime;

    // Stockholm timezone offset
    const probeUtc = new Date(`${event.event_date}T12:00:00Z`);
    const stockholmStr = probeUtc.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: 'numeric', hour12: false });
    const stockholmHour = parseInt(stockholmStr);
    const offsetHours = stockholmHour - probeUtc.getUTCHours();
    const tzSign = offsetHours >= 0 ? '+' : '-';
    const tzOffset = `${tzSign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`;

    const [h, m] = normalizedTime.split(':').map(Number);
    const baseMin = h * 60 + m;
    function minToTs(totalMin: number): string {
      const wrapped = ((totalMin % 1440) + 1440) % 1440;
      const hh = Math.floor(wrapped / 60);
      const mm = wrapped % 60;
      return `${event.event_date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00${tzOffset}`;
    }

    function randomOffset(lat: number, lng: number, minM: number, maxM: number) {
      const angle = Math.random() * 2 * Math.PI;
      const distance = minM + Math.random() * (maxM - minM);
      const dLat = (distance * Math.cos(angle)) / 111320;
      const dLng = (distance * Math.sin(angle)) / (111320 * Math.cos(lat * Math.PI / 180));
      return { lat: lat + dLat, lng: lng + dLng };
    }

    const scheduledAt = `${event.event_date}T${normalizedTime}${tzOffset}`;

    // Check which guests already have afterparty envelopes
    const { data: existingAfterparty } = await supabase
      .from('envelopes')
      .select('couple_id')
      .eq('match_plan_id', matchPlanId)
      .eq('course', 'afterparty')
      .in('couple_id', guestIds);

    const hasAfterparty = new Set((existingAfterparty ?? []).map(e => e.couple_id));

    const afterpartyEnvelopes = guestIds
      .filter(id => !hasAfterparty.has(id))
      .map(coupleId => {
        // Find dessert host for this guest (for cycling distance from dessert → afterparty)
        const dessertPlacement = placements.find(p => p.guest_couple_id === coupleId && p.course === 'dessert');
        const dessertHostCoords = dessertPlacement ? parsePoint(hostCoupleMap.get(dessertPlacement.host_couple_id)?.coordinates ?? null) : null;
        const fromCoords = dessertHostCoords ?? guestCoordMap.get(coupleId);
        const cyclingKm = (fromCoords && afterpartyCoords)
          ? haversineKm(fromCoords.lat, fromCoords.lng, afterpartyCoords.lat, afterpartyCoords.lng)
          : null;

        const zone = afterpartyCoords ? randomOffset(afterpartyCoords.lat, afterpartyCoords.lng, 100, 300) : null;
        const closing = afterpartyCoords ? randomOffset(afterpartyCoords.lat, afterpartyCoords.lng, 0, 80) : null;

        return {
          match_plan_id: matchPlanId,
          couple_id: coupleId,
          course: 'afterparty' as const,
          host_couple_id: null,
          destination_address: event.afterparty_location,
          destination_notes: event.afterparty_door_code ?? null,
          teasing_at: minToTs(baseMin - 45),
          clue_1_at: null,
          clue_2_at: null,
          street_at: minToTs(baseMin - 15),
          number_at: minToTs(baseMin - 5),
          opened_at: scheduledAt,
          scheduled_at: scheduledAt,
          cycling_distance_km: cyclingKm,
          current_state: 'LOCKED' as const,
          zone_lat: zone?.lat ?? null,
          zone_lng: zone?.lng ?? null,
          zone_radius_m: zone ? 500 : null,
          closing_lat: closing?.lat ?? null,
          closing_lng: closing?.lng ?? null,
          closing_radius_m: closing ? 100 : null,
        };
      });

    if (afterpartyEnvelopes.length > 0) {
      const { error: apError } = await supabase
        .from('envelopes')
        .insert(afterpartyEnvelopes);
      if (!apError) afterpartyCreated = afterpartyEnvelopes.length;
    }
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
    afterparty_envelopes_created: afterpartyCreated,
  });
}
