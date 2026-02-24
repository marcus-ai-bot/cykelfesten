import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kbqmjsohgnjlirdsnxyo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImticW1qc29oZ25qbGlyZHNueHlvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI5MzgxOSwiZXhwIjoyMDg1ODY5ODE5fQ.eP8e8KdvTs6FRRmu4aCq6zp1ep5iTaMowUdmGTMALcQ';

const supabase = createClient(supabaseUrl, supabaseKey);

const eventId = '14df2533-ab0d-4d42-ae4f-2f8aad375b17';

async function testMatching() {
  console.log('🎯 TEST 1: Kör matchning med 6 par');
  
  // Check couples
  const { data: couples } = await supabase
    .from('couples')
    .select('invited_name, partner_name, course_preference, confirmed')
    .eq('event_id', eventId)
    .eq('cancelled', false);
  
  console.log(`   Par: ${couples.length}`);
  couples.forEach(c => console.log(`   - ${c.invited_name} & ${c.partner_name} (pref: ${c.course_preference || 'ingen'})`));
  
  // Trigger match via API
  const response = await fetch('http://localhost:3000/api/matching', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_id: eventId })
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('   ✅ Matchning lyckades');
    console.log(`   Stats: ${JSON.stringify(result.stats, null, 2)}`);
    
    // Verify assignments
    const { data: assignments } = await supabase
      .from('assignments')
      .select('couple_id, course, is_host')
      .eq('event_id', eventId);
    
    console.log(`   Assignments: ${assignments.length}`);
    
    // Verify course pairings
    const { data: pairings } = await supabase
      .from('course_pairings')
      .select('*')
      .eq('match_plan_id', result.match_plan_id);
    
    console.log(`   Pairings: ${pairings.length}`);
    
  } else {
    console.log(`   ❌ FEL: ${result.error}`);
  }
}

testMatching().catch(console.error);
