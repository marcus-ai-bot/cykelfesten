import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import type { Course } from '@/types/database';

/**
 * GET /api/organizer/events/[eventId]/unplaced
 * 
 * Returns couples that have no pairings in the active match plan,
 * plus available hosts per course with current guest counts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const auth = await requireEventAccess(eventId);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();

  // Get event with active match plan
  const { data: event } = await supabase
    .from('events')
    .select('id, active_match_plan_id')
    .eq('id', eventId)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({
      unplaced: [],
      hostsByCourse: { starter: [], main: [], dessert: [] },
    });
  }

  const matchPlanId = event.active_match_plan_id;

  // Get all active (non-cancelled) couples
  const { data: allCouples } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, address, person_count')
    .eq('event_id', eventId)
    .eq('cancelled', false)
    .eq('confirmed', true)
    .order('invited_name');

  if (!allCouples?.length) {
    return NextResponse.json({
      unplaced: [],
      hostsByCourse: { starter: [], main: [], dessert: [] },
    });
  }

  // Get all pairings for the active match plan
  const { data: pairings } = await supabase
    .from('course_pairings')
    .select('host_couple_id, guest_couple_id')
    .eq('match_plan_id', matchPlanId);

  // Build set of couple IDs that appear in any pairing (as host or guest)
  const placedIds = new Set<string>();
  for (const p of pairings ?? []) {
    placedIds.add(p.host_couple_id);
    placedIds.add(p.guest_couple_id);
  }

  // Unplaced = active couples NOT in any pairing
  const unplaced = allCouples.filter(c => !placedIds.has(c.id));

  // Get assignments (to know who hosts which course and their capacity)
  const { data: assignments } = await supabase
    .from('assignments')
    .select('couple_id, course, is_host, max_guests')
    .eq('event_id', eventId)
    .eq('is_host', true);

  // Get current guest counts per host per course
  const { data: allPairingsDetailed } = await supabase
    .from('course_pairings')
    .select('course, host_couple_id, guest_couple_id')
    .eq('match_plan_id', matchPlanId);

  // Build guest count map: "hostId:course" -> total person_count of guests
  const couplePersonCount = new Map(allCouples.map(c => [c.id, c.person_count]));
  const guestCountMap = new Map<string, number>();
  for (const p of allPairingsDetailed ?? []) {
    const key = `${p.host_couple_id}:${p.course}`;
    const personCount = couplePersonCount.get(p.guest_couple_id) ?? 2;
    guestCountMap.set(key, (guestCountMap.get(key) ?? 0) + personCount);
  }

  // Build hosts-by-course with couple info
  const coupleMap = new Map(allCouples.map(c => [c.id, c]));
  const courses: Course[] = ['starter', 'main', 'dessert'];

  const hostsByCourse: Record<string, Array<{
    couple_id: string;
    name: string;
    address: string;
    current_guests: number;
    max_guests: number;
  }>> = { starter: [], main: [], dessert: [] };

  for (const a of assignments ?? []) {
    const couple = coupleMap.get(a.couple_id);
    if (!couple) continue;

    const course = a.course as Course;
    if (!courses.includes(course)) continue;

    const currentGuests = guestCountMap.get(`${a.couple_id}:${course}`) ?? 0;
    const displayName = couple.partner_name
      ? `${couple.invited_name} & ${couple.partner_name}`
      : couple.invited_name;

    hostsByCourse[course].push({
      couple_id: a.couple_id,
      name: displayName,
      address: couple.address,
      current_guests: currentGuests,
      max_guests: a.max_guests,
    });
  }

  // Sort hosts by available capacity (most room first)
  for (const course of courses) {
    hostsByCourse[course].sort((a, b) =>
      (b.max_guests - b.current_guests) - (a.max_guests - a.current_guests)
    );
  }

  // Build potential hosts per course: couples with address, not cancelled,
  // not already involved in that course (neither host NOR guest)
  const involvedInCourse: Record<string, Set<string>> = {
    starter: new Set<string>(),
    main: new Set<string>(),
    dessert: new Set<string>(),
  };

  // Add existing hosts
  for (const a of assignments ?? []) {
    if (involvedInCourse[a.course]) {
      involvedInCourse[a.course].add(a.couple_id);
    }
  }

  // Add guests from pairings
  for (const p of allPairingsDetailed ?? []) {
    if (involvedInCourse[p.course]) {
      involvedInCourse[p.course].add(p.host_couple_id);
      involvedInCourse[p.course].add(p.guest_couple_id);
    }
  }

  const potentialHosts: Record<string, Array<{
    couple_id: string;
    name: string;
    address: string;
  }>> = { starter: [], main: [], dessert: [] };

  for (const c of allCouples) {
    // Must have address to be a host
    if (!c.address) continue;

    const displayName = c.partner_name
      ? `${c.invited_name} & ${c.partner_name}`
      : c.invited_name;

    for (const course of courses) {
      if (!involvedInCourse[course].has(c.id)) {
        potentialHosts[course].push({
          couple_id: c.id,
          name: displayName,
          address: c.address,
        });
      }
    }
  }

  // Format unplaced couples
  const unplacedFormatted = unplaced.map(c => ({
    id: c.id,
    name: c.partner_name
      ? `${c.invited_name} & ${c.partner_name}`
      : c.invited_name,
    address: c.address,
    person_count: c.person_count,
  }));

  // --- Per-course gaps: couples missing placement on specific courses ---
  // A couple is "missing" on a course if they don't appear as host OR guest
  // for that course in any pairing.
  const pairingsByCourse: Record<string, Set<string>> = {
    starter: new Set<string>(),
    main: new Set<string>(),
    dessert: new Set<string>(),
  };

  for (const p of allPairingsDetailed ?? []) {
    const c = p.course as Course;
    if (pairingsByCourse[c]) {
      pairingsByCourse[c].add(p.host_couple_id);
      pairingsByCourse[c].add(p.guest_couple_id);
    }
  }

  const missingByCourse: Record<string, Array<{
    id: string;
    name: string;
    person_count: number;
    current_host_on_course: string | null;
  }>> = { starter: [], main: [], dessert: [] };

  // Build a lookup: coupleId:course -> host name (for context)
  const guestToHost = new Map<string, string>();
  for (const p of allPairingsDetailed ?? []) {
    const host = coupleMap.get(p.host_couple_id);
    if (host) {
      const hostName = host.partner_name
        ? `${host.invited_name} & ${host.partner_name}`
        : host.invited_name;
      guestToHost.set(`${p.guest_couple_id}:${p.course}`, hostName);
    }
  }

  for (const c of allCouples) {
    const displayName = c.partner_name
      ? `${c.invited_name} & ${c.partner_name}`
      : c.invited_name;

    for (const course of courses) {
      if (!pairingsByCourse[course].has(c.id)) {
        missingByCourse[course].push({
          id: c.id,
          name: displayName,
          person_count: c.person_count,
          current_host_on_course: null,
        });
      }
    }
  }

  return NextResponse.json({
    unplaced: unplacedFormatted,
    missingByCourse,
    hostsByCourse,
    potentialHosts,
  });
}
