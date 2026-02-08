import { readFileSync } from 'fs';

const mgmtCreds = JSON.parse(readFileSync('/home/marcus/.openclaw/credentials/supabase-management.json', 'utf8'));
const token = mgmtCreds.token;
const projectRef = 'kbqmjsohgnjlirdsnxyo';

const sql = `
-- Drop the old constraint that only allows one award per couple
ALTER TABLE award_assignments 
DROP CONSTRAINT IF EXISTS award_assignments_couple_id_key;

-- The new index idx_award_per_person already exists and allows
-- one award per person (couple_id + person_type)

-- Verify indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'award_assignments';
`;

console.log('🔧 Fixing constraint...');

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({ query: sql })
});

if (response.ok) {
  const result = await response.json();
  console.log('✅ Done!');
  console.log('Indexes:', JSON.stringify(result, null, 2));
} else {
  console.log('❌ Failed:', response.status);
  console.log(await response.text());
}
