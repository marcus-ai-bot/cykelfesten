import type { SupabaseClient } from '@supabase/supabase-js';
import type { Course } from '@/types/database';

export type CascadeType =
  | 'guest_dropout'
  | 'host_dropout'
  | 'address_change'
  | 'reassign'
  | 'resign_host'
  | 'split'
  | 'transfer_host'
  | 'promote_host';

export interface CascadeInput {
  supabase: SupabaseClient;
  eventId: string;
  matchPlanId: string;
  type: CascadeType;
  coupleId: string;
  details?: {
    newAddress?: string;
    newAddressNotes?: string | null;
    newHostCoupleId?: string;
    course?: Course;
    courses?: Course[];
    toCoupleId?: string;
    newCoupleId?: string;
  };
}

export interface CascadeResult {
  success: boolean;
  envelopesCancelled: number;
  envelopesCreated: number;
  envelopesUpdated: number;
  pairingsRemoved: number;
  pairingsCreated: number;
  assignmentsRemoved: number;
  assignmentsCreated: number;
  unplacedGuests: string[];
  errors: string[];
}

export async function cascadeChanges(input: CascadeInput): Promise<CascadeResult> {
  const result: CascadeResult = {
    success: true,
    envelopesCancelled: 0,
    envelopesCreated: 0,
    envelopesUpdated: 0,
    pairingsRemoved: 0,
    pairingsCreated: 0,
    assignmentsRemoved: 0,
    assignmentsCreated: 0,
    unplacedGuests: [],
    errors: [],
  };

  if (!input.eventId || !input.matchPlanId || !input.coupleId || !input.type) {
    return {
      ...result,
      success: false,
      errors: ['eventId, matchPlanId, coupleId, and type are required'],
    };
  }

  switch (input.type) {
    case 'guest_dropout':
      return handleGuestDropout(input, result);
    case 'host_dropout':
      return handleHostDropout(input, result);
    case 'address_change':
      return handleAddressChange(input, result);
    case 'reassign':
      return handleReassign(input, result);
    case 'resign_host':
      return handleResignHost(input, result);
    case 'split':
      return handleSplit(input, result);
    case 'transfer_host':
      return handleTransferHost(input, result);
    case 'promote_host':
      return handlePromoteHost(input, result);
    default:
      return {
        ...result,
        success: false,
        errors: [`Unknown cascade type: ${input.type}`],
      };
  }
}

async function handleGuestDropout(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, matchPlanId, coupleId } = input;

  const { data: activeEnvelopes } = await supabase
    .from('envelopes')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('cancelled', false);

  const { data: guestPairings } = await supabase
    .from('course_pairings')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId);

  if (activeEnvelopes && activeEnvelopes.length > 0) {
    const { data: cancelled } = await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', matchPlanId)
      .eq('couple_id', coupleId)
      .eq('cancelled', false)
      .select('id');

    result.envelopesCancelled = cancelled?.length ?? 0;
  }

  if (guestPairings && guestPairings.length > 0) {
    const { data: removed } = await supabase
      .from('course_pairings')
      .delete()
      .eq('match_plan_id', matchPlanId)
      .eq('guest_couple_id', coupleId)
      .select('id');

    result.pairingsRemoved = removed?.length ?? 0;
  }

  return result;
}

async function handleHostDropout(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, eventId, matchPlanId, coupleId } = input;

  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId);

  const { data: guestPairings } = await supabase
    .from('course_pairings')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId);

  const unplaced = new Set<string>();
  for (const pairing of hostPairings ?? []) {
    if (pairing.guest_couple_id && pairing.guest_couple_id !== coupleId) {
      unplaced.add(pairing.guest_couple_id);
    }
  }

  const { data: cancelledHostEnvs } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCancelled += cancelledHostEnvs?.length ?? 0;

  const { data: cancelledOwnEnvs } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCancelled += cancelledOwnEnvs?.length ?? 0;

  const { data: removedHostPairings } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .select('id');

  const { data: removedGuestPairings } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .select('id');

  result.pairingsRemoved = (removedHostPairings?.length ?? 0) + (removedGuestPairings?.length ?? 0);

  const { data: removedAssignments } = await supabase
    .from('assignments')
    .delete()
    .eq('event_id', eventId)
    .eq('couple_id', coupleId)
    .select('id');

  result.assignmentsRemoved = removedAssignments?.length ?? 0;
  result.unplacedGuests = [...unplaced];

  return result;
}

async function handleAddressChange(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, matchPlanId, coupleId, details } = input;
  const newAddress = details?.newAddress;

  if (!newAddress) {
    return {
      ...result,
      success: false,
      errors: ['details.newAddress is required for address_change'],
    };
  }

  const { data: activeEnvelopes } = await supabase
    .from('envelopes')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .eq('cancelled', false);

  if (!activeEnvelopes || activeEnvelopes.length === 0) {
    return result;
  }

  const { data: updated } = await supabase
    .from('envelopes')
    .update({
      destination_address: newAddress,
      destination_notes: details?.newAddressNotes ?? null,
    })
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');

  result.envelopesUpdated = updated?.length ?? 0;

  return result;
}

async function handleReassign(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, matchPlanId, coupleId, details } = input;
  const course = details?.course;
  const newHostCoupleId = details?.newHostCoupleId;

  if (!course || !newHostCoupleId) {
    return {
      ...result,
      success: false,
      errors: ['details.course and details.newHostCoupleId are required for reassign'],
    };
  }

  await supabase
    .from('course_pairings')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .eq('course', course);

  await supabase
    .from('envelopes')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('course', course)
    .eq('cancelled', false);

  const { data: removedPairings } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .eq('course', course)
    .select('id');

  result.pairingsRemoved = removedPairings?.length ?? 0;

  // DELETE old envelopes (not just cancel) to avoid unique constraint violation
  // when creating the replacement envelope. The unique constraint is on
  // (match_plan_id, couple_id, course) and doesn't exclude cancelled rows.
  const { data: deletedEnvelopes } = await supabase
    .from('envelopes')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('course', course)
    .select('id');

  result.envelopesCancelled = deletedEnvelopes?.length ?? 0;

  const { error: pairingError } = await supabase
    .from('course_pairings')
    .insert({
      match_plan_id: matchPlanId,
      course,
      host_couple_id: newHostCoupleId,
      guest_couple_id: coupleId,
    });

  if (pairingError) {
    return {
      ...result,
      success: false,
      errors: [`Failed to insert pairing: ${pairingError.message}`],
    };
  }

  result.pairingsCreated = 1;
  return result;
}

async function handleResignHost(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, eventId, matchPlanId, coupleId } = input;

  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId);

  const unplaced = new Set<string>();
  for (const pairing of hostPairings ?? []) {
    if (pairing.guest_couple_id && pairing.guest_couple_id !== coupleId) {
      unplaced.add(pairing.guest_couple_id);
    }
  }

  const { data: cancelledEnvelopes } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCancelled = cancelledEnvelopes?.length ?? 0;

  const { data: removedHostPairings } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .select('id');

  result.pairingsRemoved = removedHostPairings?.length ?? 0;

  const { data: removedAssignments } = await supabase
    .from('assignments')
    .delete()
    .eq('event_id', eventId)
    .eq('couple_id', coupleId)
    .eq('is_host', true)
    .select('id');

  result.assignmentsRemoved = removedAssignments?.length ?? 0;
  result.unplacedGuests = [...unplaced];

  return result;
}

async function handleSplit(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const newCoupleId = input.details?.newCoupleId;
  if (newCoupleId) {
    result.unplacedGuests = [newCoupleId];
  }
  return result;
}

async function handleTransferHost(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, eventId, matchPlanId, coupleId, details } = input;
  const toCoupleId = details?.toCoupleId;
  const courses = details?.courses;

  if (!toCoupleId || !courses || courses.length === 0) {
    return {
      ...result,
      success: false,
      errors: ['details.toCoupleId and details.courses are required for transfer_host'],
    };
  }

  const { data: toCouple } = await supabase
    .from('couples')
    .select('id, address, address_notes')
    .eq('id', toCoupleId)
    .single();

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, course, max_guests, is_flex_host, flex_extra_capacity, is_emergency_host')
    .eq('event_id', eventId)
    .eq('couple_id', coupleId)
    .eq('is_host', true)
    .in('course', courses);

  if (assignments && assignments.length > 0) {
    const assignmentIds = assignments.map(a => a.id);
    const { data: removedAssignments } = await supabase
      .from('assignments')
      .delete()
      .in('id', assignmentIds)
      .select('id');

    result.assignmentsRemoved = removedAssignments?.length ?? 0;

    const { data: createdAssignments } = await supabase
      .from('assignments')
      .insert(
        assignments.map(a => ({
          event_id: eventId,
          couple_id: toCoupleId,
          course: a.course,
          is_host: true,
          max_guests: a.max_guests,
          is_flex_host: a.is_flex_host,
          flex_extra_capacity: a.flex_extra_capacity,
          is_emergency_host: a.is_emergency_host,
        }))
      )
      .select('id');

    result.assignmentsCreated = createdAssignments?.length ?? 0;
  }

  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id, course')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .in('course', courses);

  if (hostPairings && hostPairings.length > 0) {
    const guestIds = [...new Set(hostPairings.map(p => p.guest_couple_id))];
    const { data: updatedPairings } = await supabase
      .from('course_pairings')
      .update({ host_couple_id: toCoupleId })
      .eq('match_plan_id', matchPlanId)
      .eq('host_couple_id', coupleId)
      .in('course', courses)
      .select('id');

    result.pairingsRemoved = 0;
    result.pairingsCreated = updatedPairings?.length ?? 0;

    if (guestIds.length > 0) {
      const { data: updatedEnvelopes } = await supabase
        .from('envelopes')
        .update({
          host_couple_id: toCoupleId,
          destination_address: toCouple?.address ?? null,
          destination_notes: toCouple?.address_notes ?? null,
        })
        .eq('match_plan_id', matchPlanId)
        .in('couple_id', guestIds)
        .in('course', courses)
        .eq('cancelled', false)
        .select('id');

      result.envelopesUpdated = updatedEnvelopes?.length ?? 0;
    }
  }

  return result;
}

async function handlePromoteHost(
  input: CascadeInput,
  result: CascadeResult
): Promise<CascadeResult> {
  const { supabase, matchPlanId, coupleId, details } = input;
  const course = details?.course;

  if (!course) {
    return {
      ...result,
      success: false,
      errors: ['details.course is required for promote_host'],
    };
  }

  await supabase
    .from('course_pairings')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .eq('course', course);

  const { data: removedPairings } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .eq('course', course)
    .select('id');

  result.pairingsRemoved = removedPairings?.length ?? 0;

  const { data: cancelledEnvelopes } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('course', course)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCancelled = cancelledEnvelopes?.length ?? 0;

  return result;
}
