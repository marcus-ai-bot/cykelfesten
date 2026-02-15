import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// POST /api/organizer/events/[eventId]/wrap/calculate
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const supabase = createAdminClient();

  // Get couples
  const { data: couples } = await supabase
    .from('couples')
    .select('*')
    .eq('event_id', eventId)
    .eq('confirmed', true);

  if (!couples || couples.length === 0) {
    return NextResponse.json({ error: 'Inga bekräftade par' }, { status: 400 });
  }

  // Get assignments
  const { data: assignments } = await supabase
    .from('assignments')
    .select('*, couple:couples(*), host:couples!assignments_host_couple_id_fkey(*)')
    .eq('event_id', eventId);

  // Calculate distances
  const coupleRoutes: Record<string, { coords: { lat: number; lng: number }[]; name: string }> = {};

  assignments?.forEach((a: any) => {
    const coupleId = a.couple_id;
    const couple = a.couple;
    const host = a.host;

    if (!coupleRoutes[coupleId]) {
      coupleRoutes[coupleId] = {
        coords: [],
        name: `${couple?.invited_name}${couple?.partner_name ? ' & ' + couple.partner_name : ''}`
      };
      if (couple?.coordinates) coupleRoutes[coupleId].coords.push(couple.coordinates);
    }
    if (host?.coordinates) coupleRoutes[coupleId].coords.push(host.coordinates);
  });

  const coupleDistances: Record<string, { distance: number; name: string }> = {};
  for (const [coupleId, route] of Object.entries(coupleRoutes)) {
    let totalDistance = 0;
    for (let i = 1; i < route.coords.length; i++) {
      const from = route.coords[i - 1];
      const to = route.coords[i];
      const R = 6371000;
      const dLat = (to.lat - from.lat) * Math.PI / 180;
      const dLng = (to.lng - from.lng) * Math.PI / 180;
      const a2 = Math.sin(dLat/2) ** 2 +
        Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) *
        Math.sin(dLng/2) ** 2;
      totalDistance += R * 2 * Math.atan2(Math.sqrt(a2), Math.sqrt(1 - a2));
    }
    coupleDistances[coupleId] = { distance: totalDistance, name: route.name };
  }

  let shortest = { meters: Infinity, couple: '' };
  let longest = { meters: 0, couple: '' };
  let totalDistance = 0;

  Object.values(coupleDistances).forEach(({ distance, name }) => {
    totalDistance += distance;
    if (distance < shortest.meters && distance > 0) shortest = { meters: distance, couple: name };
    if (distance > longest.meters) longest = { meters: distance, couple: name };
  });

  let funFactsCount = 0;
  couples.forEach(c => {
    if (c.fun_facts && Array.isArray(c.fun_facts)) funFactsCount += c.fun_facts.length;
  });

  const districts = new Set<string>();
  couples.forEach(c => {
    if (c.address) {
      const parts = c.address.split(',');
      if (parts.length > 1) districts.add(parts[parts.length - 1].trim());
    }
  });

  // Get existing stats for manual fields
  const { data: event } = await supabase.from('events').select('wrap_stats').eq('id', eventId).single();
  const existing = event?.wrap_stats || {};

  const newStats = {
    total_distance_km: Math.round(totalDistance / 100) / 10,
    total_couples: couples.length,
    total_people: couples.reduce((sum, c) => sum + (c.partner_name ? 2 : 1), 0),
    total_portions: couples.length * 3 * 2,
    shortest_ride_meters: Math.round(shortest.meters),
    shortest_ride_couple: shortest.couple,
    longest_ride_meters: Math.round(longest.meters),
    longest_ride_couple: longest.couple,
    age_youngest: 25,
    age_oldest: 65,
    districts_count: districts.size || 3,
    fun_facts_count: funFactsCount,
    last_guest_departure: existing.last_guest_departure || null,
    wrap1_sent_at: existing.wrap1_sent_at || null,
    wrap2_sent_at: existing.wrap2_sent_at || null,
  };

  const { error } = await supabase.from('events').update({ wrap_stats: newStats }).eq('id', eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ stats: newStats });
}
