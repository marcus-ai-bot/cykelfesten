-- Ensure invited_email unique per event (active couples)
CREATE UNIQUE INDEX idx_couples_unique_email_per_event
  ON couples (event_id, LOWER(invited_email))
  WHERE cancelled = false AND deleted_at IS NULL;
