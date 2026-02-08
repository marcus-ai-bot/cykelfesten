import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];
const projectRef = url.match(/https:\/\/(.+?)\.supabase/)?.[1];

console.log('🗄️  Applying migration via direct table operations...\n');

// Instead of raw SQL, use Supabase client to make the changes
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, serviceKey);

// Step 1: Check if wrap_stats column exists
console.log('[1/3] Checking events.wrap_stats...');
const { data: eventTest, error: e1 } = await supabase
  .from('events')
  .select('wrap_stats')
  .limit(1);

if (e1 && e1.code === '42703') {
  console.log('  Column missing - needs manual SQL (see below)');
} else {
  console.log('  ✅ Column exists or accessible');
}

// Step 2: Check award_assignments.person_type
console.log('\n[2/3] Checking award_assignments.person_type...');
const { data: awardTest, error: e2 } = await supabase
  .from('award_assignments')
  .select('person_type')
  .limit(1);

if (e2 && e2.code === '42703') {
  console.log('  Column missing - needs manual SQL (see below)');
} else {
  console.log('  ✅ Column exists or accessible');
}

// Step 3: Print manual instructions
console.log('\n' + '='.repeat(60));
console.log('MANUAL MIGRATION REQUIRED');
console.log('='.repeat(60));
console.log('\n📍 Go to: https://supabase.com/dashboard/project/kbqmjsohgnjlirdsnxyo/sql/new\n');
console.log('📋 Copy-paste this SQL:\n');
console.log(readFileSync('supabase/migrations/20260208_personal_wraps.sql', 'utf8'));
console.log('\n✅ Then click RUN\n');
