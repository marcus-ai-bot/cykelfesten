/**
 * Living Envelope Status API
 * 
 * Returns the current state of all envelopes for a participant.
 * Backend controls all timing - client only displays what server sends.
 * 
 * GET /api/envelope/status?eventId=xxx&token=yyy
 * (Legacy: &coupleId=yyy is still supported during migration)
 * 
 * Security: Uses HMAC-signed tokens to prevent unauthorized access
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAccessFromParams } from '@/lib/tokens';
import { getOrganizer } from '@/lib/auth';
import { funFactsToStrings, countFunFacts } from '@/lib/fun-facts';
import type { 
  EnvelopeStatusResponse, 
  CourseEnvelopeStatus, 
  EnvelopeState,
  AfterpartyState,
  Course,
  LiveEnvelope,
  RevealedClue,
  NextReveal,
  Couple,
} from '@/types/database';

// Extended envelope type with joined host data
interface EnvelopeWithHost extends LiveEnvelope {
  host_couple: Pick<Couple, 
    'id' | 'invited_name' | 'partner_name' | 'address' | 
    'address_notes' | 'coordinates'
  > & {
    invited_fun_facts: unknown;
    partner_fun_facts: unknown;
  } | null;
}

// State order for determining next reveal
const STATE_ORDER: EnvelopeState[] = ['LOCKED', 'TEASING', 'CLUE_1', 'CLUE_2', 'STREET', 'NUMBER', 'OPEN'];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const eventId = searchParams.get('eventId');
  
  // Get coupleId from signed token (preferred) or legacy params
  const access = getAccessFromParams(searchParams);
  
  if (!eventId || !access) {
    return NextResponse.json(
      { error: 'Kunde inte identifiera deltagare. Välj ditt par först.' },
      { status: 400 }
    );
  }
  
  const { coupleId } = access;
  
  // Allow organizers to simulate time for preview
  const simulateTime = searchParams.get('simulateTime');
  const organizer = await getOrganizer();
  const isOrganizerPreview = !!organizer || !!simulateTime;
  const now = simulateTime ? new Date(simulateTime) : new Date();
  
  // Use admin client for organizer preview (bypasses RLS), regular client for guests
  const supabase = isOrganizerPreview ? createAdminClient() : await createClient();
  
  try {
    // 1. Verify couple exists and load event info in one query
    const { data: coupleWithEvent, error: coupleError } = await supabase
      .from('couples')
      .select(`
        id,
        event_id,
        event:events(
          id,
          event_date,
          starter_time,
          main_time,
          dessert_time,
          active_match_plan_id,
          afterparty_time,
          afterparty_door_code,
          afterparty_byob,
          afterparty_notes,
          afterparty_location,
          afterparty_hosts,
          afterparty_description,
          afterparty_teasing_at,
          afterparty_revealed_at,
          afterparty_coordinates,
          host_self_messages,
          lips_sealed_messages,
          mystery_host_messages
        )
      `)
      .eq('id', coupleId)
      .eq('event_id', eventId)
      .single();
    
    if (coupleError || !coupleWithEvent || !coupleWithEvent.event) {
      return NextResponse.json(
        { error: 'Couple or event not found' },
        { status: 404 }
      );
    }

    const couple = { id: coupleWithEvent.id, event_id: coupleWithEvent.event_id };
    const event = Array.isArray(coupleWithEvent.event) ? coupleWithEvent.event[0] : coupleWithEvent.event;
    
    // 3. Get envelopes for this couple
    const { data: envelopes, error: envelopesError } = await supabase
      .from('envelopes')
      .select(`
        *,
        host_couple:couples!envelopes_host_couple_id_fkey (
          id,
          invited_name,
          partner_name,
          address,
          address_notes,
          invited_fun_facts,
          partner_fun_facts,
          coordinates
        )
      `)
      .eq('couple_id', coupleId)
      .eq('match_plan_id', event.active_match_plan_id)
      .neq('cancelled', true);
    
    if (envelopesError) {
      console.error('Error fetching envelopes:', envelopesError);
      return NextResponse.json(
        { error: 'Failed to fetch envelopes' },
        { status: 500 }
      );
    }
    
    // 4. Get course clues for each host
    const hostIds = envelopes
      ?.map(e => e.host_couple_id)
      .filter((id): id is string => id !== null) ?? [];
    
    const { data: courseClues } = await supabase
      .from('course_clues')
      .select('*')
      .in('couple_id', hostIds);
    
    // 5. Get street info for each host
    const { data: streetInfos } = await supabase
      .from('street_info')
      .select('*')
      .in('couple_id', hostIds);
    
    // 6. Get event timing
    const { data: timing } = await supabase
      .from('event_timing')
      .select('*')
      .eq('event_id', eventId)
      .single();
    
    // 6b. Get ALL participants' fun facts for the clue pool (CLUE_1)
    const { data: allCouples } = await supabase
      .from('couples')
      .select('id, invited_name, invited_fun_facts, partner_fun_facts, invited_allergies, partner_allergies, invited_allergy_notes, partner_allergy_notes, replacement_allergies, partner_name')
      .eq('event_id', eventId)
      .eq('confirmed', true);
    
    const { data: allEnvelopes } = await supabase
      .from('envelopes')
      .select('couple_id, host_couple_id, course')
      .eq('match_plan_id', event.active_match_plan_id)
      .neq('cancelled', true);
    
    const hostCourseGuestLookup = new Map<string, Map<string, string[]>>();
    for (const envelope of allEnvelopes ?? []) {
      if (!envelope.host_couple_id || !envelope.couple_id || !envelope.course) continue;
      const byCourse = hostCourseGuestLookup.get(envelope.host_couple_id) ?? new Map<string, string[]>();
      const guests = byCourse.get(envelope.course) ?? [];
      guests.push(envelope.couple_id);
      byCourse.set(envelope.course, guests);
      hostCourseGuestLookup.set(envelope.host_couple_id, byCourse);
    }
    
    // Build shuffled clue pool PER course (only couples at that table)
    // We'll build it per-envelope below instead of globally
    const coupleMap = new Map((allCouples ?? []).map(c => [c.id, c]));
    
    function buildCluePoolForTable(hostCoupleId: string, courseType: string): string[] {
      const facts: string[] = [];
      // Add host's fun facts
      const host = coupleMap.get(hostCoupleId);
      if (host) {
        facts.push(...funFactsToStrings(host.invited_fun_facts));
        facts.push(...funFactsToStrings(host.partner_fun_facts));
      }
      // Add guests' fun facts
      const guestIds = hostCourseGuestLookup.get(hostCoupleId)?.get(courseType) ?? [];
      for (const guestId of guestIds) {
        const guest = coupleMap.get(guestId);
        if (guest) {
          facts.push(...funFactsToStrings(guest.invited_fun_facts));
          facts.push(...funFactsToStrings(guest.partner_fun_facts));
        }
      }
      // Shuffle
      return facts.sort(() => Math.random() - 0.5);
    }
    
    // 7. Build response for each course
    const courses: CourseEnvelopeStatus[] = [];
    
    for (const courseType of ['starter', 'main', 'dessert'] as Course[]) {
      const envelope = envelopes?.find(e => e.course === courseType) as EnvelopeWithHost | undefined;
      
      if (!envelope) {
        // No envelope for this course yet
        courses.push({
          type: courseType,
          state: 'LOCKED',
          clues: [],
          clue_pool: null,
          street: null,
          number: null,
          full_address: null,
          next_reveal: null,
          starts_at: getCourseStartTime(event, courseType),
          host_names: null,
          allergies_summary: null,
          is_self_host: false,
          host_has_fun_facts: false,
          cycling_meters: null,
          dessert_stats: null,
          afterparty_practical: null,
          afterparty_location: null,
        });
        continue;
      }
      
      // Calculate current state
      const state = calculateState(envelope, now);
      
      // Get clues for this host + course
      const hostClues = courseClues?.find(
        c => c.couple_id === envelope.host_couple_id && c.course_type === courseType
      );
      
      // Get street info for host
      const hostStreetInfo = streetInfos?.find(
        s => s.couple_id === envelope.host_couple_id
      );
      
      // Build revealed clues based on state
      const revealedClues = getRevealedClues(
        envelope,
        hostClues?.clue_indices ?? [],
        envelope.host_couple,
        state,
        now
      );
      
      // Check if host has fun facts
      const hostHasFunFacts = countFunFacts(envelope.host_couple?.invited_fun_facts) > 0 
        || countFunFacts(envelope.host_couple?.partner_fun_facts) > 0;
      
      // Clue pool: show all participants' clues at CLUE_1 for starter/main (not dessert, not self-host)
      const isSelfHost = envelope.host_couple_id === coupleId;
      const showCluePool = state === 'CLUE_1' && courseType !== 'dessert' && !isSelfHost;
      
      // Dessert-specific: calculate stats and afterparty info
      const isDessert = courseType === 'dessert';
      const totalCouples = allCouples?.length ?? 0;
      
      // Calculate total cycling distance (rough estimate: sum all envelopes)
      const totalDistanceKm = Math.round(((envelopes?.reduce(
        (sum, e) => sum + (e.cycling_distance_km ?? 0),
        0
      ) ?? 0) * 10)) / 10;
      
      // Estimate vegetarian dishes from actual dietary preferences if available
      const isVegetarian = (allergies: unknown) =>
        Array.isArray(allergies) && allergies.some(a =>
          typeof a === 'string' && /vegetarisk|vegetarian|vegan/.test(a.toLowerCase())
        );
      const hasDietaryData = (allCouples ?? []).some(c =>
        Array.isArray(c.invited_allergies) || Array.isArray(c.partner_allergies) || Array.isArray(c.replacement_allergies)
      );
      const vegetarianPeople = (allCouples ?? []).reduce((sum, c) => {
        let count = 0;
        if (isVegetarian(c.invited_allergies)) count++;
        if (c.partner_name && isVegetarian(c.partner_allergies)) count++;
        if (isVegetarian(c.replacement_allergies)) count++;
        return sum + count;
      }, 0);
      const vegetarianDishes = hasDietaryData ? vegetarianPeople : Math.floor(totalCouples * 0.3);
      
      // Afterparty cycling time from this couple's location
      const afterpartyCyclingMin = estimateCyclingMinutes(envelope.cycling_distance_km) ?? 10;
      
      // Build course status
      const courseStatus: CourseEnvelopeStatus = {
        type: courseType,
        state,
        clues: revealedClues,
        clue_pool: showCluePool ? buildCluePoolForTable(envelope.host_couple_id!, courseType) : null,
        street: shouldShowStreet(state) && hostStreetInfo ? {
          name: hostStreetInfo.street_name ?? '',
          range: `${hostStreetInfo.number_range_low}-${hostStreetInfo.number_range_high}`,
          cycling_minutes: estimateCyclingMinutes(envelope.cycling_distance_km) ?? 0,
        } : null,
        number: shouldShowNumber(state) ? hostStreetInfo?.street_number ?? null : null,
        full_address: state === 'OPEN' ? {
          street: hostStreetInfo?.street_name ?? '',
          number: hostStreetInfo?.street_number ?? 0,
          apartment: hostStreetInfo?.apartment ?? null,
          door_code: hostStreetInfo?.door_code ?? null,
          city: hostStreetInfo?.city ?? '',
          coordinates: envelope.host_couple?.coordinates 
            ? { lat: envelope.host_couple.coordinates.y, lng: envelope.host_couple.coordinates.x }
            : null,
        } : null,
        next_reveal: getNextReveal(envelope, state, now),
        starts_at: getCourseStartTime(event, courseType),
        host_names: state === 'OPEN' ? [
          envelope.host_couple?.invited_name,
          envelope.host_couple?.partner_name,
        ].filter((n): n is string => !!n) : null,
        allergies_summary: isSelfHost && state !== 'LOCKED'
          ? getAllergiesSummary(envelope.host_couple_id, courseType, hostCourseGuestLookup, allCouples)
          : null,
        is_self_host: isSelfHost,
        host_has_fun_facts: hostHasFunFacts,
        cycling_meters: envelope.cycling_distance_km != null ? Math.round(envelope.cycling_distance_km * 1000) : null,
        // Dessert-specific reveals
        dessert_stats: isDessert && ['CLUE_1', 'CLUE_2', 'STREET', 'NUMBER', 'OPEN'].includes(state) ? {
          total_couples: totalCouples,
          total_distance_km: totalDistanceKm,
          total_dishes: totalCouples * 3, // 3 courses
          vegetarian_dishes: vegetarianDishes,
        } : null,
        afterparty_practical: isDessert && ['CLUE_2', 'STREET', 'NUMBER', 'OPEN'].includes(state) ? {
          time: event.afterparty_time ?? '21:00',
          door_code: event.afterparty_door_code ?? null,
          bring_own_drinks: event.afterparty_byob ?? true,
          notes: event.afterparty_notes ?? null,
        } : null,
        afterparty_location: isDessert && ['STREET', 'NUMBER', 'OPEN'].includes(state) ? {
          address: event.afterparty_location ?? 'TBA',
          host_names: event.afterparty_hosts?.split(',').map((n: string) => n.trim()) ?? [],
          cycling_minutes_sober: afterpartyCyclingMin,
          cycling_minutes_tipsy: Math.round(afterpartyCyclingMin * 1.5),
          cycling_minutes_drunk: Math.round(afterpartyCyclingMin * 2.5),
          coordinates: null, // TODO: add afterparty coordinates
        } : null,
      };
      
      courses.push(courseStatus);
    }
    
    // 8. Build afterparty status
    // Determine afterparty state: LOCKED → TEASING → REVEALED
    // Manual activation via afterparty_teasing_at / afterparty_revealed_at takes priority
    // Otherwise auto-calculate: TEASING = 30 min before afterparty_time, REVEALED = at afterparty_time
    const afterpartyTime = event.afterparty_time;
    let afterpartyState: AfterpartyState = 'LOCKED';
    
    if (event.afterparty_revealed_at && now >= new Date(event.afterparty_revealed_at)) {
      afterpartyState = 'REVEALED';
    } else if (event.afterparty_teasing_at && now >= new Date(event.afterparty_teasing_at)) {
      afterpartyState = 'TEASING';
    } else if (afterpartyTime && event.event_date) {
      // Auto-calculate based on afterparty_time
      const afterpartyDateTime = new Date(`${event.event_date}T${afterpartyTime}`);
      const teasingAutoTime = new Date(afterpartyDateTime.getTime() - 30 * 60 * 1000); // 30 min before
      if (now >= afterpartyDateTime) {
        afterpartyState = 'REVEALED';
      } else if (now >= teasingAutoTime) {
        afterpartyState = 'TEASING';
      }
    }

    // Get dessert envelope for cycling distance calculation to afterparty
    const dessertEnvelope = envelopes?.find(e => e.course === 'dessert') as EnvelopeWithHost | undefined;
    const dessertHostCoords = dessertEnvelope?.host_couple?.coordinates;
    const afterpartyCoords = event.afterparty_coordinates as { x: number; y: number } | null;
    let cyclingMinFromDessert: number | null = null;
    if (dessertHostCoords && afterpartyCoords) {
      // Simple distance estimate: haversine → cycling time
      const R = 6371;
      const dLat = (afterpartyCoords.y - dessertHostCoords.y) * Math.PI / 180;
      const dLon = (afterpartyCoords.x - dessertHostCoords.x) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(dessertHostCoords.y * Math.PI / 180) * Math.cos(afterpartyCoords.y * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distKm = R * c;
      cyclingMinFromDessert = Math.round(distKm * 4); // ~15 km/h
    }
    
    // Default messages if not set
    const defaultHostSelf = [
      { emoji: '👑', text: 'Psst... värden är faktiskt ganska fantastisk. (Det är du!)' },
      { emoji: '🪞', text: 'Ledtråd: Värden tittar på dig i spegeln varje morgon.' },
    ];
    const defaultLipsSealed = [
      { emoji: '🤫', text: 'Our lips are sealed — avslöjar vi en ledtråd kan ni gissa vem!' },
      { emoji: '🤐', text: 'Tyst som en mus — vi kan inte säga mer utan att avslöja!' },
    ];
    const defaultMysteryHost = [
      { emoji: '🎭', text: 'Dina värdar är ett mysterium! Vem kan det vara?' },
      { emoji: '✨', text: 'Överraskning väntar — vi avslöjar inget!' },
    ];
    
    const response: EnvelopeStatusResponse = {
      server_time: now.toISOString(),
      event_id: eventId,
      couple_id: coupleId,
      courses,
      afterparty: {
        state: afterpartyState,
        time: afterpartyTime?.slice(0, 5) ?? null,
        byob: event.afterparty_byob ?? false,
        notes: afterpartyState !== 'LOCKED' ? (event.afterparty_notes ?? null) : null,
        description: afterpartyState !== 'LOCKED' ? (event.afterparty_description ?? null) : null,
        // Only in REVEALED state
        location: afterpartyState === 'REVEALED' ? (event.afterparty_location ?? null) : null,
        door_code: afterpartyState === 'REVEALED' ? (event.afterparty_door_code ?? null) : null,
        host_names: afterpartyState === 'REVEALED' && event.afterparty_hosts
          ? event.afterparty_hosts.split(',').map((n: string) => n.trim())
          : [],
        coordinates: afterpartyState === 'REVEALED' && afterpartyCoords
          ? { lat: afterpartyCoords.y, lng: afterpartyCoords.x }
          : null,
        cycling_minutes_from_dessert: afterpartyState === 'REVEALED' ? cyclingMinFromDessert : null,
        // Timing info
        teasing_at: event.afterparty_teasing_at ?? null,
        revealed_at: event.afterparty_revealed_at ?? null,
      },
      messages: {
        host_self: event.host_self_messages?.length ? event.host_self_messages : defaultHostSelf,
        lips_sealed: event.lips_sealed_messages?.length ? event.lips_sealed_messages : defaultLipsSealed,
        mystery_host: event.mystery_host_messages?.length ? event.mystery_host_messages : defaultMysteryHost,
      },
    };
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Envelope status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Helper functions

function calculateState(envelope: EnvelopeWithHost, now: Date): EnvelopeState {
  // Check states in reverse order (most advanced first)
  if (envelope.opened_at && now >= new Date(envelope.opened_at)) return 'OPEN';
  if (envelope.number_at && now >= new Date(envelope.number_at)) return 'NUMBER';
  if (envelope.street_at && now >= new Date(envelope.street_at)) return 'STREET';
  if (envelope.clue_2_at && now >= new Date(envelope.clue_2_at)) return 'CLUE_2';
  if (envelope.clue_1_at && now >= new Date(envelope.clue_1_at)) return 'CLUE_1';
  if (envelope.teasing_at && now >= new Date(envelope.teasing_at)) return 'TEASING';
  return 'LOCKED';
}

function getCourseStartTime(event: { event_date: string; starter_time: string; main_time: string; dessert_time: string }, course: Course): string {
  const timeMap: Record<Course, string> = {
    starter: event.starter_time,
    main: event.main_time,
    dessert: event.dessert_time,
  };
  return `${event.event_date}T${timeMap[course]}`;
}

function estimateCyclingMinutes(distanceKm: number | null | undefined): number | null {
  if (distanceKm == null) return null;
  return Math.round(distanceKm * 4);
}

function shouldShowStreet(state: EnvelopeState): boolean {
  return ['STREET', 'NUMBER', 'OPEN'].includes(state);
}

function shouldShowNumber(state: EnvelopeState): boolean {
  return ['NUMBER', 'OPEN'].includes(state);
}

function getRevealedClues(
  envelope: EnvelopeWithHost,
  clueIndices: number[],
  hostCouple: EnvelopeWithHost['host_couple'],
  state: EnvelopeState,
  _now: Date
): RevealedClue[] {
  if (!hostCouple || !['CLUE_1', 'CLUE_2', 'STREET', 'NUMBER', 'OPEN'].includes(state)) {
    return [];
  }
  
  // Combine all fun facts
  const allFacts = [
    ...funFactsToStrings(hostCouple.invited_fun_facts),
    ...funFactsToStrings(hostCouple.partner_fun_facts),
  ];
  
  const clues: RevealedClue[] = [];
  
  // First clue
  if (clueIndices.length > 0 && clueIndices[0] < allFacts.length && envelope.clue_1_at) {
    clues.push({
      text: allFacts[clueIndices[0]],
      revealed_at: envelope.clue_1_at,
    });
  }
  
  // Second clue (only if state >= CLUE_2)
  if (
    ['CLUE_2', 'STREET', 'NUMBER', 'OPEN'].includes(state) &&
    clueIndices.length > 1 && 
    clueIndices[1] < allFacts.length && 
    envelope.clue_2_at
  ) {
    clues.push({
      text: allFacts[clueIndices[1]],
      revealed_at: envelope.clue_2_at,
    });
  }
  
  return clues;
}

function getNextReveal(envelope: EnvelopeWithHost, currentState: EnvelopeState, now: Date): NextReveal | null {
  if (currentState === 'OPEN') return null;
  
  const stateToTime: Record<EnvelopeState, string | null> = {
    LOCKED: envelope.teasing_at,
    TEASING: envelope.clue_1_at,
    CLUE_1: envelope.clue_2_at,
    CLUE_2: envelope.street_at,
    STREET: envelope.number_at,
    NUMBER: envelope.opened_at,
    OPEN: null,
  };
  
  const nextState = STATE_ORDER[STATE_ORDER.indexOf(currentState) + 1];
  const nextTime = stateToTime[currentState];
  
  if (!nextTime || !nextState) return null;
  
  const nextDate = new Date(nextTime);
  const inSeconds = Math.max(0, Math.floor((nextDate.getTime() - now.getTime()) / 1000));
  
  return {
    type: nextState,
    at: nextTime,
    in_seconds: inSeconds,
  };
}

function getAllergiesSummary(
  hostCoupleId: string | null,
  course: Course,
  hostCourseGuestLookup: Map<string, Map<string, string[]>>,
  allCouples: Array<{
    id: string;
    invited_name?: string | null;
    partner_name?: string | null;
    invited_allergies?: string[] | null;
    partner_allergies?: string[] | null;
    replacement_allergies?: string[] | null;
    invited_allergy_notes?: string | null;
    partner_allergy_notes?: string | null;
  }> | null
): string[] | null {
  if (!hostCoupleId) return null;

  const guestsByCourse = hostCourseGuestLookup.get(hostCoupleId);
  const guestIds = guestsByCourse?.get(course) ?? [];
  if (!guestIds.length || !allCouples?.length) return null;

  const couplesById = new Map(allCouples.map(c => [c.id, c]));
  const allergyCounts = new Map<string, number>();
  const notes = new Set<string>();

  const addAllergies = (items: unknown, count = 1) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (typeof item !== 'string') continue;
      const normalized = item.trim().toLowerCase();
      if (!normalized) continue;
      allergyCounts.set(normalized, (allergyCounts.get(normalized) ?? 0) + count);
    }
  };

  const addNote = (name: string | null | undefined, note: string | null | undefined) => {
    if (!note || !note.trim()) return;
    const prefix = name ? `${name}: ` : '';
    notes.add(`${prefix}${note.trim()}`);
  };

  for (const guestId of guestIds) {
    const guest = couplesById.get(guestId);
    if (!guest) continue;

    addAllergies(guest.invited_allergies, 1);
    addAllergies(guest.replacement_allergies, 1);
    addNote(guest.invited_name ?? null, guest.invited_allergy_notes ?? null);

    if (guest.partner_name) {
      addAllergies(guest.partner_allergies, 1);
      addNote(guest.partner_name ?? null, guest.partner_allergy_notes ?? null);
    }
  }

  const summary: string[] = [];
  const sortedAllergies = Array.from(allergyCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [allergy, count] of sortedAllergies) {
    const label = allergy.charAt(0).toUpperCase() + allergy.slice(1);
    summary.push(`${label} (${count} pers)`);
  }

  summary.push(...Array.from(notes));

  return summary.length ? summary : null;
}
