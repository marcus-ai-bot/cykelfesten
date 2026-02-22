/**
 * Fix ALL fun facts: re-migrate string[] → structured JSON with better patterns.
 * Run: npx tsx scripts/fix-music-decade.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envFile = readFileSync('.env.local', 'utf-8');
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Broad music decade patterns
const MUSIC_PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/(\d{4})-talets?\s*(musik|hits)/i, (m) => m[1].slice(0, -1)],  // "2000-talets hits" → "200" no...
  [/(\d{2,4})-tal/i, (m) => { const v = m[1]; return v.length === 4 ? String(Math.floor(parseInt(v)/10)*10).slice(-2) : v; }],
  [/från (\d{2,4})/i, (m) => { const v = m[1]; return v.length === 4 ? String(Math.floor(parseInt(v)/10)*10).slice(-2) : v; }],
  [/(\d{2,4}).*musik/i, (m) => { const v = m[1]; return v.length === 4 ? String(Math.floor(parseInt(v)/10)*10).slice(-2) : v; }],
  [/musik.*(\d{2,4})/i, (m) => { const v = m[1]; return v.length === 4 ? String(Math.floor(parseInt(v)/10)*10).slice(-2) : v; }],
  [/Uppvuxen med (\d{2,4})/i, (m) => { const v = m[1]; return v.length === 4 ? String(Math.floor(parseInt(v)/10)*10).slice(-2) : v; }],
];

const FACT_PATTERNS: [RegExp, string, (m: RegExpMatchArray) => string][] = [
  [/^Har husdjur:\s*(.+)$/i, 'pet', (m) => m[1]],
  [/^Husdjur:\s*(.+)$/i, 'pet', (m) => m[1]],
  [/^Hemligt talent:\s*(.+)$/i, 'talent', (m) => m[1]],
  [/^Första jobbet var\s+(.+)$/i, 'firstJob', (m) => m[1]],
  [/^Första jobbet:\s*(.+)$/i, 'firstJob', (m) => m[1]],
  [/^Drömresmål:\s*(.+)$/i, 'dreamDestination', (m) => m[1]],
  [/^Spelar\s+(.+)$/i, 'instruments', (m) => m[1]],
  [/^Sportar:\s*(.+)$/i, 'sport', (m) => m[1]],
  [/^Viktigt år:\s*(.+)$/i, 'importantYear', (m) => m[1]],
];

function parseOneFact(text: string): { key: string; value: string } | null {
  // Check music patterns first
  for (const [pattern, extract] of MUSIC_PATTERNS) {
    const m = text.match(pattern);
    if (m) return { key: 'musicDecade', value: extract(m) };
  }
  // Then other patterns
  for (const [pattern, key, extract] of FACT_PATTERNS) {
    const m = text.match(pattern);
    if (m) return { key, value: extract(m) };
  }
  return null;
}

function migrateFacts(raw: unknown): { migrated: boolean; result: any } {
  if (!raw) return { migrated: false, result: raw };
  
  // Already an object (not array) → check if unknownFact has music decade
  if (!Array.isArray(raw) && typeof raw === 'object') {
    const obj = raw as any;
    if (obj.unknownFact && !obj.musicDecade) {
      const parsed = parseOneFact(obj.unknownFact);
      if (parsed && parsed.key === 'musicDecade') {
        const fixed = { ...obj, musicDecade: parsed.value };
        delete fixed.unknownFact;
        return { migrated: true, result: fixed };
      }
    }
    return { migrated: false, result: raw };
  }

  // String array → parse all
  if (Array.isArray(raw)) {
    const result: Record<string, string> = {};
    const unmatched: string[] = [];
    
    for (const fact of raw) {
      if (typeof fact !== 'string') continue;
      const parsed = parseOneFact(fact);
      if (parsed && !result[parsed.key]) {
        result[parsed.key] = parsed.value;
      } else {
        unmatched.push(fact);
      }
    }
    
    if (unmatched.length > 0 && !result.unknownFact) {
      result.unknownFact = unmatched[0];
    }
    
    return { migrated: true, result: Object.keys(result).length > 0 ? result : null };
  }

  return { migrated: false, result: raw };
}

async function main() {
  const { data: couples, error } = await supabase
    .from('couples')
    .select('id, invited_name, invited_fun_facts, partner_fun_facts');

  if (error) { console.error(error); process.exit(1); }

  let fixed = 0;
  for (const c of couples ?? []) {
    const updates: Record<string, any> = {};

    const inv = migrateFacts(c.invited_fun_facts);
    if (inv.migrated) updates.invited_fun_facts = inv.result;

    const par = migrateFacts(c.partner_fun_facts);
    if (par.migrated) updates.partner_fun_facts = par.result;

    if (Object.keys(updates).length > 0) {
      const { error: err } = await supabase.from('couples').update(updates).eq('id', c.id);
      if (err) console.error(`❌ ${c.invited_name}:`, err.message);
      else {
        console.log(`✅ ${c.invited_name}:`, JSON.stringify(updates));
        fixed++;
      }
    }
  }

  console.log(`\nFixed ${fixed} of ${couples?.length ?? 0} couples.`);
}

main();
