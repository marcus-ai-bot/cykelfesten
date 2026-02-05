/**
 * STEG B: Matcha gäster till värdar
 * 
 * För varje rätt, fördela gäster till värdar med hänsyn till constraints.
 * Kan köras om vid avhopp (ny match_plan version).
 * 
 * Hard Constraints:
 * 1. Kapacitet - varje värd har max_guests
 * 2. Ingen hos sig själv - värdar äter inte hemma
 * 3. Blockade par - får aldrig mötas
 * 4. Unika möten - samma par träffas max 1 gång per kväll
 * 
 * Soft Constraints:
 * - Jämn fördelning
 */

import type { Assignment, Couple, Course, StepBInput, StepBOutput, MatchingWarning, CoursePairing, Envelope } from '@/types/database';

const COURSES: Course[] = ['starter', 'main', 'dessert'];

interface HostSlot {
  coupleId: string;
  address: string;
  addressNotes: string | null;
  maxGuests: number;
  assignedGuests: string[];
  assignedPersons: number;
}

export function matchGuestsToHosts(input: StepBInput): StepBOutput {
  const { 
    event_id, 
    match_plan_id, 
    assignments, 
    couples, 
    blocked_pairs,
    frozen_courses 
  } = input;
  
  const warnings: MatchingWarning[] = [];
  const allPairings: StepBOutput['course_pairings'] = [];
  const allEnvelopes: StepBOutput['envelopes'] = [];
  
  // Build lookup maps
  const coupleMap = new Map(couples.filter(c => !c.cancelled).map(c => [c.id, c]));
  const assignmentMap = new Map(assignments.map(a => [a.couple_id, a]));
  
  // Track meetings across courses for uniqueness constraint
  const meetingCounts = new Map<string, number>(); // "id1:id2" -> count
  
  // Build blocked pairs set (bidirectional)
  const blockedSet = new Set<string>();
  for (const [a, b] of blocked_pairs) {
    blockedSet.add(`${a}:${b}`);
    blockedSet.add(`${b}:${a}`);
  }
  
  // Helper to check if two couples are blocked
  const isBlocked = (a: string, b: string) => blockedSet.has(`${a}:${b}`);
  
  // Helper to get meeting key (sorted for consistency)
  const getMeetingKey = (a: string, b: string) => 
    a < b ? `${a}:${b}` : `${b}:${a}`;
  
  // Helper to check if adding a meeting would violate uniqueness
  const wouldViolateUniqueness = (coupleId: string, hostId: string, existingGuests: string[]) => {
    // Check meeting with host
    const hostKey = getMeetingKey(coupleId, hostId);
    if ((meetingCounts.get(hostKey) || 0) >= 1) return true;
    
    // Check meetings with existing guests
    for (const guestId of existingGuests) {
      const guestKey = getMeetingKey(coupleId, guestId);
      if ((meetingCounts.get(guestKey) || 0) >= 1) return true;
    }
    
    return false;
  };
  
  // Process each course
  for (const course of COURSES) {
    // Skip frozen courses (copy existing pairings - handled externally)
    if (frozen_courses.includes(course)) {
      warnings.push({
        type: 'capacity',
        message: `Rätten ${course} är fryst och kan inte ändras`,
      });
      continue;
    }
    
    // Get hosts for this course (those assigned to cook this course)
    const hostAssignments = assignments.filter(a => a.course === course && a.is_host);
    
    // Get guests for this course (everyone NOT cooking this course)
    const guestCoupleIds = [...coupleMap.keys()].filter(id => {
      const assignment = assignmentMap.get(id);
      return assignment && assignment.course !== course;
    });
    
    // Initialize host slots
    const hostSlots: HostSlot[] = hostAssignments.map(a => {
      const couple = coupleMap.get(a.couple_id)!;
      return {
        coupleId: a.couple_id,
        address: couple.address,
        addressNotes: couple.address_notes,
        maxGuests: a.max_guests,
        assignedGuests: [],
        assignedPersons: 0,
      };
    });
    
    // Sort guests randomly for fair distribution
    const shuffledGuests = [...guestCoupleIds].sort(() => Math.random() - 0.5);
    
    // Assign guests to hosts
    for (const guestId of shuffledGuests) {
      const guest = coupleMap.get(guestId)!;
      
      // Find best host for this guest
      let bestHost: HostSlot | null = null;
      let bestScore = -Infinity;
      
      for (const host of hostSlots) {
        // Hard constraint: capacity
        if (host.assignedPersons + guest.person_count > host.maxGuests) continue;
        
        // Hard constraint: no eating at own place
        if (host.coupleId === guestId) continue;
        
        // Hard constraint: blocked pairs
        if (isBlocked(guestId, host.coupleId)) continue;
        if (host.assignedGuests.some(g => isBlocked(guestId, g))) continue;
        
        // Hard constraint: unique meetings
        if (wouldViolateUniqueness(guestId, host.coupleId, host.assignedGuests)) continue;
        
        // Score: prefer less-filled hosts (load balancing)
        const fillRatio = host.assignedPersons / host.maxGuests;
        const score = -fillRatio; // Lower fill = higher score
        
        if (score > bestScore) {
          bestScore = score;
          bestHost = host;
        }
      }
      
      if (bestHost) {
        bestHost.assignedGuests.push(guestId);
        bestHost.assignedPersons += guest.person_count;
        
        // Record meetings for uniqueness tracking
        // Meeting with host
        const hostKey = getMeetingKey(guestId, bestHost.coupleId);
        meetingCounts.set(hostKey, (meetingCounts.get(hostKey) || 0) + 1);
        
        // Meetings with other guests at same venue
        for (const otherGuestId of bestHost.assignedGuests) {
          if (otherGuestId !== guestId) {
            const guestKey = getMeetingKey(guestId, otherGuestId);
            meetingCounts.set(guestKey, (meetingCounts.get(guestKey) || 0) + 1);
          }
        }
      } else {
        warnings.push({
          type: 'capacity',
          message: `Kunde inte placera ${guest.invited_name} för ${course}`,
          couple_ids: [guestId],
        });
      }
    }
    
    // Generate pairings and envelopes
    for (const host of hostSlots) {
      for (const guestId of host.assignedGuests) {
        allPairings.push({
          match_plan_id,
          course,
          host_couple_id: host.coupleId,
          guest_couple_id: guestId,
        });
      }
      
      // Envelopes for guests
      for (const guestId of host.assignedGuests) {
        allEnvelopes.push({
          match_plan_id,
          couple_id: guestId,
          course,
          host_couple_id: host.coupleId,
          destination_address: host.address,
          destination_notes: host.addressNotes,
          scheduled_at: new Date().toISOString(), // Will be set properly based on event times
        });
      }
      
      // Envelope for host (they stay home, but still get envelope for info)
      allEnvelopes.push({
        match_plan_id,
        couple_id: host.coupleId,
        course,
        host_couple_id: host.coupleId,
        destination_address: host.address,
        destination_notes: 'Du är värd! Dina gäster kommer till dig.',
        scheduled_at: new Date().toISOString(),
      });
    }
  }
  
  // Validate uniqueness constraint
  for (const [key, count] of meetingCounts) {
    if (count > 1) {
      const [a, b] = key.split(':');
      const coupleA = coupleMap.get(a);
      const coupleB = coupleMap.get(b);
      warnings.push({
        type: 'unique_meeting',
        message: `${coupleA?.invited_name || a} och ${coupleB?.invited_name || b} träffas ${count} gånger`,
        couple_ids: [a, b],
      });
    }
  }
  
  // Calculate stats
  const totalCouples = coupleMap.size;
  const matchedCouples = new Set(allPairings.flatMap(p => [p.host_couple_id, p.guest_couple_id])).size;
  
  const totalCapacity = assignments.filter(a => a.is_host).reduce((sum, a) => sum + a.max_guests, 0);
  const totalAssigned = allPairings.reduce((sum, p) => {
    const guest = coupleMap.get(p.guest_couple_id);
    return sum + (guest?.person_count || 0);
  }, 0);
  
  return {
    course_pairings: allPairings,
    envelopes: allEnvelopes,
    warnings,
    stats: {
      couples_matched: matchedCouples,
      capacity_utilization: totalCapacity > 0 
        ? Math.round((totalAssigned / totalCapacity) * 100) / 100 
        : 0,
    },
  };
}
