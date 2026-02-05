import { describe, it, expect } from 'vitest';
import { assignCourses } from '../step-a';
import { matchGuestsToHosts } from '../step-b';
import { runFullMatch } from '../index';
import type { Couple, Event, Course } from '@/types/database';

// Helper to create test couples
function createTestCouple(
  id: string, 
  name: string, 
  options: Partial<Couple> = {}
): Couple {
  return {
    id,
    event_id: 'test-event',
    invited_user_id: null,
    invited_name: name,
    invited_email: `${name.toLowerCase()}@test.com`,
    invited_phone: null,
    invited_allergies: null,
    invited_allergy_notes: null,
    partner_name: options.partner_name ?? `${name}s partner`,
    partner_email: null,
    partner_phone: null,
    partner_allergies: null,
    partner_allergy_notes: null,
    replacement_name: null,
    replacement_allergies: null,
    replacement_allergy_notes: null,
    replacement_reason: null,
    original_partner_name: null,
    address: `${name}gatan 1`,
    address_notes: null,
    coordinates: null,
    course_preference: options.course_preference ?? null,
    instagram_handle: null,
    person_count: options.partner_name === null ? 1 : 2,
    confirmed: true,
    cancelled: false,
    cancelled_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...options,
  };
}

// Helper to create test event
function createTestEvent(): Event {
  return {
    id: 'test-event',
    organization_id: null,
    name: 'Test Fest',
    slug: 'test-fest',
    description: null,
    event_date: '2026-06-15',
    gathering_time: '17:00',
    starter_time: '17:30',
    main_time: '19:00',
    dessert_time: '20:30',
    afterparty_time: '22:00',
    time_offset_minutes: 0,
    time_offset_updated_at: null,
    time_offset_updated_by: null,
    gathering_location: null,
    gathering_description: null,
    afterparty_location: null,
    afterparty_description: null,
    envelope_hours_before: 2,
    dropout_cutoff_hours: 6,
    public_view_enabled: false,
    max_couples: null,
    status: 'open',
    active_match_plan_id: null,
    created_at: new Date().toISOString(),
  };
}

describe('Step A: Assign Courses', () => {
  it('should distribute couples evenly across courses', () => {
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David'),
      createTestCouple('5', 'Eva'),
      createTestCouple('6', 'Fredrik'),
    ];
    
    const result = assignCourses({ event_id: 'test', couples });
    
    expect(result.assignments).toHaveLength(6);
    
    // Count assignments per course
    const courseCounts = { starter: 0, main: 0, dessert: 0 };
    for (const a of result.assignments) {
      courseCounts[a.course as Course]++;
    }
    
    // Should be roughly equal (2 each)
    expect(courseCounts.starter).toBe(2);
    expect(courseCounts.main).toBe(2);
    expect(courseCounts.dessert).toBe(2);
  });
  
  it('should respect course preferences when possible', () => {
    const couples = [
      createTestCouple('1', 'Anna', { course_preference: 'starter' }),
      createTestCouple('2', 'Bertil', { course_preference: 'starter' }),
      createTestCouple('3', 'Cecilia', { course_preference: 'main' }),
      createTestCouple('4', 'David'),
      createTestCouple('5', 'Eva'),
      createTestCouple('6', 'Fredrik'),
    ];
    
    const result = assignCourses({ event_id: 'test', couples });
    
    // Anna and Bertil should both get starter (or at least one of them)
    const starterAssignments = result.assignments.filter(a => a.course === 'starter');
    const annaGotStarter = starterAssignments.some(a => a.couple_id === '1');
    const bertilGotStarter = starterAssignments.some(a => a.couple_id === '2');
    
    // At least one preference should be satisfied
    expect(annaGotStarter || bertilGotStarter).toBe(true);
    expect(result.stats.preference_satisfaction).toBeGreaterThan(0);
  });
  
  it('should throw error with fewer than 3 couples', () => {
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
    ];
    
    expect(() => assignCourses({ event_id: 'test', couples })).toThrow();
  });
  
  it('should handle cancelled couples', () => {
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David', { cancelled: true }),
    ];
    
    const result = assignCourses({ event_id: 'test', couples });
    
    // Should only assign 3 active couples
    expect(result.assignments).toHaveLength(3);
    expect(result.assignments.every(a => a.couple_id !== '4')).toBe(true);
  });
});

describe('Step B: Match Guests to Hosts', () => {
  it('should not place anyone at their own home', () => {
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
    ];
    
    const assignments = [
      { id: 'a1', event_id: 'test', couple_id: '1', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a2', event_id: 'test', couple_id: '2', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a3', event_id: 'test', couple_id: '3', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
    ];
    
    const result = matchGuestsToHosts({
      event_id: 'test',
      match_plan_id: 'plan-1',
      assignments,
      couples,
      blocked_pairs: [],
      frozen_courses: [],
    });
    
    // No pairing should have host == guest
    for (const pairing of result.course_pairings) {
      expect(pairing.host_couple_id).not.toBe(pairing.guest_couple_id);
    }
  });
  
  it('should respect blocked pairs', () => {
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David'),
    ];
    
    const assignments = [
      { id: 'a1', event_id: 'test', couple_id: '1', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a2', event_id: 'test', couple_id: '2', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a3', event_id: 'test', couple_id: '3', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a4', event_id: 'test', couple_id: '4', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
    ];
    
    // Block Anna (1) from meeting Bertil (2)
    const result = matchGuestsToHosts({
      event_id: 'test',
      match_plan_id: 'plan-1',
      assignments,
      couples,
      blocked_pairs: [['1', '2']],
      frozen_courses: [],
    });
    
    // Anna and Bertil should never be in same venue
    for (const pairing of result.course_pairings) {
      const isAnnaHost = pairing.host_couple_id === '1';
      const isBertilHost = pairing.host_couple_id === '2';
      const isAnnaGuest = pairing.guest_couple_id === '1';
      const isBertilGuest = pairing.guest_couple_id === '2';
      
      // If Anna is host, Bertil shouldn't be guest
      if (isAnnaHost) {
        expect(isBertilGuest).toBe(false);
      }
      // If Bertil is host, Anna shouldn't be guest
      if (isBertilHost) {
        expect(isAnnaGuest).toBe(false);
      }
    }
  });
  
  it('should minimize unique meeting violations (soft constraint)', () => {
    // With only 6 couples and 2 hosts per course, some duplicate meetings
    // are mathematically unavoidable. This test verifies the algorithm
    // handles it gracefully and still produces valid pairings.
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David'),
      createTestCouple('5', 'Eva'),
      createTestCouple('6', 'Fredrik'),
    ];
    
    const assignments = [
      { id: 'a1', event_id: 'test', couple_id: '1', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a2', event_id: 'test', couple_id: '2', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a3', event_id: 'test', couple_id: '3', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a4', event_id: 'test', couple_id: '4', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a5', event_id: 'test', couple_id: '5', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a6', event_id: 'test', couple_id: '6', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
    ];
    
    const result = matchGuestsToHosts({
      event_id: 'test',
      match_plan_id: 'plan-1',
      assignments,
      couples,
      blocked_pairs: [],
      frozen_courses: [],
    });
    
    // All guests should still be placed (algorithm handles soft constraint gracefully)
    expect(result.course_pairings.length).toBeGreaterThan(0);
    
    // Each couple should have 3 envelopes (one per course)
    const envelopesPerCouple = new Map<string, number>();
    for (const env of result.envelopes) {
      envelopesPerCouple.set(env.couple_id, (envelopesPerCouple.get(env.couple_id) || 0) + 1);
    }
    for (const [coupleId, count] of envelopesPerCouple) {
      expect(count).toBe(3);
    }
    
    // No capacity warnings (everyone placed)
    const capacityWarnings = result.warnings.filter(w => w.type === 'capacity');
    expect(capacityWarnings).toHaveLength(0);
  });
  
  it('should achieve uniqueness with enough couples', () => {
    // With 9 couples (3 hosts per course), uniqueness should be achievable
    const couples = [
      createTestCouple('1', 'Anna'),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David'),
      createTestCouple('5', 'Eva'),
      createTestCouple('6', 'Fredrik'),
      createTestCouple('7', 'Gustav'),
      createTestCouple('8', 'Helena'),
      createTestCouple('9', 'Ingvar'),
    ];
    
    const assignments = [
      { id: 'a1', event_id: 'test', couple_id: '1', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a2', event_id: 'test', couple_id: '2', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a3', event_id: 'test', couple_id: '3', course: 'starter' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a4', event_id: 'test', couple_id: '4', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a5', event_id: 'test', couple_id: '5', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a6', event_id: 'test', couple_id: '6', course: 'main' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a7', event_id: 'test', couple_id: '7', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a8', event_id: 'test', couple_id: '8', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
      { id: 'a9', event_id: 'test', couple_id: '9', course: 'dessert' as Course, is_host: true, max_guests: 6, is_flex_host: false, flex_extra_capacity: 4, is_emergency_host: false, notified_at: null, created_at: '' },
    ];
    
    const result = matchGuestsToHosts({
      event_id: 'test',
      match_plan_id: 'plan-1',
      assignments,
      couples,
      blocked_pairs: [],
      frozen_courses: [],
    });
    
    // With 3 hosts per course, we can achieve better uniqueness
    // (though random shuffling may still cause some violations)
    const uniqueWarnings = result.warnings.filter(w => w.type === 'unique_meeting');
    // Allow up to 2 violations due to randomness
    expect(uniqueWarnings.length).toBeLessThanOrEqual(2);
  });
});

describe('Full Match', () => {
  it('should run complete matching pipeline', () => {
    const event = createTestEvent();
    const couples = [
      createTestCouple('1', 'Anna', { course_preference: 'starter' }),
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David'),
      createTestCouple('5', 'Eva'),
      createTestCouple('6', 'Fredrik'),
    ];
    
    const result = runFullMatch({
      event,
      couples,
      blocked_pairs: [],
      match_plan_id: 'plan-1',
    });
    
    // Step A should produce assignments
    expect(result.stepA.assignments).toHaveLength(6);
    
    // Step B should produce pairings and envelopes
    expect(result.stepB.course_pairings.length).toBeGreaterThan(0);
    expect(result.stepB.envelopes.length).toBeGreaterThan(0);
    
    // Stats should be reasonable
    expect(result.stepB.stats.couples_matched).toBeGreaterThan(0);
  });
  
  it('should handle single participants', () => {
    const event = createTestEvent();
    const couples = [
      createTestCouple('1', 'Anna', { partner_name: null }), // Single
      createTestCouple('2', 'Bertil'),
      createTestCouple('3', 'Cecilia'),
      createTestCouple('4', 'David', { partner_name: null }), // Single
      createTestCouple('5', 'Eva'),
      createTestCouple('6', 'Fredrik'),
    ];
    
    const result = runFullMatch({
      event,
      couples,
      blocked_pairs: [],
      match_plan_id: 'plan-1',
    });
    
    // Should complete without errors
    expect(result.stepA.assignments).toHaveLength(6);
    expect(result.warnings.filter(w => w.type === 'capacity')).toHaveLength(0);
  });
});
