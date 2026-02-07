/**
 * Living Envelope Status API
 * 
 * Returns the current state of all envelopes for a participant.
 * Backend controls all timing - client only displays what server sends.
 * 
 * GET /api/envelope/status?eventId=xxx&coupleId=yyy
 * 
 * Security: coupleId acts as a simple token. In production,
 * consider signed URLs or JWT for better security.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { 
  EnvelopeStatusResponse, 
  CourseEnvelopeStatus, 
  EnvelopeState,
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
  const coupleId = searchParams.get('coupleId');
  
  if (!eventId || !coupleId) {
    return NextResponse.json(
      { error: 'Missing eventId or coupleId' },
      { status: 400 }
    );
  }
  
  const supabase = await createClient();
  const now = new Date();
  
  try {
    // 1. Verify couple exists and belongs to event
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id, event_id')
      .eq('id', coupleId)
      .eq('event_id', eventId)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json(
        { error: 'Couple not found' },
        { status: 404 }
      );
    }
    
    // 2. Get event info (including custom messages)
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*, host_self_messages, lips_sealed_messages, mystery_host_messages')
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }
    
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
      .eq('match_plan_id', event.active_match_plan_id);
    
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
      const hostInvitedFacts = Array.isArray(envelope.host_couple?.invited_fun_facts) 
        ? envelope.host_couple.invited_fun_facts 
        : [];
      const hostPartnerFacts = Array.isArray(envelope.host_couple?.partner_fun_facts)
        ? envelope.host_couple.partner_fun_facts
        : [];
      const hostHasFunFacts = hostInvitedFacts.length > 0 || hostPartnerFacts.length > 0;
      
      // Build course status
      const courseStatus: CourseEnvelopeStatus = {
        type: courseType,
        state,
        clues: revealedClues,
        street: shouldShowStreet(state) && hostStreetInfo ? {
          name: hostStreetInfo.street_name ?? '',
          range: `${hostStreetInfo.number_range_low}-${hostStreetInfo.number_range_high}`,
          cycling_minutes: envelope.cycling_minutes ?? 0,
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
        allergies_summary: state === 'OPEN' 
          ? getAllergiesSummary(envelope.host_couple_id, coupleId) 
          : null,
        is_self_host: envelope.host_couple_id === coupleId,
        host_has_fun_facts: hostHasFunFacts,
        cycling_meters: envelope.cycling_minutes ? envelope.cycling_minutes * 250 : null, // ~250m per minute cycling
      };
      
      courses.push(courseStatus);
    }
    
    // 8. Build afterparty status
    const afterpartyRevealTime = event.dessert_time; // Reveal at dessert start
    const afterpartyState = now >= new Date(`${event.event_date}T${afterpartyRevealTime}`) 
      ? 'OPEN' as const 
      : 'LOCKED' as const;
    
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
        reveals_at: `${event.event_date}T${event.afterparty_time ?? event.dessert_time}`,
        location: afterpartyState === 'OPEN' ? event.afterparty_location : null,
        description: afterpartyState === 'OPEN' ? event.afterparty_description : null,
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
  const invitedFacts = Array.isArray(hostCouple.invited_fun_facts) 
    ? hostCouple.invited_fun_facts 
    : [];
  const partnerFacts = Array.isArray(hostCouple.partner_fun_facts)
    ? hostCouple.partner_fun_facts
    : [];
  const allFacts = [...invitedFacts, ...partnerFacts] as string[];
  
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

function getAllergiesSummary(hostCoupleId: string | null, guestCoupleId: string): string[] | null {
  // TODO: Implement - fetch all guests at this host and summarize allergies
  // For now, return null
  return null;
}
