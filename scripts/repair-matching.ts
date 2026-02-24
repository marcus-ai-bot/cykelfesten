#!/usr/bin/env tsx

/**
 * Repair matching consistency issues.
 * Run with: npx tsx scripts/repair-matching.ts [--fix] [--event-id=xxx]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kbqmjsohgnjlirdsnxyo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const eventArg = args.find(arg => arg.startsWith('--event-id='));
const eventId = eventArg ? eventArg.split('=')[1] : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function key(matchPlanId: string, coupleId: string, course: string) {
  return `${matchPlanId}:${coupleId}:${course}`;
}

async function main() {
  const matchPlansQuery = supabase.from('match_plans').select('id, event_id');
  const { data: matchPlans } = eventId
    ? await matchPlansQuery.eq('event_id', eventId)
    : await matchPlansQuery;

  if (!matchPlans || matchPlans.length === 0) {
    console.log('No match plans found.');
    return;
  }

  const matchPlanIds = matchPlans.map(p => p.id);
  const eventIds = [...new Set(matchPlans.map(p => p.event_id))];

  const { data: pairings } = await supabase
    .from('course_pairings')
    .select('*')
    .in('match_plan_id', matchPlanIds);

  const { data: envelopes } = await supabase
    .from('envelopes')
    .select('*')
    .in('match_plan_id', matchPlanIds);

  const { data: couples } = await supabase
    .from('couples')
    .select('id, event_id, cancelled, address, address_notes')
    .in('event_id', eventIds);

  const coupleMap = new Map((couples ?? []).map(c => [c.id, c]));

  const pairingMap = new Map<string, typeof pairings[number]>();
  const pairingKeys = new Set<string>();
  const duplicatePairings: string[] = [];

  for (const pairing of pairings ?? []) {
    const k = key(pairing.match_plan_id, pairing.guest_couple_id, pairing.course);
    if (pairingKeys.has(k)) {
      duplicatePairings.push(k);
    }
    pairingKeys.add(k);
    pairingMap.set(k, pairing);
  }

  const envelopeMap = new Map<string, typeof envelopes[number][]>();
  for (const env of envelopes ?? []) {
    const k = key(env.match_plan_id, env.couple_id, env.course);
    if (!envelopeMap.has(k)) envelopeMap.set(k, []);
    envelopeMap.get(k)!.push(env);
  }

  const missingEnvelopes: string[] = [];
  const orphanEnvelopes: string[] = [];
  const hostMismatches: { key: string; pairingHost: string; envelopeHost: string | null }[] = [];
  const duplicateEnvelopes: string[] = [];
  const cancelledCouplePairings: string[] = [];

  for (const k of pairingKeys) {
    const pairing = pairingMap.get(k);
    const envs = envelopeMap.get(k) ?? [];

    if (!envs.length) {
      missingEnvelopes.push(k);
      continue;
    }

    if (envs.length > 1) {
      duplicateEnvelopes.push(k);
    }

    const env = envs.find(e => !e.cancelled) ?? envs[0];
    if (pairing && env && pairing.host_couple_id !== env.host_couple_id) {
      hostMismatches.push({
        key: k,
        pairingHost: pairing.host_couple_id,
        envelopeHost: env.host_couple_id ?? null,
      });
    }
  }

  for (const [k, envs] of envelopeMap.entries()) {
    if (!pairingKeys.has(k)) {
      orphanEnvelopes.push(k);
    }
  }

  for (const pairing of pairings ?? []) {
    const guest = coupleMap.get(pairing.guest_couple_id);
    const host = coupleMap.get(pairing.host_couple_id);
    if (guest?.cancelled || host?.cancelled) {
      cancelledCouplePairings.push(
        `${pairing.match_plan_id}:${pairing.guest_couple_id}:${pairing.host_couple_id}:${pairing.course}`
      );
    }
  }

  console.log('--- Matching Repair Report ---');
  console.log(`Match plans checked: ${matchPlanIds.length}`);
  console.log(`Missing envelopes: ${missingEnvelopes.length}`);
  console.log(`Orphan envelopes: ${orphanEnvelopes.length}`);
  console.log(`Host mismatches: ${hostMismatches.length}`);
  console.log(`Duplicate envelopes: ${duplicateEnvelopes.length}`);
  console.log(`Cancelled couples still paired: ${cancelledCouplePairings.length}`);
  console.log(`Duplicate pairings (same guest/course/plan): ${duplicatePairings.length}`);

  if (!fix) {
    console.log('Run with --fix to apply repairs.');
    return;
  }

  // Fix orphan envelopes: cancel them
  for (const k of orphanEnvelopes) {
    const [match_plan_id, couple_id, course] = k.split(':');
    await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', match_plan_id)
      .eq('couple_id', couple_id)
      .eq('course', course)
      .eq('cancelled', false);
  }

  // Fix host mismatches: update envelope host + destination
  for (const mismatch of hostMismatches) {
    const [match_plan_id, couple_id, course] = mismatch.key.split(':');
    const hostCouple = coupleMap.get(mismatch.pairingHost);

    await supabase
      .from('envelopes')
      .update({
        host_couple_id: mismatch.pairingHost,
        destination_address: hostCouple?.address ?? null,
        destination_notes: hostCouple?.address_notes ?? null,
      })
      .eq('match_plan_id', match_plan_id)
      .eq('couple_id', couple_id)
      .eq('course', course)
      .eq('cancelled', false);
  }

  // Fix duplicates: cancel all but the newest
  for (const k of duplicateEnvelopes) {
    const envs = envelopeMap.get(k) ?? [];
    const sorted = [...envs].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });

    const [keep, ...toCancel] = sorted;
    for (const env of toCancel) {
      await supabase
        .from('envelopes')
        .update({ cancelled: true })
        .eq('id', env.id);
    }

    if (!keep.cancelled) {
      // keep as-is
    }
  }

  // Fix missing envelopes: remove pairings (forces re-placement)
  for (const k of missingEnvelopes) {
    const [match_plan_id, couple_id, course] = k.split(':');
    await supabase
      .from('course_pairings')
      .delete()
      .eq('match_plan_id', match_plan_id)
      .eq('guest_couple_id', couple_id)
      .eq('course', course);
  }

  // Fix cancelled couples still paired: delete pairings + cancel envelopes
  for (const entry of cancelledCouplePairings) {
    const [match_plan_id, guest_couple_id, host_couple_id, course] = entry.split(':');
    await supabase
      .from('course_pairings')
      .delete()
      .eq('match_plan_id', match_plan_id)
      .eq('guest_couple_id', guest_couple_id)
      .eq('host_couple_id', host_couple_id)
      .eq('course', course);

    await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', match_plan_id)
      .eq('couple_id', guest_couple_id)
      .eq('course', course);
  }

  console.log('Repairs applied.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
