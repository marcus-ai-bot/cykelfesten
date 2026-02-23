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
  afterparty_door_code: string | null;
  afterparty_byob: boolean | null;
  afterparty_notes: string | null;
  afterparty_hosts: string | null;
  host_self_messages: Record<string, unknown> | null;
  lips_sealed_messages: Record<string, unknown> | null;
  mystery_host_messages: Record<string, unknown> | null;
  enabled_awards: string[] | null;
  thank_you_message: string | null;
  wrap_stats: Record<string, any> | null;
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
  invited_birth_year: number | null;
  invited_fun_facts: unknown;
  partner_name: string | null;
  partner_email: string | null;
  partner_phone: string | null;
  partner_allergies: string[] | null;
  partner_allergy_notes: string | null;
  partner_birth_year: number | null;
  partner_fun_facts: unknown;
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
  forced_assignments?: number;
}

export interface CoursePairing {
  id: string;
  match_plan_id: string;
  course: Course;
  host_couple_id: string;
  guest_couple_id: string;
  forced?: boolean;
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
  cycling_distance_km: number | null;
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
    forced_assignments: number;
  };
}

export interface MatchingWarning {
  type: 'capacity' | 'preference' | 'block' | 'unique_meeting';
  message: string;
  couple_ids?: string[];
}

// ============================================
// Living Envelope Types
// ============================================

export type EnvelopeState = 'LOCKED' | 'TEASING' | 'CLUE_1' | 'CLUE_2' | 'STREET' | 'NUMBER' | 'OPEN';

export interface EventTiming {
  id: string;
  event_id: string;
  teasing_minutes_before: number;
  clue_1_minutes_before: number;
  clue_2_minutes_before: number;
  street_minutes_before: number;
  number_minutes_before: number;
  during_meal_clue_interval_minutes: number;
  distance_adjustment_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseClues {
  id: string;
  couple_id: string;
  course_type: Course;
  clue_indices: number[];
  allocated_at: string;
}

export interface StreetInfo {
  id: string;
  couple_id: string;
  street_name: string | null;
  street_number: number | null;
  apartment: string | null;
  postal_code: string | null;
  city: string | null;
  number_range_low: number | null;
  number_range_high: number | null;
  door_code: string | null;
  created_at: string;
}

// Extended Envelope with Living Envelope fields
export interface LiveEnvelope extends Envelope {
  current_state: EnvelopeState;
  teasing_at: string | null;
  clue_1_at: string | null;
  clue_2_at: string | null;
  street_at: string | null;
  number_at: string | null;
  cycling_minutes: number | null;
}

// API Response Types for /api/envelope/status

export interface RevealedClue {
  text: string;
  revealed_at: string;
}

export interface StreetReveal {
  name: string;
  range: string;  // "10-20"
  cycling_minutes: number;
}

export interface FullAddressReveal {
  street: string;
  number: number;
  apartment: string | null;
  door_code: string | null;
  city: string;
  coordinates: { lat: number; lng: number } | null;
}

export interface NextReveal {
  type: EnvelopeState;
  at: string;  // ISO timestamp
  in_seconds: number;
}

export interface CourseEnvelopeStatus {
  type: Course;
  state: EnvelopeState;
  clues: RevealedClue[];
  clue_pool: string[] | null;  // All participants' clues shuffled (for CLUE_1)
  street: StreetReveal | null;
  number: number | null;
  full_address: FullAddressReveal | null;
  next_reveal: NextReveal | null;
  starts_at: string;
  host_names: string[] | null;  // Only revealed at OPEN
  allergies_summary: string[] | null;  // Only revealed at OPEN
  is_self_host: boolean;  // True if the guest IS the host for this course
  host_has_fun_facts: boolean;  // True if host has any fun facts
  cycling_meters: number | null;  // Distance to destination
  // Dessert special: afterparty reveals
  dessert_stats: DessertStats | null;  // CLUE_1 for dessert
  afterparty_practical: AfterpartyPractical | null;  // CLUE_2 for dessert
  afterparty_location: AfterpartyLocation | null;  // STREET/NUMBER for dessert
}

// Dessert special reveals (afterparty info)
export interface DessertStats {
  total_couples: number;
  total_distance_km: number;
  total_dishes: number;
  vegetarian_dishes: number;
}

export interface AfterpartyPractical {
  time: string;
  door_code: string | null;
  bring_own_drinks: boolean;
  notes: string | null;
}

export interface AfterpartyLocation {
  address: string;
  host_names: string[];
  cycling_minutes_sober: number;
  cycling_minutes_tipsy: number;
  cycling_minutes_drunk: number;
  coordinates: { lat: number; lng: number } | null;
}

export interface AfterpartyStatus {
  state: 'LOCKED' | 'OPEN';
  reveals_at: string;
  location: string | null;
  description: string | null;
}

export interface CustomMessage {
  emoji: string;
  text: string;
}

export interface EnvelopeStatusResponse {
  server_time: string;
  event_id: string;
  couple_id: string;
  courses: CourseEnvelopeStatus[];
  afterparty: AfterpartyStatus;
  messages: {
    host_self: CustomMessage[];
    lips_sealed: CustomMessage[];
    mystery_host: CustomMessage[];
  };
}
