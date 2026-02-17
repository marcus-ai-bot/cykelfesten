import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import type { Coordinates } from '@/lib/geo';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Parse PostgREST point format "(lng,lat)" to {lat, lng}
function parsePoint(point: unknown): Coordinates | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as any;
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  }
  return null;
}

/**
 * Spread pins that share exact coordinates into a small circle.
 * Radius ~15m so they're visually distinct at max zoom but still
 * clearly "same address". A single pin at a location stays put.
 */
function applyJitter(
  items: Array<{ lat: number; lng: number }>,
  radiusMeters = 15
) {
  // Group by coordinate key
  const groups = new Map<string, number[]>();
  items.forEach((item, i) => {
    const key = `${item.lat.toFixed(7)},${item.lng.toFixed(7)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  // ~0.00015° ≈ 15m at 65°N latitude
  const latOffset = radiusMeters / 111_320;
  const lngOffset = radiusMeters / (111_320 * Math.cos((items[0]?.lat ?? 65) * Math.PI / 180));

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const n = indices.length;
    indices.forEach((idx, i) => {
      const angle = (2 * Math.PI * i) / n;
      items[idx].lat += latOffset * Math.sin(angle);
      items[idx].lng += lngOffset * Math.cos(angle);
    });
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { eventId } = await context.params;

    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data: couples, error } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, address, coordinates, role, confirmed')
      .eq('event_id', eventId)
      .order('invited_name');

    if (error) {
      console.error('Supabase error in map-data:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withCoords: Array<{ id: string; name: string; address: string; lat: number; lng: number; isHost: boolean; isConfirmed: boolean }> = [];
    const missingCoords: Array<{ id: string; name: string; address: string }> = [];

    (couples || []).forEach((c: any) => {
      const name = c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : '');
      const coords = parsePoint(c.coordinates);
      if (coords) {
        withCoords.push({
          id: c.id,
          name,
          address: c.address,
          lat: coords.lat,
          lng: coords.lng,
          isHost: c.role === 'host',
          isConfirmed: !!c.confirmed,
        });
      } else {
        missingCoords.push({
          id: c.id,
          name,
          address: c.address,
        });
      }
    });

    // Jitter: spread pins that share identical coordinates in a small circle
    // so they're visually separable at max zoom (~15m radius)
    applyJitter(withCoords);

    const { data: latestPlan, error: planError } = await supabase
      .from('match_plans')
      .select('id')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planError) {
      console.error('Supabase error fetching match plan:', planError);
      return NextResponse.json({ error: planError.message }, { status: 500 });
    }

    let routes: {
      starter: Array<{ from: [number, number]; to: [number, number]; guestName: string; hostName: string }>;
      main: Array<{ from: [number, number]; to: [number, number]; guestName: string; hostName: string }>;
      dessert: Array<{ from: [number, number]; to: [number, number]; guestName: string; hostName: string }>;
    } | null = null;

    if (latestPlan?.id) {
      const { data: pairings, error: pairingsError } = await supabase
        .from('course_pairings')
        .select('course, host_couple_id, guest_couple_id')
        .eq('match_plan_id', latestPlan.id);

      if (pairingsError) {
        console.error('Supabase error fetching course pairings:', pairingsError);
        return NextResponse.json({ error: pairingsError.message }, { status: 500 });
      }

      const byId = new Map(withCoords.map((c) => [c.id, c]));
      routes = { starter: [], main: [], dessert: [] };

      (pairings || []).forEach((pairing: any) => {
        const guest = byId.get(pairing.guest_couple_id);
        const host = byId.get(pairing.host_couple_id);
        if (!guest || !host) return;
        const segment = {
          from: [guest.lng, guest.lat] as [number, number],
          to: [host.lng, host.lat] as [number, number],
          guestName: guest.name,
          hostName: host.name,
        };
        if (pairing.course === 'starter') routes!.starter.push(segment);
        if (pairing.course === 'main') routes!.main.push(segment);
        if (pairing.course === 'dessert') routes!.dessert.push(segment);
      });
    }

    return NextResponse.json({ couples: withCoords, missingCoords, routes });
  } catch (err: any) {
    console.error('map-data route error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error', stack: err?.stack?.split('\n').slice(0, 3) }, { status: 500 });
  }
}
