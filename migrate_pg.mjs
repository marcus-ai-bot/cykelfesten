import pg from 'pg';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbPassword = env.match(/SUPABASE_DB_PASSWORD=(.*)/)?.[1];
const projectRef = env.match(/NEXT_PUBLIC_SUPABASE_URL=https:\/\/(.+?)\.supabase/)?.[1];

if (!dbPassword || !projectRef) {
  console.error('❌ Missing DB credentials');
  process.exit(1);
}

// Direct connection to Supabase Postgres
const connectionString = `postgresql://postgres.${projectRef}:${dbPassword}@aws-0-eu-north-1.pooler.supabase.com:6543/postgres`;

console.log('🔌 Connecting to Supabase Postgres...');

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  console.log('✅ Connected!\n');
  
  const sql = readFileSync('supabase/migrations/20260208_personal_wraps.sql', 'utf8');
  
  console.log('🗄️  Running migration...\n');
  
  // Execute entire migration
  await client.query(sql);
  
  console.log('✅ Migration completed successfully!\n');
  
  // Verify
  console.log('📊 Verifying schema...');
  
  const { rows: eventCols } = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'events' AND column_name = 'wrap_stats'
  `);
  console.log('✅ events.wrap_stats:', eventCols.length > 0 ? 'exists' : 'missing');
  
  const { rows: awardCols } = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'award_assignments' AND column_name = 'person_type'
  `);
  console.log('✅ award_assignments.person_type:', awardCols.length > 0 ? 'exists' : 'missing');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  await client.end();
}
