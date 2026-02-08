import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

if (!url || !serviceKey) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false }
});

const sql = readFileSync('supabase/migrations/20260208_personal_wraps.sql', 'utf8');

console.log('🗄️  Running migration...\n');

// Execute via raw SQL
const { data, error } = await supabase.rpc('exec_sql', { sql });

if (error) {
  console.error('❌ Migration failed:', error);
  
  // Try alternative: split and execute each statement
  console.log('\n⚙️  Trying statement-by-statement...\n');
  
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
  
  for (const [i, stmt] of statements.entries()) {
    console.log(`[${i+1}/${statements.length}]`, stmt.substring(0, 60) + '...');
    
    const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt + ';' });
    
    if (stmtError) {
      console.log(`  ⚠️  ${stmtError.message}`);
    } else {
      console.log('  ✅');
    }
  }
} else {
  console.log('✅ Migration completed successfully!');
}

console.log('\n📊 Verifying schema...');

// Check if columns exist
const { data: cols } = await supabase
  .from('events')
  .select('*')
  .limit(1);

if (cols) {
  console.log('✅ events.wrap_stats:', cols[0]?.wrap_stats !== undefined ? 'exists' : 'missing');
}

const { data: awards } = await supabase
  .from('award_assignments')
  .select('*')
  .limit(1);

if (awards) {
  console.log('✅ award_assignments.person_type:', awards[0]?.person_type !== undefined ? 'exists' : 'missing');
}
