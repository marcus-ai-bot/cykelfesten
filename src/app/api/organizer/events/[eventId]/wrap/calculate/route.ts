import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// 228 Mapbox requests in batches of 10 = ~25 seconds needed
export const maxDuration = 60;

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

  // Batch cycling distance calculation (25 concurrent for speed)
  const BATCH = 25;
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

  // --- Street-based stats ---
  function extractStreet(address: string): string | null {
    // "Sundsgatan 12, Piteå" → "Sundsgatan"
    const match = address.match(/^([A-ZÅÄÖa-zåäö\s-]+?)\s+\d/);
    return match ? match[1].trim() : null;
  }

  const streetCounts = new Map<string, number>(); // street → number of couples
  couples.forEach(c => {
    if (!c.address) return;
    const street = extractStreet(c.address);
    if (street) streetCounts.set(street, (streetCounts.get(street) || 0) + 1);
  });
  const uniqueStreets = streetCounts.size;
  const busiestStreet = [...streetCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  // Street with most served meals (hosts per street)
  const streetMeals = new Map<string, number>(); // street → number of courses hosted
  const envelopeList = envelopes || [];
  const hostCoupleIds = new Set<string>();
  envelopeList.forEach((e: any) => { if (e.host_couple_id) hostCoupleIds.add(e.host_couple_id); });
  // Count courses per host address street
  const hostCourseCounts = new Map<string, Set<string>>(); // hostCoupleId → set of courses
  envelopeList.forEach((e: any) => {
    if (!e.host_couple_id || !e.course) return;
    if (!hostCourseCounts.has(e.host_couple_id)) hostCourseCounts.set(e.host_couple_id, new Set());
    hostCourseCounts.get(e.host_couple_id)!.add(e.course);
  });
  // Now map host → street → total unique guests served
  const streetServings = new Map<string, number>(); // street → total meal servings
  for (const [hostId, courses] of hostCourseCounts) {
    const couple = couples.find(c => c.id === hostId);
    if (!couple?.address) continue;
    const street = extractStreet(couple.address);
    if (!street) continue;
    // Each course hosts ~6 people (3 couples × 2), count envelope assignments
    const mealsOnStreet = envelopeList.filter((e: any) => e.host_couple_id === hostId).length;
    streetServings.set(street, (streetServings.get(street) || 0) + mealsOnStreet);
  }
  const topMealStreet = [...streetServings.entries()].sort((a, b) => b[1] - a[1])[0];

  // --- Event radius: max distance between any two participants ---
  const allCoords = [...coupleCoords.values()];
  let maxSpanMeters = 0;
  let spanPairNames: [string, string] = ['', ''];
  if (allCoords.length > 1) {
    const coupleIdList = [...coupleCoords.keys()];
    for (let i = 0; i < coupleIdList.length; i++) {
      for (let j = i + 1; j < coupleIdList.length; j++) {
        const d = haversineMeters(coupleCoords.get(coupleIdList[i])!, coupleCoords.get(coupleIdList[j])!);
        if (d > maxSpanMeters) {
          maxSpanMeters = d;
          spanPairNames = [coupleNames.get(coupleIdList[i]) || '?', coupleNames.get(coupleIdList[j]) || '?'];
        }
      }
    }
  }

  // --- Convex hull area (km²) using Shoelace formula on lat/lng ---
  function convexHullArea(coords: Coord[]): number {
    if (coords.length < 3) return 0;
    // Simple convex hull (Graham scan)
    const pts = coords.map(c => ({ x: c.lng, y: c.lat }));
    pts.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (O: any, A: any, B: any) => (A.x - O.x) * (B.y - O.y) - (A.y - O.y) * (B.x - O.x);
    const lower: any[] = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) lower.pop(); lower.push(p); }
    const upper: any[] = [];
    for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) upper.pop(); upper.push(p); }
    upper.pop(); lower.pop();
    const hull = lower.concat(upper);
    if (hull.length < 3) return 0;
    // Shoelace in degrees, then convert to km² (approximate at latitude)
    let area = 0;
    for (let i = 0; i < hull.length; i++) {
      const j = (i + 1) % hull.length;
      area += hull[i].x * hull[j].y;
      area -= hull[j].x * hull[i].y;
    }
    area = Math.abs(area) / 2;
    // Convert degree² to km²: 1° lat ≈ 111 km, 1° lng ≈ 111 * cos(lat) km
    const avgLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
    const kmPerDegLat = 111.32;
    const kmPerDegLng = 111.32 * Math.cos(avgLat * Math.PI / 180);
    return area * kmPerDegLat * kmPerDegLng;
  }
  const eventAreaKm2 = convexHullArea(allCoords);

  // --- Neighbor pairs: couples on same street who never ate together ---
  const neighborPairs: Array<{ a: string; b: string; street: string }> = [];
  const couplesByStreet = new Map<string, string[]>(); // street → coupleIds
  couples.forEach(c => {
    if (!c.address) return;
    const street = extractStreet(c.address);
    if (street) {
      if (!couplesByStreet.has(street)) couplesByStreet.set(street, []);
      couplesByStreet.get(street)!.push(c.id);
    }
  });
  // Build "ate together" set from envelopes (same host_couple_id + course = same table)
  const ateTogetherSet = new Set<string>();
  const envelopeByCourseHost = new Map<string, string[]>(); // "course:hostId" → coupleIds
  envelopeList.forEach((e: any) => {
    const key = `${e.course}:${e.host_couple_id}`;
    if (!envelopeByCourseHost.has(key)) envelopeByCourseHost.set(key, []);
    envelopeByCourseHost.get(key)!.push(e.couple_id);
  });
  for (const group of envelopeByCourseHost.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pair = [group[i], group[j]].sort().join(':');
        ateTogetherSet.add(pair);
      }
    }
  }
  for (const [street, ids] of couplesByStreet) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pair = [ids[i], ids[j]].sort().join(':');
        if (!ateTogetherSet.has(pair)) {
          neighborPairs.push({ a: coupleNames.get(ids[i]) || '?', b: coupleNames.get(ids[j]) || '?', street });
        }
      }
    }
  }

  const existing = event?.wrap_stats || {};

  // Build person-weighted total: couples ride together, so multiply by persons in each couple
  const couplePersonCount = new Map<string, number>();
  couples.forEach(c => couplePersonCount.set(c.id, c.partner_name ? 2 : 1));
  const totalPersonMeters = coupleRoutes.reduce((sum, r) => {
    const persons = couplePersonCount.get(r.coupleId) || 1;
    return sum + r.totalMeters * persons;
  }, 0);
  const totalPeople = couples.reduce((sum, c) => sum + (c.partner_name ? 2 : 1), 0);

  const newStats = {
    total_distance_km: Math.round(totalPersonMeters / 100) / 10,
    avg_distance_km: totalPeople > 0 ? Math.round(totalPersonMeters / totalPeople / 100) / 10 : 0,
    total_couples: couples.length,
    total_people: totalPeople,
    total_portions: couples.length * 3 * 2,
    shortest_ride_km: shortestRoute ? Math.round(shortestRoute.totalMeters / 100) / 10 : 0,
    shortest_ride_couple: shortestRoute?.name || '—',
    longest_ride_km: longestRoute ? Math.round(longestRoute.totalMeters / 100) / 10 : 0,
    longest_ride_couple: longestRoute?.name || '—',
    age_youngest: ages.length ? Math.min(...ages) : null,
    age_oldest: ages.length ? Math.max(...ages) : null,
    unique_streets: uniqueStreets,
    busiest_street: busiestStreet ? { name: busiestStreet[0], couples: busiestStreet[1] } : null,
    top_meal_street: topMealStreet ? { name: topMealStreet[0], servings: topMealStreet[1] } : null,
    event_radius_km: Math.round(maxSpanMeters / 100) / 10,
    event_radius_pair: spanPairNames,
    event_area_km2: Math.round(eventAreaKm2 * 100) / 100,
    neighbor_pairs: neighborPairs.slice(0, 10), // top 10
    fun_facts_count: funFactsCount,
    couples_with_routes: distances.length,
    distance_source: 'cycling',
    // Preserve manual fields
    last_guest_departure: existing.last_guest_departure || null,
    wrap1_sent_at: existing.wrap1_sent_at || null,
    wrap2_sent_at: existing.wrap2_sent_at || null,
    // Per-couple route data
    routes: routeSummaries,
  };

  await supabase.from('events').update({ wrap_stats: newStats }).eq('id', eventId);

  return NextResponse.json({
    stats: newStats,
    routes: routeSummaries,
  });
}
