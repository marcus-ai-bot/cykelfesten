-- SECURITY FIX: Enable RLS on all tables
-- Previously ALL tables had RLS DISABLED, meaning anon key could read/write everything
-- including organizer_sessions (session hijacking), organizers (PII), couples (PII)
-- 
-- Fixed: 2026-02-25

-- Enable RLS on every table
DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    BEGIN
      EXECUTE format(
        'CREATE POLICY "service_role_all_%1$s" ON public.%1$I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        tbl.tablename
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

-- Selective anon access (minimum required for app to function)
-- NOTE: couples and events still expose PII via anon SELECT — 
-- TODO: migrate client-side queries to API routes, then remove anon read

-- Events: read (needed for registration page, live view SSR)
CREATE POLICY "anon_read_events" ON events FOR SELECT TO anon USING (true);

-- Couples: read + insert + update (registration flow)
CREATE POLICY "anon_read_couples" ON couples FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_couples" ON couples FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_couples" ON couples FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Match plans, envelopes, course pairings: read + envelope update
CREATE POLICY "anon_read_match_plans" ON match_plans FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_envelopes" ON envelopes FOR SELECT TO anon USING (true);
CREATE POLICY "anon_update_envelopes" ON envelopes FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_course_pairings" ON course_pairings FOR SELECT TO anon USING (true);

-- Couple preferences, invite links, rate limits, magic links
CREATE POLICY "anon_read_couple_preferences" ON couple_preferences FOR SELECT TO anon USING (true);
CREATE POLICY "anon_insert_couple_preferences" ON couple_preferences FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_read_event_invite_links" ON event_invite_links FOR SELECT TO anon USING (true);
CREATE POLICY "anon_all_rate_limits" ON rate_limits FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_magic_link_tokens" ON magic_link_tokens FOR ALL TO anon USING (true) WITH CHECK (true);

-- BLOCKED for anon (no policy = no access):
-- organizer_sessions (session tokens)
-- organizers (PII: email, phone)  
-- street_info (address details)
-- event_log
-- email_log
-- notifications
-- organizations
-- host_recaps
-- wrap_link_opens
-- assignments
-- award_assignments
-- blocked_pairs
-- meeting_history
-- course_clues
-- event_timing
-- recipes

-- Public view (excludes wrap_stats, organizer_email)
CREATE OR REPLACE VIEW public.events_public AS
SELECT id, name, slug, description, event_date, status,
       gathering_time, starter_time, main_time, dessert_time, afterparty_time,
       gathering_location, gathering_description,
       afterparty_location, afterparty_description, afterparty_byob,
       afterparty_title, afterparty_notes, afterparty_hosts,
       afterparty_coordinates, afterparty_door_code,
       max_couples, public_view_enabled,
       host_self_messages, lips_sealed_messages, mystery_host_messages,
       envelope_hours_before, dropout_cutoff_hours,
       active_match_plan_id, city,
       enabled_awards, thank_you_message,
       time_offset_minutes, time_offset_updated_at,
       course_timing_offsets, created_at
FROM events;
