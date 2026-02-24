/**
 * Matching Engine
 * 
 * Kärnan i Cykelfesten - fördelar par till rätter och matchar gäster till värdar.
 * 
 * Tvåstegsalgoritm:
 * - STEG A: Tilldela rätter (körs en gång, tillhör event)
 * - STEG B: Matcha gäster (kan köras om vid avhopp, tillhör match_plan)
 * - STEG C: Generera kuvert (automatiskt som del av STEG B)
 */

import { assignCourses } from './step-a';
import { matchGuestsToHosts } from './step-b';
import type { 
  Couple, 
  Assignment, 
  Course,
  MealCourse,
  StepAInput, 
  StepAOutput, 
  StepBInput, 
  StepBOutput,
  Event,
  MatchingWarning
} from '@/types/database';

export { assignCourses } from './step-a';
export { matchGuestsToHosts } from './step-b';
export { cascadeChanges } from './cascade';
export * from './policy';

/**
 * Full matching run - both Step A and Step B
 */
export interface FullMatchInput {
  event: Event;
  couples: Couple[];
  blocked_pairs?: [string, string][];
  match_plan_id: string;
}

export interface FullMatchOutput {
  stepA: StepAOutput;
  stepB: StepBOutput;
  warnings: MatchingWarning[];
}

export function runFullMatch(input: FullMatchInput): FullMatchOutput {
  const { event, couples, blocked_pairs = [], match_plan_id } = input;
  
  // Step A: Assign courses
  const stepAInput: StepAInput = {
    event_id: event.id,
    couples,
  };
  
  const stepA = assignCourses(stepAInput);
  
  // Convert step A assignments to full Assignment objects (without id/timestamps)
  const assignments: Assignment[] = stepA.assignments.map((a, i) => ({
    ...a,
    id: `temp-${i}`,
    created_at: new Date().toISOString(),
    notified_at: null,
  }));
  
  // Step B: Match guests to hosts
  const stepBInput: StepBInput = {
    event_id: event.id,
    match_plan_id,
    assignments,
    couples,
    blocked_pairs,
    frozen_courses: [],
  };
  
  const stepB = matchGuestsToHosts(stepBInput);
  
  // Combine warnings
  const warnings = [...stepB.warnings];
  
  if (stepA.stats.preference_satisfaction < 0.8) {
    warnings.push({
      type: 'preference',
      message: `Endast ${Math.round(stepA.stats.preference_satisfaction * 100)}% av preferenser uppfyllda`,
    });
  }
  
  return {
    stepA,
    stepB,
    warnings,
  };
}

/**
 * Re-match for dropouts (only Step B with frozen courses)
 */
export interface RematchInput {
  event: Event;
  couples: Couple[];
  assignments: Assignment[];
  blocked_pairs?: [string, string][];
  frozen_courses: MealCourse[];
  match_plan_id: string;
}

export function runRematch(input: RematchInput): StepBOutput {
  const { 
    event, 
    couples, 
    assignments, 
    blocked_pairs = [], 
    frozen_courses,
    match_plan_id 
  } = input;
  
  const stepBInput: StepBInput = {
    event_id: event.id,
    match_plan_id,
    assignments,
    couples,
    blocked_pairs,
    frozen_courses,
  };
  
  return matchGuestsToHosts(stepBInput);
}

/**
 * Update envelope times based on event schedule
 */
export function setEnvelopeTimes(
  envelopes: StepBOutput['envelopes'],
  event: Event
): StepBOutput['envelopes'] {
  const courseTimeMap: Record<Course, string> = {
    starter: event.starter_time,
    main: event.main_time,
    dessert: event.dessert_time,
    afterparty: event.afterparty_time ?? '22:00:00',
  };
  
  const eventDate = new Date(event.event_date);
  const offsetMinutes = event.time_offset_minutes || 0;
  
  return envelopes.map(env => {
    const timeStr = courseTimeMap[env.course];
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // Create scheduled time
    const scheduledAt = new Date(eventDate);
    scheduledAt.setHours(hours, minutes + offsetMinutes, 0, 0);
    
    // Subtract envelope_hours_before
    scheduledAt.setHours(scheduledAt.getHours() - event.envelope_hours_before);
    
    return {
      ...env,
      scheduled_at: scheduledAt.toISOString(),
    };
  });
}
