import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];

const supabase = createClient(url, serviceKey);

// Get one couple to see available columns
const { data, error } = await supabase
  .from('couples')
  .select('*')
  .limit(1)
  .single();

if (error) {
  console.log('Error:', error);
} else {
  console.log('Available columns:');
  console.log(Object.keys(data).join(', '));
  console.log('\nSample data:');
  console.log(JSON.stringify(data, null, 2));
}
