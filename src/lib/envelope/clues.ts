/**
 * Clue Allocation System
 * 
 * Distributes fun facts across courses to prevent spoilers.
 * 
 * Privacy model:
 * - Each host provides 6+ fun facts
 * - Different guests see different facts for the same host
 * - Prevents "I already heard that clue at my previous stop" spoilers
 */

import type { Course, CourseClues } from '@/types/database';

export interface FunFactsInput {
  invited_fun_facts: string[] | null;
  partner_fun_facts: string[] | null;
}

export interface AllocatedClues {
  starter: number[];  // Indices into combined facts array
  main: number[];
  dessert: number[];
}

/**
 * Combine all fun facts from a couple into a single array
 */
export function combineFunFacts(couple: FunFactsInput): string[] {
  const invited = Array.isArray(couple.invited_fun_facts) 
    ? couple.invited_fun_facts 
    : [];
  const partner = Array.isArray(couple.partner_fun_facts)
    ? couple.partner_fun_facts
    : [];
  
  return [...invited, ...partner];
}

/**
 * Allocate clue indices to each course
 * 
 * Strategy:
 * - If 6+ facts: indices 0-1 → starter, 2-3 → main, 4-5 → dessert
 * - If 4-5 facts: distribute evenly, some overlap allowed
 * - If <4 facts: use fallback clues
 */
export function allocateClueIndices(totalFacts: number): AllocatedClues {
  if (totalFacts >= 6) {
    // Ideal case: unique clues per course
    return {
      starter: [0, 1],
      main: [2, 3],
      dessert: [4, 5],
    };
  }
  
  if (totalFacts >= 4) {
    // Some overlap, but still usable
    return {
      starter: [0, 1],
      main: [2, totalFacts > 4 ? 3 : 0],
      dessert: [totalFacts - 2, totalFacts - 1],
    };
  }
  
  if (totalFacts >= 2) {
    // Minimal facts, significant overlap
    return {
      starter: [0],
      main: [totalFacts > 2 ? 1 : 0],
      dessert: [totalFacts - 1],
    };
  }
  
  if (totalFacts === 1) {
    // Only one fact, use for all
    return {
      starter: [0],
      main: [0],
      dessert: [0],
    };
  }
  
  // No facts at all
  return {
    starter: [],
    main: [],
    dessert: [],
  };
}

/**
 * Generate fallback clues when host hasn't provided enough fun facts
 */
export interface FallbackClueContext {
  hostNames: string[];
  cyclingMinutes?: number;
  birthYears?: (number | null)[];
}

export function generateFallbackClues(context: FallbackClueContext): string[] {
  const clues: string[] = [];
  
  // Age-based clue
  const validBirthYears = (context.birthYears ?? []).filter((y): y is number => y !== null);
  if (validBirthYears.length > 0) {
    const avgYear = Math.round(validBirthYears.reduce((a, b) => a + b, 0) / validBirthYears.length);
    const decade = Math.floor(avgYear / 10) * 10;
    clues.push(`Värden är ${decade}-talist`);
  }
  
  // Distance-based clue
  if (context.cyclingMinutes) {
    if (context.cyclingMinutes < 5) {
      clues.push(`Ni bor nära varandra – under 5 minuters cykelväg`);
    } else if (context.cyclingMinutes < 10) {
      clues.push(`En kort cykeltur dit – under 10 minuter`);
    } else {
      clues.push(`${context.cyclingMinutes} minuters cykelväg dit`);
    }
  }
  
  // Name-based clues (initials)
  if (context.hostNames.length > 0) {
    const initials = context.hostNames
      .filter(n => n)
      .map(n => n.charAt(0).toUpperCase())
      .join(' & ');
    if (initials) {
      clues.push(`Värdarna har initialerna ${initials}`);
    }
  }
  
  // Generic fallbacks
  clues.push(`Värden älskar god mat`);
  clues.push(`Ni kommer trivas hos dem`);
  
  return clues;
}

/**
 * Get the clues to show for a specific course
 */
export function getCluesForCourse(
  allFacts: string[],
  allocation: AllocatedClues,
  course: Course,
  fallbackContext?: FallbackClueContext
): string[] {
  const indices = allocation[course];
  
  // Get allocated clues
  const clues = indices
    .filter(i => i >= 0 && i < allFacts.length)
    .map(i => allFacts[i]);
  
  // If we don't have enough clues, add fallbacks
  if (clues.length < 2 && fallbackContext) {
    const fallbacks = generateFallbackClues(fallbackContext);
    while (clues.length < 2 && fallbacks.length > 0) {
      clues.push(fallbacks.shift()!);
    }
  }
  
  return clues;
}

/**
 * Prepare course_clues records for database insert
 */
export function prepareClueRecords(
  coupleId: string,
  allocation: AllocatedClues
): Omit<CourseClues, 'id' | 'allocated_at'>[] {
  return [
    { couple_id: coupleId, course_type: 'starter' as Course, clue_indices: allocation.starter },
    { couple_id: coupleId, course_type: 'main' as Course, clue_indices: allocation.main },
    { couple_id: coupleId, course_type: 'dessert' as Course, clue_indices: allocation.dessert },
  ];
}

/**
 * Validate that a host has enough fun facts for unique clues
 */
export interface ClueValidation {
  isValid: boolean;
  totalFacts: number;
  missingCount: number;
  message: string;
}

export function validateFunFacts(couple: FunFactsInput): ClueValidation {
  const facts = combineFunFacts(couple);
  const minRequired = 6;
  
  if (facts.length >= minRequired) {
    return {
      isValid: true,
      totalFacts: facts.length,
      missingCount: 0,
      message: `✅ ${facts.length} fun facts registrerade`,
    };
  }
  
  return {
    isValid: false,
    totalFacts: facts.length,
    missingCount: minRequired - facts.length,
    message: `⚠️ Behöver ${minRequired - facts.length} till för unika ledtrådar`,
  };
}
