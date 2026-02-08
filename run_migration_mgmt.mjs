import { readFileSync } from 'fs';

const mgmtCreds = JSON.parse(readFileSync('/home/marcus/.openclaw/credentials/supabase-management.json', 'utf8'));
const token = mgmtCreds.token;
const projectRef = 'kbqmjsohgnjlirdsnxyo';

const sql = readFileSync('supabase/migrations/20260208_personal_wraps.sql', 'utf8');

console.log('🗄️  Running migration via Supabase Management API...\n');

// Use Management API to run SQL
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
  console.log('✅ Migration completed successfully!');
  console.log('Result:', JSON.stringify(result, null, 2));
} else {
  const error = await response.text();
  console.log(`Status: ${response.status}`);
  console.log('Response:', error);
  
  // Try alternative endpoint
  console.log('\n🔄 Trying alternative endpoint...');
  const response2 = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ sql })
  });
  
  if (response2.ok) {
    console.log('✅ Alternative endpoint worked!');
    console.log(await response2.json());
  } else {
    console.log(`Alternative status: ${response2.status}`);
    console.log(await response2.text());
  }
}
