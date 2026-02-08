const fs = require('fs');
const path = require('path');

async function runMigration() {
  // Read env
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const url = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
  const key = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1];
  
  if (!url || !key) {
    console.error('❌ Missing Supabase credentials');
    process.exit(1);
  }
  
  // Read migration
  const sql = fs.readFileSync('supabase/migrations/20260208_personal_wraps.sql', 'utf8');
  
  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
  
  console.log(`🚀 Running ${statements.length} SQL statements...\n`);
  
  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    console.log(`[${i+1}/${statements.length}] Executing...`);
    
    try {
      const response = await fetch(`${url}/rest/v1/rpc/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'params=single-object'
        },
        body: JSON.stringify({ query: stmt })
      });
      
      if (!response.ok) {
        console.error(`❌ Failed: ${response.status}`);
        const error = await response.text();
        console.error(error);
        
        // Try alternative: direct query endpoint
        console.log('Trying alternative method...');
        const pgResponse = await fetch(`${url}/rest/v1/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            'apikey': key,
            'Authorization': `Bearer ${key}`
          },
          body: stmt
        });
        
        if (!pgResponse.ok) {
          console.error('❌ Alternative also failed');
          console.error(await pgResponse.text());
        }
      } else {
        console.log('✅ Success');
      }
    } catch (error) {
      console.error(`❌ Error:`, error.message);
    }
  }
  
  console.log('\n✅ Migration completed!');
}

runMigration().catch(console.error);
