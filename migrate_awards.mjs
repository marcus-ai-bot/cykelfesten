import { readFileSync } from 'fs';

const mgmtCreds = JSON.parse(readFileSync('/home/marcus/.openclaw/credentials/supabase-management.json', 'utf8'));
const token = mgmtCreds.token;
const projectRef = 'kbqmjsohgnjlirdsnxyo';

const sql = `
-- Add award settings to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS enabled_awards TEXT[] DEFAULT NULL;

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS thank_you_message TEXT DEFAULT NULL;

COMMENT ON COLUMN events.enabled_awards IS 'Array of enabled award IDs (null = use defaults)';
COMMENT ON COLUMN events.thank_you_message IS 'Custom thank you message shown after awards';
`;

console.log('🗄️  Running awards migration...\n');

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ query: sql })
});

if (response.ok) {
  console.log('✅ Migration completed!');
} else {
  console.log('❌ Failed:', response.status);
  console.log(await response.text());
}
