import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

type Coord = { lat: number; lng: number };

function parsePoint(point: unknown): Coord | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const m = point.match(/\(([^,]+),([^)]+)\)/);
    if (m) return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as Record<string, number>;
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  }
  return null;
}

function haversineMeters(a: Coord, b: Coord): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function getCyclingMeters(from: Coord, to: Coord): Promise<number> {
  // Skip zero-distance legs (same location, e.g. hosting at home)
  if (haversineMeters(from, to) < 10) return 0;
  
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return haversineMeters(from, to);
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.routes?.[0]?.distance ?? haversineMeters(from, to);
  } catch {
    return haversineMeters(from, to);
  }
}

function metersToKm(meters: number): number {
  return Math.round(meters / 10) / 100;
}

interface CoupleRoute {
  coupleId: string;
  name: string;
  legs: Array<{ from: string; to: string; fromCoord: Coord; toCoord: Coord }>;
  totalMeters: number;
  hostingCourse: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'Ingen åtkomst' }, { status: 403 });

  const supabase = createAdminClient();

  const { data: couples } = await supabase
    .from('couples')
    .select('*')
    .eq('event_id', eventId)
    .eq('cancelled', false);

  if (!couples?.length) return NextResponse.json({ error: 'Inga par' }, { status: 400 });

  const { data: event } = await supabase
    .from('events')
    .select('active_match_plan_id, wrap_stats')
    .eq('id', eventId)
    .single();

  const matchPlanId = event?.active_match_plan_id;

  const { data: envelopes } = matchPlanId
    ? await supabase
        .from('envelopes')
        .select('couple_id, host_couple_id, course')
        .eq('match_plan_id', matchPlanId)
    : { data: [] };

  // Build lookup maps
  const coupleCoords = new Map<string, Coord>();
  const coupleNames = new Map<string, string>();
  const coupleAddresses = new Map<string, string>();
  
  couples.forEach(c => {
    const coords = parsePoint(c.coordinates);
    if (coords) coupleCoords.set(c.id, coords);
    coupleNames.set(c.id, c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : ''));
    coupleAddresses.set(c.id, c.address || '?');
  });

  // Build per-couple assignment map: coupleId → { starter: hostId, main: hostId, dessert: hostId }
  const courseOrder = ['starter', 'main', 'dessert'] as const;
  const coupleHosts = new Map<string, Map<string, string>>(); // coupleId → course → hostCoupleId
  
  envelopes?.forEach((e: any) => {
    if (!coupleHosts.has(e.couple_id)) coupleHosts.set(e.couple_id, new Map());
    coupleHosts.get(e.couple_id)!.set(e.course, e.host_couple_id);
  });

  // Backfill envelope cycling distances (home → host)
  if (matchPlanId && envelopes?.length) {
    const BATCH = 10;
    for (let i = 0; i < envelopes.length; i += BATCH) {
      const chunk = envelopes.slice(i, i + BATCH);
      const distances = await Promise.all(
        chunk.map(async (env: any) => {
          if (!env.host_couple_id) return { env, distanceKm: null };
          if (env.couple_id === env.host_couple_id) return { env, distanceKm: 0 };
          const from = coupleCoords.get(env.couple_id);
          const to = coupleCoords.get(env.host_couple_id);
          if (!from || !to) return { env, distanceKm: null };
          const meters = await getCyclingMeters(from, to);
          return { env, distanceKm: metersToKm(meters) };
        })
      );

      await Promise.all(
        distances.map(({ env, distanceKm }) =>
          supabase
            .from('envelopes')
            .update({ cycling_distance_km: distanceKm })
            .eq('match_plan_id', matchPlanId)
            .eq('couple_id', env.couple_id)
            .eq('course', env.course)
        )
      );
    }
  }

  // Calculate ACTUAL route per couple
  // The real journey: Home → Course1_location → Course2_location → Course3_location → Home
  // If hosting a course: location = your home (you stay/return)
  
  const coupleRoutes: CoupleRoute[] = [];
  const allLegs: Array<{ coupleId: string; from: Coord; to: Coord }> = [];

  for (const couple of couples) {
    const home = coupleCoords.get(couple.id);
    if (!home) continue;
    
    const hosts = coupleHosts.get(couple.id);
    if (!hosts) continue;

    const name = coupleNames.get(couple.id) || couple.id;
    let hostingCourse: string | null = null;

    // Build waypoints in order
    const waypoints: Array<{ label: string; coord: Coord }> = [
      { label: '🏠 Hem', coord: home },
    ];

    for (const course of courseOrder) {
      const hostId = hosts.get(course);
      if (!hostId) continue;
      
      const isHosting = hostId === couple.id;
      if (isHosting) hostingCourse = course;
      
      const hostCoord = coupleCoords.get(hostId);
      if (!hostCoord) continue;
      
      const courseLabel = course === 'starter' ? '🥗 Förrätt'
        : course === 'main' ? '🍖 Varmrätt'
        : '🍰 Dessert';
      
      waypoints.push({
        label: isHosting ? `${courseLabel} (värd, hemma)` : `${courseLabel} @ ${coupleAddresses.get(hostId) || '?'}`,
        coord: hostCoord,
      });
    }

    // Return home after last course
    waypoints.push({ label: '🏠 Hem', coord: home });

    // Build legs
    const legs: CoupleRoute['legs'] = [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      legs.push({
        from: waypoints[i].label,
        to: waypoints[i + 1].label,
        fromCoord: waypoints[i].coord,
        toCoord: waypoints[i + 1].coord,
      });
      allLegs.push({
        coupleId: couple.id,
        from: waypoints[i].coord,
        to: waypoints[i + 1].coord,
      });
    }

    coupleRoutes.push({ coupleId: couple.id, name, legs, totalMeters: 0, hostingCourse });
  }

  // Batch cycling distance calculation (10 concurrent)
  const BATCH = 10;
  const legDistances = new Map<number, number>(); // index → meters
  
  for (let i = 0; i < allLegs.length; i += BATCH) {
    const chunk = allLegs.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map(async (leg, j) => ({
        index: i + j,
        meters: await getCyclingMeters(leg.from, leg.to),
      }))
    );
    results.forEach(r => legDistances.set(r.index, r.meters));
  }

  // Sum per couple
  let legIndex = 0;
  for (const route of coupleRoutes) {
    let total = 0;
    for (let i = 0; i < route.legs.length; i++) {
      const meters = legDistances.get(legIndex) || 0;
      route.legs[i] = { ...route.legs[i], fromCoord: undefined as any, toCoord: undefined as any }; // strip coords from response
      (route.legs[i] as any).meters = meters;
      total += meters;
      legIndex++;
    }
    route.totalMeters = total;
  }

  // Clean up response (remove coord objects)
  const routeSummaries = coupleRoutes.map(r => ({
    couple_id: r.coupleId,
    name: r.name,
    hostingCourse: r.hostingCourse,
    totalKm: Math.round(r.totalMeters / 100) / 10,
    legs: r.legs.map(l => ({
      from: l.from,
      to: l.to,
      km: Math.round((l as any).meters / 100) / 10,
    })),
  }));

  // Overall stats
  const distances = coupleRoutes.map(r => r.totalMeters).filter(d => d > 0);
  const totalDistance = distances.reduce((a, b) => a + b, 0);
  
  const sorted = [...coupleRoutes].sort((a, b) => a.totalMeters - b.totalMeters);
  const shortestRoute = sorted.find(r => r.totalMeters > 0);
  const longestRoute = sorted[sorted.length - 1];

  // Age stats
  const currentYear = new Date().getFullYear();
  const ages: number[] = [];
  couples.forEach(c => {
    if (c.invited_birth_year) ages.push(currentYear - c.invited_birth_year);
    if (c.partner_birth_year) ages.push(currentYear - c.partner_birth_year);
  });

  // Fun facts
  let funFactsCount = 0;
  couples.forEach(c => {
    if (Array.isArray(c.invited_fun_facts) && c.invited_fun_facts.length > 0) funFactsCount++;
    if (Array.isArray(c.partner_fun_facts) && c.partner_fun_facts.length > 0) funFactsCount++;
  });

  // Districts
  const districts = new Set<string>();
  couples.forEach(c => {
    if (c.address) {
      const parts = c.address.split(',').map((s: string) => s.trim());
      const city = parts.find((p: string) => /[A-ZÅÄÖ]/.test(p) && !/^\d/.test(p) && parts.indexOf(p) > 0);
      if (city) districts.add(city);
    }
  });

  const existing = event?.wrap_stats || {};

  const newStats = {
    total_distance_km: Math.round(totalDistance / 100) / 10,
    avg_distance_km: distances.length ? Math.round(totalDistance / distances.length / 100) / 10 : 0,
    total_couples: couples.length,
    total_people: couples.reduce((sum, c) => sum + (c.partner_name ? 2 : 1), 0),
    total_portions: couples.length * 3 * 2,
    shortest_ride_km: shortestRoute ? Math.round(shortestRoute.totalMeters / 100) / 10 : 0,
    shortest_ride_couple: shortestRoute?.name || '—',
    longest_ride_km: longestRoute ? Math.round(longestRoute.totalMeters / 100) / 10 : 0,
    longest_ride_couple: longestRoute?.name || '—',
    age_youngest: ages.length ? Math.min(...ages) : null,
    age_oldest: ages.length ? Math.max(...ages) : null,
    districts_count: districts.size,
    districts_list: Array.from(districts),
    fun_facts_count: funFactsCount,
    couples_with_routes: distances.length,
    distance_source: 'cycling',
    // Preserve manual fields
    last_guest_departure: existing.last_guest_departure || null,
    wrap1_sent_at: existing.wrap1_sent_at || null,
    wrap2_sent_at: existing.wrap2_sent_at || null,
  };

  await supabase.from('events').update({ wrap_stats: newStats }).eq('id', eventId);

  return NextResponse.json({
    stats: newStats,
    routes: routeSummaries,
  });
}
