/**
 * Run notification system migration via Supabase Management API
 * 
 * Usage: 
 *   1. Get access token from: https://supabase.com/dashboard/account/tokens
 *   2. Run: SUPABASE_ACCESS_TOKEN=xxx npx tsx scripts/run-notification-migration.ts
 */

const SUPABASE_PROJECT_REF = 'kbqmjsohgnjlirdsnxyo';

const migration = `
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
  ip_hash TEXT,
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
  email_type TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_id TEXT,
  status TEXT DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_email_log_event ON email_log(event_id);

-- RLS policies
ALTER TABLE wrap_link_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read tracking data
CREATE POLICY IF NOT EXISTS "Authenticated can read wrap_link_opens" ON wrap_link_opens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Anon can insert wrap_link_opens" ON wrap_link_opens
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Authenticated can read email_log" ON email_log
  FOR SELECT TO authenticated USING (true);

CREATE POLICY IF NOT EXISTS "Service role can manage email_log" ON email_log
  FOR ALL TO service_role USING (true);
`;

async function runMigration() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  
  if (!token) {
    console.error('❌ Missing SUPABASE_ACCESS_TOKEN');
    console.log('Get it from: https://supabase.com/dashboard/account/tokens');
    process.exit(1);
  }
  
  console.log('🚀 Running notification migration...');
  
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: migration }),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
  
  const result = await response.json();
  console.log('✅ Migration completed!');
  console.log(result);
}

runMigration();
