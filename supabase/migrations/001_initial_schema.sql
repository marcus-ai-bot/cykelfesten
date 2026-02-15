-- Initial schema for Cykelfesten
-- Must run before later migrations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Core tables
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  logo_url TEXT,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  event_date DATE NOT NULL,
  gathering_time TIME,
  starter_time TIME NOT NULL DEFAULT '17:30',
  main_time TIME NOT NULL DEFAULT '19:00',
  dessert_time TIME NOT NULL DEFAULT '20:30',
  afterparty_time TIME,
  time_offset_minutes INT DEFAULT 0,
  time_offset_updated_at TIMESTAMPTZ,
  time_offset_updated_by TEXT,
  gathering_location TEXT,
  gathering_description TEXT,
  afterparty_location TEXT,
  afterparty_description TEXT,
  envelope_hours_before INT DEFAULT 6,
  dropout_cutoff_hours INT DEFAULT 24,
  public_view_enabled BOOLEAN DEFAULT false,
  max_couples INT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','open','matched','locked','in_progress','completed')),
  active_match_plan_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS couples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_user_id UUID,
  invited_name TEXT NOT NULL,
  invited_email TEXT NOT NULL,
  invited_phone TEXT,
  invited_allergies TEXT[],
  invited_allergy_notes TEXT,
  partner_name TEXT,
  partner_email TEXT,
  partner_phone TEXT,
  partner_allergies TEXT[],
  partner_allergy_notes TEXT,
  replacement_name TEXT,
  replacement_allergies TEXT[],
  replacement_allergy_notes TEXT,
  replacement_reason TEXT,
  original_partner_name TEXT,
  address TEXT NOT NULL,
  address_notes TEXT,
  coordinates JSONB,
  course_preference TEXT CHECK (course_preference IN ('starter','main','dessert')),
  instagram_handle TEXT,
  person_count INT NOT NULL DEFAULT 2,
  confirmed BOOLEAN DEFAULT false,
  cancelled BOOLEAN DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS match_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded')),
  frozen_courses TEXT[] DEFAULT '{}'::text[],
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  locked_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES match_plans(id),
  stats JSONB
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  course TEXT NOT NULL CHECK (course IN ('starter','main','dessert')),
  is_host BOOLEAN NOT NULL DEFAULT false,
  max_guests INT NOT NULL DEFAULT 2,
  is_flex_host BOOLEAN DEFAULT false,
  flex_extra_capacity INT DEFAULT 0,
  is_emergency_host BOOLEAN DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_plan_id UUID NOT NULL REFERENCES match_plans(id) ON DELETE CASCADE,
  course TEXT NOT NULL CHECK (course IN ('starter','main','dessert')),
  host_couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  guest_couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS envelopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_plan_id UUID NOT NULL REFERENCES match_plans(id) ON DELETE CASCADE,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  course TEXT NOT NULL CHECK (course IN ('starter','main','dessert')),
  host_couple_id UUID REFERENCES couples(id),
  destination_address TEXT,
  destination_notes TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  activated_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blocked_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  couple_a_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  couple_b_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  match_plan_id UUID REFERENCES match_plans(id),
  action TEXT NOT NULL,
  actor_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_organizers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'co-organizer' CHECK (role IN ('founder','co-organizer')),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, organizer_id)
);

CREATE TABLE IF NOT EXISTS award_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  award_id TEXT NOT NULL,
  value TEXT,
  assigned_at TIMESTAMPTZ DEFAULT now()
);

-- Add FK after match_plans exists
ALTER TABLE events
  ADD CONSTRAINT IF NOT EXISTS events_active_match_plan_id_fkey
  FOREIGN KEY (active_match_plan_id) REFERENCES match_plans(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_org_id ON events(organization_id);
CREATE INDEX IF NOT EXISTS idx_couples_event_id ON couples(event_id);
CREATE INDEX IF NOT EXISTS idx_match_plans_event_id ON match_plans(event_id);
CREATE INDEX IF NOT EXISTS idx_assignments_event_id ON assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_assignments_couple_id ON assignments(couple_id);
CREATE INDEX IF NOT EXISTS idx_course_pairings_match_plan_id ON course_pairings(match_plan_id);
CREATE INDEX IF NOT EXISTS idx_course_pairings_host_couple_id ON course_pairings(host_couple_id);
CREATE INDEX IF NOT EXISTS idx_course_pairings_guest_couple_id ON course_pairings(guest_couple_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_match_plan_id ON envelopes(match_plan_id);
CREATE INDEX IF NOT EXISTS idx_envelopes_couple_id ON envelopes(couple_id);
CREATE INDEX IF NOT EXISTS idx_blocked_pairs_event_id ON blocked_pairs(event_id);
CREATE INDEX IF NOT EXISTS idx_blocked_pairs_couple_a_id ON blocked_pairs(couple_a_id);
CREATE INDEX IF NOT EXISTS idx_blocked_pairs_couple_b_id ON blocked_pairs(couple_b_id);
CREATE INDEX IF NOT EXISTS idx_event_log_event_id ON event_log(event_id);
CREATE INDEX IF NOT EXISTS idx_event_log_match_plan_id ON event_log(match_plan_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_event_id ON event_organizers(event_id);
CREATE INDEX IF NOT EXISTS idx_event_organizers_organizer_id ON event_organizers(organizer_id);
CREATE INDEX IF NOT EXISTS idx_award_assignments_couple_id ON award_assignments(couple_id);

-- Updated_at trigger for couples
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_couples_updated_at ON couples;
CREATE TRIGGER trg_couples_updated_at
BEFORE UPDATE ON couples
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE couples ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_organizers ENABLE ROW LEVEL SECURITY;
ALTER TABLE award_assignments ENABLE ROW LEVEL SECURITY;

-- Permissive policies for demo/MVP
-- Service role full access
CREATE POLICY IF NOT EXISTS "service_role_all_organizations" ON organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_events" ON events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_couples" ON couples FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_match_plans" ON match_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_assignments" ON assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_course_pairings" ON course_pairings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_envelopes" ON envelopes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_blocked_pairs" ON blocked_pairs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_event_log" ON event_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_organizers" ON organizers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_event_organizers" ON event_organizers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY IF NOT EXISTS "service_role_all_award_assignments" ON award_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Anon public read for events/couples
CREATE POLICY IF NOT EXISTS "anon_select_events" ON events FOR SELECT TO anon USING (true);
CREATE POLICY IF NOT EXISTS "anon_select_couples" ON couples FOR SELECT TO anon USING (true);

-- Anon insert on couples (registration)
CREATE POLICY IF NOT EXISTS "anon_insert_couples" ON couples FOR INSERT TO anon WITH CHECK (true);
