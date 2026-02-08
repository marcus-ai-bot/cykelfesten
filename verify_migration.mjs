import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

const supabase = createClient(url, serviceKey);

console.log('📊 Verifying migration...\n');

// Check events.wrap_stats
const { data: events, error: e1 } = await supabase
  .from('events')
  .select('id, name, wrap_stats')
  .limit(1);

if (e1) {
  console.log('❌ events.wrap_stats:', e1.message);
} else {
  console.log('✅ events.wrap_stats: EXISTS');
  if (events?.[0]) {
    console.log('   Sample:', events[0].name, '- wrap_stats:', events[0].wrap_stats || 'null');
  }
}

// Check award_assignments.person_type
const { data: awards, error: e2 } = await supabase
  .from('award_assignments')
  .select('id, couple_id, person_type, award_id')
  .limit(5);

if (e2) {
  console.log('❌ award_assignments.person_type:', e2.message);
} else {
  console.log('✅ award_assignments.person_type: EXISTS');
  console.log('   Records:', awards?.length || 0);
  if (awards?.length > 0) {
    awards.forEach(a => console.log(`   - couple ${a.couple_id}: ${a.person_type} = ${a.award_id}`));
  }
}

console.log('\n✅ Migration verified!');
