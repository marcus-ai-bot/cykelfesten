-- Afterparty progressive reveal columns
-- LOCKED → TEASING → REVEALED states for the afterparty card

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS afterparty_teasing_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS afterparty_revealed_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN events.afterparty_teasing_at IS 'When afterparty teasing was activated (shows time + BYOB)';
COMMENT ON COLUMN events.afterparty_revealed_at IS 'When afterparty full info was revealed (shows address, door code, map)';
