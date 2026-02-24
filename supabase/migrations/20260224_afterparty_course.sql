-- Migration: Allow 'afterparty' as a course type
-- Required for afterparty-as-envelope feature (consolidating dual reveal systems)
-- 
-- Affected tables: assignments, course_pairings, envelopes
-- NOTE: couples.course_preference stays as ('starter','main','dessert') — 
--       afterparty is not a meal preference.

-- 1. assignments
ALTER TABLE assignments DROP CONSTRAINT IF EXISTS assignments_course_check;
ALTER TABLE assignments ADD CONSTRAINT assignments_course_check
  CHECK (course IN ('starter', 'main', 'dessert', 'afterparty'));

-- 2. course_pairings
ALTER TABLE course_pairings DROP CONSTRAINT IF EXISTS course_pairings_course_check;
ALTER TABLE course_pairings ADD CONSTRAINT course_pairings_course_check
  CHECK (course IN ('starter', 'main', 'dessert', 'afterparty'));

-- 3. envelopes
ALTER TABLE envelopes DROP CONSTRAINT IF EXISTS envelopes_course_check;
ALTER TABLE envelopes ADD CONSTRAINT envelopes_course_check
  CHECK (course IN ('starter', 'main', 'dessert', 'afterparty'));
