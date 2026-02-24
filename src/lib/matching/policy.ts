import type { SupabaseClient } from '@supabase/supabase-js';
import type { Course } from '@/types/database';

export interface RevealWarning {
  type: 'reveal_freeze';
  message: string;
  affected_envelopes: number;
}

export interface CapacityWarning {
  type: 'capacity';
  message: string;
  current_guest_count: number;
  max_guests: number;
}

export interface DuplicateAddressWarning {
  type: 'duplicate_address';
  message: string;
  duplicate_couple_ids: string[];
}

export async function checkRevealFreezeWarning(options: {
  supabase: SupabaseClient;
  matchPlanId: string;
  hostCoupleId: string;
}): Promise<RevealWarning | null> {
  const { supabase, matchPlanId, hostCoupleId } = options;

  const { data: activated } = await supabase
    .from('envelopes')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', hostCoupleId)
    .not('activated_at', 'is', null)
    .eq('cancelled', false);

  if (!activated || activated.length === 0) {
    return null;
  }

  return {
    type: 'reveal_freeze',
    message: `⚠️ ${activated.length} kuvert har redan aktiverats — gäster kan ha sett gamla adressen`,
    affected_envelopes: activated.length,
  };
}

export async function checkCapacityWarning(options: {
  supabase: SupabaseClient;
  eventId: string;
  matchPlanId: string;
  hostCoupleId: string;
  course: Course;
  guestCoupleId: string;
}): Promise<CapacityWarning | null> {
  const { supabase, eventId, matchPlanId, hostCoupleId, course, guestCoupleId } = options;

  const { data: hostAssignment } = await supabase
    .from('assignments')
    .select('max_guests')
    .eq('event_id', eventId)
    .eq('couple_id', hostCoupleId)
    .eq('course', course)
    .eq('is_host', true)
    .single();

  if (!hostAssignment) {
    return null;
  }

  const { data: currentPairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', hostCoupleId)
    .eq('course', course);

  const guestIds = [...new Set((currentPairings ?? []).map(p => p.guest_couple_id))];
  if (!guestIds.includes(guestCoupleId)) {
    guestIds.push(guestCoupleId);
  }

  const { data: guestCouples } = await supabase
    .from('couples')
    .select('id, person_count')
    .eq('event_id', eventId)
    .in('id', guestIds);

  const currentGuestCount = (guestCouples ?? []).reduce(
    (sum, c) => sum + (c.person_count ?? 2),
    0
  );

  if (currentGuestCount <= hostAssignment.max_guests) {
    return null;
  }

  return {
    type: 'capacity',
    message: `⚠️ Värdens kapacitet överskrids (${currentGuestCount}/${hostAssignment.max_guests})`,
    current_guest_count: currentGuestCount,
    max_guests: hostAssignment.max_guests,
  };
}

export async function checkDuplicateAddressWarning(options: {
  supabase: SupabaseClient;
  eventId: string;
  address: string;
  coupleId?: string;
}): Promise<DuplicateAddressWarning | null> {
  const { supabase, eventId, address, coupleId } = options;

  const { data: duplicates } = await supabase
    .from('couples')
    .select('id')
    .eq('event_id', eventId)
    .eq('address', address)
    .eq('cancelled', false);

  const duplicateIds = (duplicates ?? [])
    .map(d => d.id)
    .filter(id => id !== coupleId);

  if (duplicateIds.length === 0) {
    return null;
  }

  return {
    type: 'duplicate_address',
    message: `⚠️ Adressen används redan av ${duplicateIds.length} andra par`,
    duplicate_couple_ids: duplicateIds,
  };
}
