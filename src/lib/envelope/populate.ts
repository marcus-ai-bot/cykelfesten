/**
 * Populate Living Envelope Data
 * 
 * Called after matching to:
 * 1. Allocate clues for each host/course combination
 * 2. Calculate reveal times based on cycling distance
 * 3. Generate records for course_clues, street_info, and envelope times
 */

import type { 
  Course, 
  Couple, 
  EventTiming, 
  CourseClues,
  StreetInfo,
  LiveEnvelope,
  CoursePairing,
} from '@/types/database';
import { 
  allocateClueIndices, 
  combineFunFacts,
} from './clues';
import { 
  calculateEnvelopeTimes, 
  parseCourseSchedules,
  DEFAULT_TIMING,
} from './timing';

export interface PopulateInput {
  event: {
    id: string;
    event_date: string;
    starter_time: string;
    main_time: string;
    dessert_time: string;
    time_offset_minutes: number;
  };
  couples: Couple[];
  pairings: Pick<CoursePairing, 'course' | 'host_couple_id' | 'guest_couple_id'>[];
  envelopes: Pick<LiveEnvelope, 'couple_id' | 'course' | 'host_couple_id'>[];
  timing?: Partial<EventTiming>;
  cyclingDistances?: Map<string, number>; // "fromId:toId" -> minutes
}

export interface PopulateOutput {
  courseClues: Omit<CourseClues, 'id' | 'allocated_at'>[];
  streetInfos: Omit<StreetInfo, 'id' | 'created_at'>[];
  envelopeUpdates: {
    couple_id: string;
    course: Course;
    teasing_at: string;
    clue_1_at: string;
    clue_2_at: string;
    street_at: string;
    number_at: string;
    opened_at: string;
    cycling_minutes: number | null;
  }[];
}

/**
 * Main function to populate all living envelope data
 */
export function populateLivingEnvelopeData(input: PopulateInput): PopulateOutput {
  const { event, couples, pairings, envelopes, timing = {}, cyclingDistances } = input;
  
  const coupleMap = new Map(couples.map(c => [c.id, c]));
  
  // Get course start times
  const courseStartTimes = parseCourseSchedules(
    event.event_date,
    event.starter_time,
    event.main_time,
    event.dessert_time,
    event.time_offset_minutes
  );
  
  // 1. Allocate clues for each unique host
  const hostIds = [...new Set(pairings.map(p => p.host_couple_id))];
  const courseClues: PopulateOutput['courseClues'] = [];
  
  for (const hostId of hostIds) {
    const host = coupleMap.get(hostId);
    if (!host) continue;
    
    const allFacts = combineFunFacts({
      invited_fun_facts: host.invited_fun_facts,
      partner_fun_facts: host.partner_fun_facts,
    });
    
    const allocation = allocateClueIndices(allFacts.length);
    
    // Create records for each course this host serves
    const hostCourses = [...new Set(
      pairings
        .filter(p => p.host_couple_id === hostId)
        .map(p => p.course)
    )];
    
    for (const course of hostCourses) {
      courseClues.push({
        couple_id: hostId,
        course_type: course,
        clue_indices: allocation[course],
      });
    }
  }
  
  // 2. Parse addresses into street_info
  const streetInfos: PopulateOutput['streetInfos'] = [];
  
  for (const hostId of hostIds) {
    const host = coupleMap.get(hostId);
    if (!host) continue;
    
    const parsed = parseAddress(host.address);
    
    streetInfos.push({
      couple_id: hostId,
      street_name: parsed.streetName,
      street_number: parsed.streetNumber,
      apartment: parsed.apartment,
      postal_code: parsed.postalCode,
      city: parsed.city,
      number_range_low: parsed.rangeLow,
      number_range_high: parsed.rangeHigh,
      door_code: null, // Would need to be entered separately
    });
  }
  
  // 3. Calculate envelope times for each guest
  const envelopeUpdates: PopulateOutput['envelopeUpdates'] = [];
  
  for (const envelope of envelopes) {
    const { couple_id, course, host_couple_id } = envelope;
    
    // Skip host's own envelope (they know where they live)
    if (couple_id === host_couple_id) {
      // Still set times for consistency
      const times = calculateEnvelopeTimes(
        courseStartTimes[course],
        { ...DEFAULT_TIMING, ...timing },
        0 // No cycling needed
      );
      
      envelopeUpdates.push({
        couple_id,
        course,
        teasing_at: times.teasing_at.toISOString(),
        clue_1_at: times.clue_1_at.toISOString(),
        clue_2_at: times.clue_2_at.toISOString(),
        street_at: times.street_at.toISOString(),
        number_at: times.number_at.toISOString(),
        opened_at: times.opened_at.toISOString(),
        cycling_minutes: 0,
      });
      continue;
    }
    
    // Get cycling distance if available
    let cyclingMinutes: number | null = null;
    if (cyclingDistances && host_couple_id) {
      const key1 = `${couple_id}:${host_couple_id}`;
      const key2 = `${host_couple_id}:${couple_id}`;
      cyclingMinutes = cyclingDistances.get(key1) ?? cyclingDistances.get(key2) ?? null;
    }
    
    // Calculate times with distance adjustment
    const times = calculateEnvelopeTimes(
      courseStartTimes[course],
      { ...DEFAULT_TIMING, ...timing },
      cyclingMinutes ?? undefined
    );
    
    envelopeUpdates.push({
      couple_id,
      course,
      teasing_at: times.teasing_at.toISOString(),
      clue_1_at: times.clue_1_at.toISOString(),
      clue_2_at: times.clue_2_at.toISOString(),
      street_at: times.street_at.toISOString(),
      number_at: times.number_at.toISOString(),
      opened_at: times.opened_at.toISOString(),
      cycling_minutes: cyclingMinutes,
    });
  }
  
  return {
    courseClues,
    streetInfos,
    envelopeUpdates,
  };
}

/**
 * Parse Swedish address into components
 */
interface ParsedAddress {
  streetName: string | null;
  streetNumber: number | null;
  apartment: string | null;
  postalCode: string | null;
  city: string | null;
  rangeLow: number | null;
  rangeHigh: number | null;
}

function parseAddress(address: string): ParsedAddress {
  // Swedish address patterns:
  // "Storgatan 14" 
  // "Storgatan 14, 941 33 Piteå"
  // "Storgatan 14 lgh 1102, 941 33 Piteå"
  // "Storgatan 14B"
  
  const result: ParsedAddress = {
    streetName: null,
    streetNumber: null,
    apartment: null,
    postalCode: null,
    city: null,
    rangeLow: null,
    rangeHigh: null,
  };
  
  if (!address) return result;
  
  // Split on comma for parts
  const parts = address.split(',').map(p => p.trim());
  
  // First part: street + number (+ apartment)
  const streetPart = parts[0];
  
  // Match "Storgatan 14" or "Storgatan 14B" or "Storgatan 14 lgh 1102"
  const streetMatch = streetPart.match(/^(.+?)\s+(\d+[A-Za-z]?)\s*(lgh\s*.+)?$/i);
  
  if (streetMatch) {
    result.streetName = streetMatch[1].trim();
    result.streetNumber = parseInt(streetMatch[2], 10);
    if (streetMatch[3]) {
      result.apartment = streetMatch[3].trim();
    }
    
    // Calculate range (±5, rounded to nearest 10)
    if (result.streetNumber) {
      const base = Math.floor(result.streetNumber / 10) * 10;
      result.rangeLow = Math.max(1, base);
      result.rangeHigh = base + 10;
    }
  } else {
    // Fallback: use whole string as street name
    result.streetName = streetPart;
  }
  
  // Second part: postal code + city
  if (parts.length > 1) {
    const postalPart = parts[1];
    const postalMatch = postalPart.match(/^(\d{3}\s?\d{2})\s*(.+)?$/);
    
    if (postalMatch) {
      result.postalCode = postalMatch[1].replace(/\s/g, '');
      result.city = postalMatch[2]?.trim() || null;
    } else {
      result.city = postalPart;
    }
  }
  
  // Check for apartment in later parts
  for (let i = 1; i < parts.length; i++) {
    const lghMatch = parts[i].match(/lgh\s*(.+)/i);
    if (lghMatch && !result.apartment) {
      result.apartment = `lgh ${lghMatch[1].trim()}`;
    }
  }
  
  return result;
}
