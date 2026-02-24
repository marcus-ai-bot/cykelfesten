/**
 * Envelope Timing Calculator
 * 
 * Calculates when each envelope state should activate based on:
 * - Event timing settings
 * - Course start time
 * - Cycling distance between current location and destination
 */

import type { Course, EventTiming, LiveEnvelope } from '@/types/database';

export interface CourseSchedule {
  course: Course;
  starts_at: Date;
}

export interface EnvelopeTimes {
  teasing_at: Date;
  clue_1_at: Date;
  clue_2_at: Date;
  street_at: Date;
  number_at: Date;
  opened_at: Date;
}

// Default timing if no event_timing record exists
export const DEFAULT_TIMING: Omit<EventTiming, 'id' | 'event_id' | 'created_at' | 'updated_at'> = {
  teasing_minutes_before: 360,  // 6h
  clue_1_minutes_before: 120,   // 2h
  clue_2_minutes_before: 30,    // 30min
  street_minutes_before: 15,    // 15min
  number_minutes_before: 5,     // 5min
  during_meal_clue_interval_minutes: 15,
  distance_adjustment_enabled: true,
};

/**
 * Calculate all envelope reveal times for a course
 */
/** Per-course timing overrides (JSONB from events.course_timing_offsets) */
export type CourseTimingOffsets = Partial<Record<Course, Partial<Pick<EventTiming,
  'teasing_minutes_before' | 'clue_1_minutes_before' | 'clue_2_minutes_before' |
  'street_minutes_before' | 'number_minutes_before'
>>>>;

export function calculateEnvelopeTimes(
  courseStartTime: Date,
  timing: Partial<EventTiming> = {},
  cyclingMinutes?: number,
  courseOffsets?: Partial<Pick<EventTiming,
    'teasing_minutes_before' | 'clue_1_minutes_before' | 'clue_2_minutes_before' |
    'street_minutes_before' | 'number_minutes_before'
  >>
): EnvelopeTimes {
  // Merge: global defaults → event timing → per-course overrides
  const t = { ...DEFAULT_TIMING, ...timing, ...courseOffsets };
  
  // Adjust street/number timing based on cycling distance
  let streetMinutes = t.street_minutes_before;
  let numberMinutes = t.number_minutes_before;
  
  if (t.distance_adjustment_enabled && cyclingMinutes) {
    // Longer distances need earlier reveals
    if (cyclingMinutes > 15) {
      // Very far: give lots of time
      streetMinutes = Math.max(streetMinutes, cyclingMinutes + 10);
      numberMinutes = Math.max(numberMinutes, cyclingMinutes);
    } else if (cyclingMinutes > 8) {
      // Medium distance
      streetMinutes = Math.max(streetMinutes, cyclingMinutes + 5);
      numberMinutes = Math.max(numberMinutes, cyclingMinutes - 3);
    }
    // Short distances: use default timing
  }
  
  return {
    teasing_at: subtractMinutes(courseStartTime, t.teasing_minutes_before),
    clue_1_at: subtractMinutes(courseStartTime, t.clue_1_minutes_before),
    clue_2_at: subtractMinutes(courseStartTime, t.clue_2_minutes_before),
    street_at: subtractMinutes(courseStartTime, streetMinutes),
    number_at: subtractMinutes(courseStartTime, numberMinutes),
    opened_at: courseStartTime,
  };
}

/**
 * Parse event course times into Date objects
 */
export function parseCourseSchedules(
  eventDate: string,
  starterTime: string,
  mainTime: string,
  dessertTime: string,
  timeOffsetMinutes: number = 0,
  afterpartyTime?: string | null
): Record<Course, Date> {
  const parseTime = (time: string): Date => {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + timeOffsetMinutes;
    const h = Math.floor(((totalMinutes % 1440) + 1440) % 1440 / 60);
    const m = ((totalMinutes % 60) + 60) % 60;
    // Determine Stockholm UTC offset (CET +01:00 or CEST +02:00) for this date
    // Use a probe date to check via Intl API (works on serverless/UTC environments)
    const probeUtc = new Date(`${eventDate}T12:00:00Z`);
    const utcHour = probeUtc.getUTCHours();
    const stockholmStr = probeUtc.toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: 'numeric', hour12: false });
    const stockholmHour = parseInt(stockholmStr);
    const offsetHours = stockholmHour - utcHour;
    const sign = offsetHours >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetHours);
    const offset = `${sign}${String(absOffset).padStart(2, '0')}:00`;
    return new Date(`${eventDate}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00${offset}`);
  };
  
  return {
    starter: parseTime(starterTime),
    main: parseTime(mainTime),
    dessert: parseTime(dessertTime),
    afterparty: parseTime(afterpartyTime ?? '22:00'),
  };
}

/**
 * Calculate cycling time adjustment thresholds
 */
export interface DistanceAdjustment {
  streetMinutesBefore: number;
  numberMinutesBefore: number;
}

export function getDistanceAdjustment(cyclingMinutes: number): DistanceAdjustment {
  if (cyclingMinutes > 15) {
    // Very far (>15 min cycle)
    return {
      streetMinutesBefore: cyclingMinutes + 10,
      numberMinutesBefore: cyclingMinutes,
    };
  } else if (cyclingMinutes > 8) {
    // Medium (8-15 min)
    return {
      streetMinutesBefore: cyclingMinutes + 5,
      numberMinutesBefore: Math.max(5, cyclingMinutes - 3),
    };
  } else if (cyclingMinutes > 3) {
    // Close (3-8 min)
    return {
      streetMinutesBefore: 15,
      numberMinutesBefore: 5,
    };
  } else {
    // Very close (<3 min)
    return {
      streetMinutesBefore: 10,
      numberMinutesBefore: 3,
    };
  }
}

/**
 * Format envelope times for database insert
 */
export function formatEnvelopeTimesForDb(times: EnvelopeTimes): {
  teasing_at: string;
  clue_1_at: string;
  clue_2_at: string;
  street_at: string;
  number_at: string;
  opened_at: string;
} {
  return {
    teasing_at: times.teasing_at.toISOString(),
    clue_1_at: times.clue_1_at.toISOString(),
    clue_2_at: times.clue_2_at.toISOString(),
    street_at: times.street_at.toISOString(),
    number_at: times.number_at.toISOString(),
    opened_at: times.opened_at.toISOString(),
  };
}

// Helpers

function subtractMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60 * 1000);
}
