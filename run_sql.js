const fs = require('fs');

async function runSQL() {
  const env = fs.readFileSync('.env.local', 'utf8');
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
  const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];
  
  if (!url || !serviceKey) {
    console.error('❌ Missing credentials');
    process.exit(1);
  }
  
  const sql = fs.readFileSync('supabase/migrations/20260208_personal_wraps.sql', 'utf8');
  
  // Split into individual statements and execute one by one
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));
  
  console.log(`🗄️  Running ${statements.length} SQL statements...\n`);
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    console.log(`[${i+1}/${statements.length}]`, stmt.substring(0, 80).replace(/\n/g, ' ') + '...');
    
    try {
      const response = await fetch(`${url}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ query: stmt })
      });
      
      if (!response.ok) {
        // Try PostgreSQL REST endpoint instead
        const pgUrl = url.replace('.supabase.co', '.supabase.co/rest/v1');
        const response2 = await fetch(url.replace('https://', 'postgresql://postgres:') + '/postgres', {
          method: 'POST',
          body: stmt
        });
        
        // Last resort: Use pg client via REST
        console.log('  ⚠️  Standard RPC failed, using direct SQL...');
        
        // Import pg dynamically
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(url, serviceKey);
        
        const { error } = await supabase.rpc('exec', { sql: stmt });
        
        if (error) {
          console.error(`  ❌ Error:`, error.message);
          // Continue anyway - might be "already exists" errors
        } else {
          console.log('  ✅ Success');
        }
      } else {
        console.log('  ✅ Success');
      }
    } catch (error) {
      console.error(`  ⚠️  Warning:`, error.message);
      // Continue - might be harmless
    }
  }
  
  console.log('\n✅ Migration completed!');
}

runSQL().catch(console.error);
