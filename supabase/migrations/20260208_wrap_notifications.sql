-- Wrap notification system for Cykelfesten
-- Adds organizer approval flow + link tracking

-- Add notification columns to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_email TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS wrap_reminder_time TIME DEFAULT '08:00';
ALTER TABLE events ADD COLUMN IF NOT EXISTS wrap_approved_at TIMESTAMPTZ;
ALTER TABLE events ADD COLUMN IF NOT EXISTS wrap_approved_by TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS wraps_sent_at TIMESTAMPTZ;

-- Track when participants open their wrap links
CREATE TABLE IF NOT EXISTS wrap_link_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  person_type TEXT NOT NULL CHECK (person_type IN ('invited', 'partner')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_hash TEXT,  -- SHA256 of IP for privacy
  referrer TEXT
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_wrap_link_opens_couple ON wrap_link_opens(couple_id);
CREATE INDEX IF NOT EXISTS idx_wrap_link_opens_opened_at ON wrap_link_opens(opened_at);

-- Track email sends
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL, -- 'organizer_reminder', 'participant_wrap'
  recipient_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_id TEXT, -- Resend's message ID for tracking
  status TEXT DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_email_log_event ON email_log(event_id);

-- RLS policies
ALTER TABLE wrap_link_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read tracking data for their events
CREATE POLICY "Authenticated can read wrap_link_opens" ON wrap_link_opens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can insert wrap_link_opens" ON wrap_link_opens
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Authenticated can read email_log" ON email_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can manage email_log" ON email_log
  FOR ALL TO service_role USING (true);

-- Comment
COMMENT ON TABLE wrap_link_opens IS 'Tracks when participants open their wrap links for analytics';
COMMENT ON TABLE email_log IS 'Log of all emails sent through the notification system';
