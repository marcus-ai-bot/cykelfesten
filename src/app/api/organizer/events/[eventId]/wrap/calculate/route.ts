import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

function parsePoint(point: unknown): { lat: number; lng: number } | null {
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

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
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

  if (!couples?.length) {
    return NextResponse.json({ error: 'Inga par hittade' }, { status: 400 });
  }

  // Get active match plan
  const { data: event } = await supabase
    .from('events')
    .select('active_match_plan_id, wrap_stats')
    .eq('id', eventId)
    .single();

  const matchPlanId = event?.active_match_plan_id;

  // Get assignments for route calculation
  const { data: assignments } = matchPlanId
    ? await supabase
        .from('assignments')
        .select('couple_id, host_couple_id, course')
        .eq('match_plan_id', matchPlanId)
        .order('course')
    : { data: [] };

  // Build couple coordinate map
  const coupleCoords = new Map<string, { lat: number; lng: number }>();
  const coupleNames = new Map<string, string>();
  couples.forEach(c => {
    const coords = parsePoint(c.coordinates);
    if (coords) coupleCoords.set(c.id, coords);
    coupleNames.set(c.id, c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : ''));
  });

  // Calculate per-couple total cycling distance (home → host1 → host2 → host3 → home)
  const coupleRouteDistances = new Map<string, number>();

  if (assignments?.length) {
    // Group assignments by couple, ordered by course
    const coupleAssignments = new Map<string, string[]>(); // coupleId → [hostId per course]
    const courseOrder = ['starter', 'main', 'dessert'];
    
    assignments.forEach((a: any) => {
      if (!coupleAssignments.has(a.couple_id)) coupleAssignments.set(a.couple_id, []);
      coupleAssignments.get(a.couple_id)!.push(a.host_couple_id);
    });

    for (const [coupleId, hostIds] of coupleAssignments) {
      const home = coupleCoords.get(coupleId);
      if (!home) continue;

      let totalDist = 0;
      let prev = home;

      for (const hostId of hostIds) {
        const hostCoords = coupleCoords.get(hostId);
        if (!hostCoords) continue;
        totalDist += haversineMeters(prev, hostCoords);
        prev = hostCoords;
      }
      // Return home
      totalDist += haversineMeters(prev, home);
      coupleRouteDistances.set(coupleId, totalDist);
    }
  }

  // Distance stats
  let shortest = { meters: Infinity, couple: '' };
  let longest = { meters: 0, couple: '' };
  let totalDistance = 0;

  for (const [coupleId, dist] of coupleRouteDistances) {
    totalDistance += dist;
    const name = coupleNames.get(coupleId) || coupleId;
    if (dist < shortest.meters && dist > 0) shortest = { meters: dist, couple: name };
    if (dist > longest.meters) longest = { meters: dist, couple: name };
  }

  // Age stats from birth_year
  const currentYear = new Date().getFullYear();
  const ages: number[] = [];
  couples.forEach(c => {
    if (c.invited_birth_year) ages.push(currentYear - c.invited_birth_year);
    if (c.partner_birth_year) ages.push(currentYear - c.partner_birth_year);
  });

  // Fun facts count
  let funFactsCount = 0;
  couples.forEach(c => {
    if (c.invited_fun_facts && typeof c.invited_fun_facts === 'string' && c.invited_fun_facts.trim()) funFactsCount++;
    if (c.partner_fun_facts && typeof c.partner_fun_facts === 'string' && c.partner_fun_facts.trim()) funFactsCount++;
  });

  // Districts (cities from address)
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
    total_couples: couples.length,
    total_people: couples.reduce((sum, c) => sum + (c.partner_name ? 2 : 1), 0),
    total_portions: couples.length * 3 * 2, // 3 courses × 2 people approx
    shortest_ride_meters: shortest.meters === Infinity ? 0 : Math.round(shortest.meters),
    shortest_ride_couple: shortest.couple || '—',
    longest_ride_meters: Math.round(longest.meters),
    longest_ride_couple: longest.couple || '—',
    age_youngest: ages.length ? Math.min(...ages) : null,
    age_oldest: ages.length ? Math.max(...ages) : null,
    districts_count: districts.size,
    districts_list: Array.from(districts),
    fun_facts_count: funFactsCount,
    couples_with_routes: coupleRouteDistances.size,
    // Preserve manual fields
    last_guest_departure: existing.last_guest_departure || null,
    wrap1_sent_at: existing.wrap1_sent_at || null,
    wrap2_sent_at: existing.wrap2_sent_at || null,
  };

  await supabase.from('events').update({ wrap_stats: newStats }).eq('id', eventId);

  return NextResponse.json({ stats: newStats });
}
