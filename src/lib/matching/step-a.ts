/**
 * STEG A: Tilldela rätter
 * 
 * Varje par tilldelas en rätt (förrätt/huvudrätt/efterrätt) de ska laga.
 * Detta körs EN gång och tillhör eventet (inte match_plan).
 * 
 * Hard Constraints:
 * - Tillräcklig kapacitet per rätt
 * 
 * Soft Constraints:
 * - Respektera rättpreferenser
 */

import type { Couple, Course, StepAInput, StepAOutput } from '@/types/database';

const COURSES: Course[] = ['starter', 'main', 'dessert'];
const DEFAULT_MAX_GUESTS = 6;

interface CourseStats {
  hosts: number;
  totalCapacity: number;
  guestPersons: number;
  couples: string[];
}

export function assignCourses(input: StepAInput): StepAOutput {
  const { event_id, couples } = input;
  
  // Filter out cancelled couples
  const activeCouples = couples.filter(c => !c.cancelled);
  
  if (activeCouples.length < 3) {
    throw new Error('Minst 3 par krävs för att köra matchning');
  }
  
  // Calculate total persons and required capacity
  const totalPersons = activeCouples.reduce((sum, c) => sum + c.person_count, 0);
  const avgPersonsPerCourse = totalPersons / 3;
  
  // Initialize course stats
  const courseStats: Record<Course, CourseStats> = {
    starter: { hosts: 0, totalCapacity: 0, guestPersons: 0, couples: [] },
    main: { hosts: 0, totalCapacity: 0, guestPersons: 0, couples: [] },
    dessert: { hosts: 0, totalCapacity: 0, guestPersons: 0, couples: [] },
  };
  
  // Separate couples by preference
  const withPreference: Couple[] = [];
  const withoutPreference: Couple[] = [];
  
  for (const couple of activeCouples) {
    if (couple.course_preference && COURSES.includes(couple.course_preference)) {
      withPreference.push(couple);
    } else {
      withoutPreference.push(couple);
    }
  }
  
  // Target: roughly equal distribution
  const targetCouplesPerCourse = Math.ceil(activeCouples.length / 3);
  
  // Phase 1: Assign couples with preferences
  let preferenceSatisfied = 0;
  
  for (const couple of withPreference) {
    const preferred = couple.course_preference as Course;
    const stats = courseStats[preferred];
    
    // Check if we can add to preferred course
    if (stats.hosts < targetCouplesPerCourse + 1) {
      stats.hosts++;
      stats.totalCapacity += DEFAULT_MAX_GUESTS;
      stats.couples.push(couple.id);
      preferenceSatisfied++;
    } else {
      // Overflow to no-preference pool
      withoutPreference.push(couple);
    }
  }
  
  // Phase 2: Distribute remaining couples to balance
  // Sort by least-filled course first
  for (const couple of withoutPreference) {
    const courseNeedingMore = COURSES
      .map(c => ({ course: c, count: courseStats[c].hosts }))
      .sort((a, b) => a.count - b.count)[0].course;
    
    const stats = courseStats[courseNeedingMore];
    stats.hosts++;
    stats.totalCapacity += DEFAULT_MAX_GUESTS;
    stats.couples.push(couple.id);
  }
  
  // Calculate guest persons per course
  // Guests for course X = everyone NOT hosting course X
  for (const course of COURSES) {
    const hostsInThisCourse = new Set(courseStats[course].couples);
    courseStats[course].guestPersons = activeCouples
      .filter(c => !hostsInThisCourse.has(c.id))
      .reduce((sum, c) => sum + c.person_count, 0);
  }
  
  // Validate capacity constraint
  for (const course of COURSES) {
    const stats = courseStats[course];
    if (stats.totalCapacity < stats.guestPersons) {
      throw new Error(
        `Otillräcklig kapacitet för ${course}: ` +
        `${stats.totalCapacity} kapacitet < ${stats.guestPersons} gäster. ` +
        `Öka antal värdar eller max_guests.`
      );
    }
  }
  
  // Build assignments
  const assignments: StepAOutput['assignments'] = [];
  
  for (const course of COURSES) {
    for (const coupleId of courseStats[course].couples) {
      assignments.push({
        event_id,
        couple_id: coupleId,
        course,
        is_host: true,
        max_guests: DEFAULT_MAX_GUESTS,
        is_flex_host: false,
        flex_extra_capacity: 4,
        is_emergency_host: false,
      });
    }
  }
  
  // Calculate stats
  const totalWithPreference = withPreference.length;
  const preferenceSatisfaction = totalWithPreference > 0
    ? preferenceSatisfied / totalWithPreference
    : 1;
  
  return {
    assignments,
    stats: {
      preference_satisfaction: Math.round(preferenceSatisfaction * 100) / 100,
      capacity_per_course: {
        starter: courseStats.starter.totalCapacity,
        main: courseStats.main.totalCapacity,
        dessert: courseStats.dessert.totalCapacity,
      },
    },
  };
}
