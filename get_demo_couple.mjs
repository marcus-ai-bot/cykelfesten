import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

const supabase = createClient(url, serviceKey);

// Get demo event
const { data: event } = await supabase
  .from('events')
  .select('id, slug')
  .eq('slug', 'demo')
  .single();

if (!event) {
  console.log('No demo event found');
  process.exit(1);
}

// Get a couple from demo event
const { data: couples } = await supabase
  .from('couples')
  .select('id, invited_name, partner_name')
  .eq('event_id', event.id)
  .limit(3);

console.log('Demo event couples:\n');
couples?.forEach(c => {
  console.log(`${c.invited_name}${c.partner_name ? ' & ' + c.partner_name : ''}:`);
  console.log(`  Wrap (invited): https://cykelfesten.vercel.app/e/demo/wrap?coupleId=${c.id}&person=invited`);
  if (c.partner_name) {
    console.log(`  Wrap (partner): https://cykelfesten.vercel.app/e/demo/wrap?coupleId=${c.id}&person=partner`);
  }
  console.log('');
});
