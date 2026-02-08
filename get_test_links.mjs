import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

const supabase = createClient(url, serviceKey);

// Get couples with awards
const { data: assignments } = await supabase
  .from('award_assignments')
  .select('couple_id, person_type, award_id, value, couples(invited_name, partner_name)')
  .limit(6);

console.log('🔗 TEST LINKS\n');
console.log('═'.repeat(50));

if (assignments && assignments.length > 0) {
  const seen = new Set();
  
  for (const a of assignments) {
    const key = `${a.couple_id}:${a.person_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    
    const name = a.person_type === 'partner' 
      ? a.couples?.partner_name 
      : a.couples?.invited_name;
    
    console.log(`\n👤 ${name} (${a.award_id})`);
    console.log(`   Wrap:  https://cykelfesten.vercel.app/e/demo/wrap?coupleId=${a.couple_id}&person=${a.person_type}`);
    console.log(`   Award: https://cykelfesten.vercel.app/e/demo/award?coupleId=${a.couple_id}&person=${a.person_type}`);
  }
} else {
  console.log('Inga awards tilldelade ännu!');
}

console.log('\n' + '═'.repeat(50));
console.log('\n📱 Admin: https://cykelfesten.vercel.app/admin/d4a3ddf6-191c-4427-a9b2-5aad98600d6a/awards');
