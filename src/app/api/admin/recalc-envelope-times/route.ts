import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import { calculateEnvelopeTimes, parseCourseSchedules, type CourseTimingOffsets } from '@/lib/envelope/timing';

type CoordPair = [number, number];

function parsePoint(point: unknown): CoordPair | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as Record<string, number>;
    if (p.lng != null && p.lat != null) return [p.lng, p.lat];
    if (p.x != null && p.y != null) return [p.x, p.y];
  }
  return null;
}

async function getCyclingDistanceKm(fromCoords: CoordPair, toCoords: CoordPair): Promise<number | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=false&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.routes?.[0]?.distance ? Math.round(data.routes[0].distance / 10) / 100 : null;
  } catch {
    return null;
  }
}

function estimateCyclingMinutes(distanceKm: number | null | undefined): number | undefined {
  if (distanceKm == null) return undefined;
  return Math.round(distanceKm * 4);
}

const DEFAULT_TIMING = {
  teasing_hours: 6,
  clue_1_hours: 2,
  clue_2_minutes: 30,
  street_minutes: 15,
  number_minutes: 5,
};

/**
 * Recalculate all envelope reveal times based on current event times + timing settings.
 * Called when organizer changes course start times.
 */
export async function POST(request: NextRequest) {
  try {
    const { event_id } = await request.json();
    if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 });

    const auth = await requireEventAccess(event_id);
    if (!auth.success) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = createAdminClient();

    // Get event with current times
    const { data: event } = await supabase
      .from('events')
      .select('*, active_match_plan_id, course_timing_offsets')
      .eq('id', event_id)
      .single();

    if (!event?.active_match_plan_id) {
      return NextResponse.json({ message: 'No active match plan, nothing to recalc' });
    }

    // Get timing settings
    const { data: timing } = await supabase
      .from('event_timing')
      .select('*')
      .eq('event_id', event_id)
      .single();

    const timingConfig = { ...DEFAULT_TIMING, ...timing };
    const courseOffsets: CourseTimingOffsets = event.course_timing_offsets || {};

    // Parse course start times from event
    const courseStartTimes = parseCourseSchedules(
      event.event_date,
      event.starter_time || '17:30:00',
      event.main_time || '19:00:00',
      event.dessert_time || '20:30:00'
    );

    // Get all envelopes for active match plan
    const { data: envelopes } = await supabase
      .from('envelopes')
      .select('id, couple_id, course, host_couple_id, cycling_distance_km')
      .eq('match_plan_id', event.active_match_plan_id);

    if (!envelopes?.length) {
      return NextResponse.json({ message: 'No envelopes to update' });
    }

    const { data: couples } = await supabase
      .from('couples')
      .select('id, coordinates')
      .eq('event_id', event_id)
      .eq('cancelled', false);

    const coupleCoords = new Map<string, CoordPair>();
    for (const couple of couples ?? []) {
      const coords = parsePoint(couple.coordinates);
      if (coords) coupleCoords.set(couple.id, coords);
    }

    // Recalculate and update each envelope (batch updates)
    let updated = 0;
    const batchSize = 10;
    for (let i = 0; i < envelopes.length; i += batchSize) {
      const batch = envelopes.slice(i, i + batchSize);
      const distances = await Promise.all(
        batch.map(async env => {
          if (!env.host_couple_id) return { env, distanceKm: null };
          if (env.couple_id === env.host_couple_id) return { env, distanceKm: 0 };
          const from = coupleCoords.get(env.couple_id);
          const to = coupleCoords.get(env.host_couple_id);
          if (!from || !to) return { env, distanceKm: null };
          const distanceKm = await getCyclingDistanceKm(from, to);
          return { env, distanceKm };
        })
      );

      await Promise.all(
        distances.map(({ env, distanceKm }) => {
          const cyclingMinutes = estimateCyclingMinutes(distanceKm ?? env.cycling_distance_km ?? null);
          const times = calculateEnvelopeTimes(
            courseStartTimes[env.course as keyof typeof courseStartTimes],
            timingConfig,
            cyclingMinutes,
            courseOffsets[env.course as keyof typeof courseOffsets]
          );

          const updatePayload: Record<string, string | number | null> = {
            teasing_at: times.teasing_at.toISOString(),
            clue_1_at: times.clue_1_at.toISOString(),
            clue_2_at: times.clue_2_at.toISOString(),
            street_at: times.street_at.toISOString(),
            number_at: times.number_at.toISOString(),
            opened_at: times.opened_at.toISOString(),
          };

          if (distanceKm !== null) {
            updatePayload.cycling_distance_km = distanceKm;
          }

          return supabase
            .from('envelopes')
            .update(updatePayload)
            .eq('id', env.id);
        })
      );
      updated += batch.length;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('Recalc error:', error);
    return NextResponse.json({ error: 'Recalc failed' }, { status: 500 });
  }
}
