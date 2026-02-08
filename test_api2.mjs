import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

const supabase = createClient(url, serviceKey);

const eventId = 'd4a3ddf6-191c-4427-a9b2-5aad98600d6a';

// Test couples query with corrected columns
console.log('Testing couples query...');
const { data: couples, error: couplesError } = await supabase
  .from('couples')
  .select(`
    id,
    invited_name,
    partner_name,
    invited_birth_year,
    partner_birth_year,
    invited_fun_facts,
    partner_fun_facts,
    invited_allergies,
    partner_allergies,
    created_at
  `)
  .eq('event_id', eventId)
  .eq('confirmed', true);

if (couplesError) {
  console.log('❌ Error:', couplesError);
} else {
  console.log('✅ Found', couples?.length, 'couples');
  console.log('Names:', couples?.map(c => c.invited_name).join(', '));
}
