-- ROLLBACK: Living Envelope
-- Kör denna för att ångra 003_living_envelope.sql

-- 1. Ta bort triggers
DROP TRIGGER IF EXISTS event_timing_updated_at ON event_timing;
DROP FUNCTION IF EXISTS update_event_timing_timestamp();

-- 2. Ta bort helper functions
DROP FUNCTION IF EXISTS calculate_envelope_state(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_clues_for_course(UUID, TEXT);

-- 3. Ta bort nya kolumner från envelopes
ALTER TABLE envelopes 
  DROP COLUMN IF EXISTS current_state,
  DROP COLUMN IF EXISTS teasing_at,
  DROP COLUMN IF EXISTS clue_1_at,
  DROP COLUMN IF EXISTS clue_2_at,
  DROP COLUMN IF EXISTS street_at,
  DROP COLUMN IF EXISTS number_at,
  DROP COLUMN IF EXISTS cycling_minutes;
-- OBS: opened_at fanns redan, rör den inte

-- 4. Ta bort nya tabeller
DROP TABLE IF EXISTS street_info;
DROP TABLE IF EXISTS course_clues;
DROP TABLE IF EXISTS event_timing;

-- Klart! Databasen är tillbaka till före Living Envelope.
