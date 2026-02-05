// Auto-generated types for Cykelfesten database

export type Course = 'starter' | 'main' | 'dessert';

export type EventStatus = 'draft' | 'open' | 'matched' | 'locked' | 'in_progress' | 'completed';

export type MatchPlanStatus = 'draft' | 'active' | 'superseded';

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface Event {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  event_date: string;
  gathering_time: string | null;
  starter_time: string;
  main_time: string;
  dessert_time: string;
  afterparty_time: string | null;
  time_offset_minutes: number;
  time_offset_updated_at: string | null;
  time_offset_updated_by: string | null;
  gathering_location: string | null;
  gathering_description: string | null;
  afterparty_location: string | null;
  afterparty_description: string | null;
  envelope_hours_before: number;
  dropout_cutoff_hours: number;
  public_view_enabled: boolean;
  max_couples: number | null;
  status: EventStatus;
  active_match_plan_id: string | null;
  created_at: string;
}

export interface Couple {
  id: string;
  event_id: string;
  invited_user_id: string | null;
  invited_name: string;
  invited_email: string;
  invited_phone: string | null;
  invited_allergies: string[] | null;
  invited_allergy_notes: string | null;
  partner_name: string | null;
  partner_email: string | null;
  partner_phone: string | null;
  partner_allergies: string[] | null;
  partner_allergy_notes: string | null;
  replacement_name: string | null;
  replacement_allergies: string[] | null;
  replacement_allergy_notes: string | null;
  replacement_reason: string | null;
  original_partner_name: string | null;
  address: string;
  address_notes: string | null;
  coordinates: { x: number; y: number } | null;
  course_preference: Course | null;
  instagram_handle: string | null;
  person_count: number; // Computed: 1 or 2
  confirmed: boolean;
  cancelled: boolean;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  event_id: string;
  couple_id: string;
  course: Course;
  is_host: boolean;
  max_guests: number;
  is_flex_host: boolean;
  flex_extra_capacity: number;
  is_emergency_host: boolean;
  notified_at: string | null;
  created_at: string;
}

export interface MatchPlan {
  id: string;
  event_id: string;
  version: number;
  status: MatchPlanStatus;
  frozen_courses: Course[];
  created_by: string | null;
  created_at: string;
  locked_at: string | null;
  superseded_at: string | null;
  superseded_by: string | null;
  stats: MatchPlanStats | null;
}

export interface MatchPlanStats {
  couples_matched: number;
  preference_satisfaction: number;
  capacity_utilization: number;
}

export interface CoursePairing {
  id: string;
  match_plan_id: string;
  course: Course;
  host_couple_id: string;
  guest_couple_id: string;
  created_at: string;
}

export interface Envelope {
  id: string;
  match_plan_id: string;
  couple_id: string;
  course: Course;
  host_couple_id: string | null;
  destination_address: string | null;
  destination_notes: string | null;
  scheduled_at: string;
  activated_at: string | null;
  opened_at: string | null;
  created_at: string;
}

export interface BlockedPair {
  id: string;
  event_id: string;
  couple_a_id: string;
  couple_b_id: string;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface EventLogEntry {
  id: string;
  event_id: string;
  match_plan_id: string | null;
  action: string;
  actor_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

// Input/Output types for Matching Engine

export interface StepAInput {
  event_id: string;
  couples: Couple[];
}

export interface StepAOutput {
  assignments: Omit<Assignment, 'id' | 'created_at' | 'notified_at'>[];
  stats: {
    preference_satisfaction: number;
    capacity_per_course: Record<Course, number>;
  };
}

export interface StepBInput {
  event_id: string;
  match_plan_id: string;
  assignments: Assignment[];
  couples: Couple[];
  blocked_pairs: [string, string][];
  frozen_courses: Course[];
}

export interface StepBOutput {
  course_pairings: Omit<CoursePairing, 'id' | 'created_at'>[];
  envelopes: Omit<Envelope, 'id' | 'created_at' | 'activated_at' | 'opened_at'>[];
  warnings: MatchingWarning[];
  stats: {
    couples_matched: number;
    capacity_utilization: number;
  };
}

export interface MatchingWarning {
  type: 'capacity' | 'preference' | 'block' | 'unique_meeting';
  message: string;
  couple_ids?: string[];
}
