import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

const supabase = createClient(url, serviceKey);

console.log('🔍 Checking Supabase capabilities...\n');

// 1. Check available RPC functions
console.log('[1] Listing available RPC functions...');
const { data: funcs, error: funcErr } = await supabase.rpc('pg_catalog.pg_proc');
if (funcErr) {
  console.log('   Standard RPC listing not available');
}

// 2. Try common SQL execution functions
const sqlFunctions = ['exec_sql', 'execute_sql', 'run_sql', 'query', 'sql'];
for (const fn of sqlFunctions) {
  console.log(`[2] Trying rpc('${fn}')...`);
  const { error } = await supabase.rpc(fn, { sql: 'SELECT 1' });
  if (!error) {
    console.log(`   ✅ Found working function: ${fn}`);
  } else if (error.code === 'PGRST202') {
    console.log(`   ❌ Function '${fn}' not found`);
  } else {
    console.log(`   ⚠️  ${error.message}`);
  }
}

// 3. Check if we can use pgmeta API
console.log('\n[3] Trying Supabase Meta API...');
const metaResponse = await fetch(`${url}/pg/`, {
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`
  }
});
console.log(`   Meta API status: ${metaResponse.status}`);

// 4. Check REST endpoint for SQL
console.log('\n[4] Checking REST SQL endpoint...');
const sqlResponse = await fetch(`${url}/rest/v1/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Prefer': 'return=representation'
  },
  body: JSON.stringify({ query: 'SELECT 1' })
});
console.log(`   REST SQL status: ${sqlResponse.status}`);

// 5. Check if there's a database URL in connection info
console.log('\n[5] Checking for database connection options...');
const envVars = env.split('\n').filter(line => 
  line.includes('DATABASE') || 
  line.includes('POSTGRES') || 
  line.includes('PG_') ||
  line.includes('DB_')
);
if (envVars.length > 0) {
  console.log('   Found database-related env vars:');
  envVars.forEach(v => console.log(`   - ${v.split('=')[0]}`));
} else {
  console.log('   No direct database connection vars found');
}

// 6. Try Supabase pooler connection string format
console.log('\n[6] Checking pooler endpoint...');
const projectRef = url.match(/https:\/\/(.+?)\.supabase/)?.[1];
console.log(`   Project ref: ${projectRef}`);
console.log(`   Pooler URL would be: postgresql://postgres.${projectRef}:[PASSWORD]@aws-0-eu-north-1.pooler.supabase.com:6543/postgres`);

console.log('\n✅ Check complete!');
