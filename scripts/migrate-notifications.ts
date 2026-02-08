#!/usr/bin/env npx tsx
/**
 * Run notification migration using pg library
 * Reads credentials from projects.json
 */

import { readFileSync } from 'fs';
import { Client } from 'pg';
import { join } from 'path';

const credentialsPath = join(process.env.HOME || '', '.openclaw/credentials/projects.json');
const credentials = JSON.parse(readFileSync(credentialsPath, 'utf8'));
const { db_pass, supabase_ref } = credentials.cykelfesten;

const connectionString = `postgresql://postgres.${supabase_ref}:${db_pass}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres`;

const migrations = [
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_email TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS wrap_reminder_time TIME DEFAULT '08:00'`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS wrap_approved_at TIMESTAMPTZ`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS wrap_approved_by TEXT`,
  `ALTER TABLE events ADD COLUMN IF NOT EXISTS wraps_sent_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS wrap_link_opens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
    person_type TEXT NOT NULL CHECK (person_type IN ('invited', 'partner')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent TEXT,
    ip_hash TEXT,
    referrer TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_wrap_link_opens_couple ON wrap_link_opens(couple_id)`,
  `CREATE INDEX IF NOT EXISTS idx_wrap_link_opens_opened_at ON wrap_link_opens(opened_at)`,
  `CREATE TABLE IF NOT EXISTS email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE CASCADE,
    couple_id UUID REFERENCES couples(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resend_id TEXT,
    status TEXT DEFAULT 'sent'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_email_log_event ON email_log(event_id)`,
  `ALTER TABLE wrap_link_opens ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE email_log ENABLE ROW LEVEL SECURITY`,
];

async function run() {
  console.log('🔌 Connecting to Supabase...');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected\n');
    
    for (const sql of migrations) {
      const shortSql = sql.slice(0, 60).replace(/\n/g, ' ') + '...';
      process.stdout.write(`Running: ${shortSql}`);
      try {
        await client.query(sql);
        console.log(' ✓');
      } catch (err: any) {
        if (err.message?.includes('already exists')) {
          console.log(' (already exists)');
        } else {
          console.log(` ✗ ${err.message}`);
        }
      }
    }
    
    console.log('\n✅ Migration complete!');
  } finally {
    await client.end();
  }
}

run().catch(console.error);
