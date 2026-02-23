-- Guest dropout cleanup + rematch lock
ALTER TABLE envelopes
  ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT false;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS rematch_lock_until TIMESTAMPTZ;
