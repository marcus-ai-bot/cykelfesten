-- Tighten anon RLS: remove SELECT on couples, events, envelopes
-- All guest-facing pages now use server-side API routes with service_role
-- Only events_public view remains accessible to anon

-- NOTE: exec_sql uses EXECUTE...INTO which silently fails for DDL.
-- Must use DO $$ blocks for DDL via exec_sql.

-- 1. Drop anon read/update policies
DO $$
BEGIN
  DROP POLICY IF EXISTS anon_read_couples ON public.couples;
  DROP POLICY IF EXISTS anon_read_events ON public.events;
  DROP POLICY IF EXISTS anon_read_envelopes ON public.envelopes;
  DROP POLICY IF EXISTS anon_update_envelopes ON public.envelopes;
END $$;

-- 2. Force RLS (ensures even table owners are subject to policies)
ALTER TABLE couples FORCE ROW LEVEL SECURITY;
ALTER TABLE events FORCE ROW LEVEL SECURITY;
ALTER TABLE envelopes FORCE ROW LEVEL SECURITY;

-- 3. Recreate events_public view (safe public data only)
DROP VIEW IF EXISTS public.events_public;
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

GRANT SELECT ON public.events_public TO anon;

-- Remaining anon policies (kept for registration flow):
-- couples: anon_insert_couples (INSERT) + anon_update_couples (UPDATE)
