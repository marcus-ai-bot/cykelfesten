/**
 * Migration script: Convert legacy string[] fun facts to structured JSON objects.
 * 
 * Run: npx tsx scripts/migrate-fun-facts.ts
 * 
 * Safe to run multiple times — skips entries that are already objects.
 */

import { createClient } from '@supabase/supabase-js';
import { parseLegacyFunFacts } from '../src/lib/fun-facts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  const { data: couples, error } = await supabase
    .from('couples')
    .select('id, invited_fun_facts, partner_fun_facts');

  if (error) {
    console.error('Failed to fetch couples:', error);
    process.exit(1);
  }

  let migrated = 0;
  let skipped = 0;

  for (const couple of couples ?? []) {
    const updates: Record<string, unknown> = {};

    if (Array.isArray(couple.invited_fun_facts)) {
      updates.invited_fun_facts = parseLegacyFunFacts(couple.invited_fun_facts);
    }
    if (Array.isArray(couple.partner_fun_facts)) {
      updates.partner_fun_facts = parseLegacyFunFacts(couple.partner_fun_facts);
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('couples')
        .update(updates)
        .eq('id', couple.id);

      if (updateError) {
        console.error(`Failed to update couple ${couple.id}:`, updateError);
      } else {
        migrated++;
        console.log(`✅ Migrated couple ${couple.id}:`, JSON.stringify(updates));
      }
    } else {
      skipped++;
    }
  }

  console.log(`\nDone! Migrated: ${migrated}, Skipped (already object/null): ${skipped}`);
}

migrate();
