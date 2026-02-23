import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import {
  calculateEnvelopeTimes,
  parseCourseSchedules,
  type CourseTimingOffsets,
} from '@/lib/envelope/timing';
import type { Course } from '@/types/database';

/**
 * POST /api/organizer/events/[eventId]/promote-host
 *
 * "Uppgradera till värd" — makes an existing couple a host for a course.
 * Optionally places guest couples with the new host immediately.
 *
 * Input:
 * {
 *   couple_id: string,
 *   course: "starter" | "main" | "dessert",
 *   guest_couple_ids?: string[]   // optional: place these guests immediately
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  const auth = await requireEventAccess(eventId);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { couple_id, course, guest_couple_ids } = body as {
    couple_id: string;
    course: Course;
    guest_couple_ids?: string[];
  };

  const validCourses: Course[] = ['starter', 'main', 'dessert'];
  if (!couple_id || !course || !validCourses.includes(course)) {
    return NextResponse.json(
      { error: 'couple_id and valid course (starter/main/dessert) required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get event with active match plan
  const { data: event } = await supabase
    .from('events')
    .select('*, active_match_plan_id, course_timing_offsets')
    .eq('id', eventId)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;

  // Validate the couple exists, is not cancelled, and has an address
  const { data: couple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, address, address_notes, cancelled, coordinates')
    .eq('id', couple_id)
    .eq('event_id', eventId)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Couple not found in this event' }, { status: 404 });
  }
  if (couple.cancelled) {
    return NextResponse.json({ error: 'Couple is cancelled' }, { status: 400 });
  }
  if (!couple.address) {
    return NextResponse.json({ error: 'Couple has no address — required to be a host' }, { status: 400 });
  }

  // Check if couple is already a host for this course
  const { data: existingAssignment } = await supabase
    .from('assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('couple_id', couple_id)
    .eq('course', course)
    .eq('is_host', true)
    .single();

  if (existingAssignment) {
    return NextResponse.json({ error: 'Couple is already a host for this course' }, { status: 400 });
  }

  // Default max_guests for a new host (generous default)
  const maxGuests = couple.partner_name ? 8 : 6;

  // Create host assignment
  const { error: assignmentError } = await supabase
    .from('assignments')
    .insert({
      event_id: eventId,
      couple_id: couple_id,
      course,
      is_host: true,
      max_guests: maxGuests,
      is_flex_host: false,
      flex_extra_capacity: 0,
      is_emergency_host: false,
    });

  if (assignmentError) {
    console.error('Assignment insert error:', assignmentError);
    return NextResponse.json(
      { error: 'Failed to create host assignment', details: assignmentError.message },
      { status: 500 }
    );
  }

  // If the couple had a guest-pairing for the same course, remove it
  // (can't be both guest and host for the same course)
  const { data: guestPairings } = await supabase
    .from('course_pairings')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', couple_id)
    .eq('course', course);

  if (guestPairings && guestPairings.length > 0) {
    const guestPairingIds = guestPairings.map(p => p.id);
    await supabase
      .from('course_pairings')
      .delete()
      .in('id', guestPairingIds);

    // Cancel the corresponding envelopes
    await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', matchPlanId)
      .eq('couple_id', couple_id)
      .eq('course', course);
  }

  // If guest_couple_ids provided, place them with the new host
  let pairingsCreated = 0;
  let envelopesCreated = 0;

  if (guest_couple_ids && guest_couple_ids.length > 0) {
    // Validate guest couples
    const { data: guestCouples } = await supabase
      .from('couples')
      .select('id, cancelled')
      .eq('event_id', eventId)
      .in('id', guest_couple_ids);

    const validGuestIds = (guestCouples ?? [])
      .filter(c => !c.cancelled)
      .map(c => c.id);

    if (validGuestIds.length > 0) {
      // Create guest pairings
      const guestPairingsToInsert = validGuestIds.map(guestId => ({
        match_plan_id: matchPlanId,
        course,
        host_couple_id: couple_id,
        guest_couple_id: guestId,
      }));

      const { error: pairingError } = await supabase
        .from('course_pairings')
        .insert(guestPairingsToInsert);

      if (pairingError) {
        console.error('Guest pairing insert error:', pairingError);
        // Host assignment was already created, so report partial success
        return NextResponse.json({
          success: true,
          partial: true,
          error: 'Host promoted but failed to place guests',
          details: pairingError.message,
        });
      }

      pairingsCreated = guestPairingsToInsert.length;

      // Create envelopes for guests
      const courseStartTimes = parseCourseSchedules(
        event.event_date,
        event.starter_time || '17:30:00',
        event.main_time || '19:00:00',
        event.dessert_time || '20:30:00'
      );

      const { data: timing } = await supabase
        .from('event_timing')
        .select('*')
        .eq('event_id', eventId)
        .single();

      const courseOffsets: CourseTimingOffsets = event.course_timing_offsets || {};

      const envelopesToInsert = validGuestIds.map(guestId => {
        const times = calculateEnvelopeTimes(
          courseStartTimes[course],
          timing ?? {},
          undefined,
          courseOffsets[course]
        );

        return {
          match_plan_id: matchPlanId,
          couple_id: guestId,
          course,
          host_couple_id: couple_id,
          destination_address: couple.address,
          destination_notes: couple.address_notes ?? null,
          scheduled_at: courseStartTimes[course].toISOString(),
          cycling_distance_km: null,
          current_state: 'LOCKED' as const,
          teasing_at: times.teasing_at.toISOString(),
          clue_1_at: times.clue_1_at.toISOString(),
          clue_2_at: times.clue_2_at.toISOString(),
          street_at: times.street_at.toISOString(),
          number_at: times.number_at.toISOString(),
          opened_at: times.opened_at.toISOString(),
        };
      });

      const { error: envError } = await supabase
        .from('envelopes')
        .insert(envelopesToInsert);

      if (!envError) {
        envelopesCreated = envelopesToInsert.length;
      }
    }
  }

  // Log
  const coupleName = couple.partner_name
    ? `${couple.invited_name} & ${couple.partner_name}`
    : couple.invited_name;

  await supabase.from('event_log').insert({
    event_id: eventId,
    match_plan_id: matchPlanId,
    action: 'promote_host',
    actor_id: auth.organizer.id,
    details: {
      couple_id,
      couple_name: coupleName,
      course,
      guest_couple_ids: guest_couple_ids ?? [],
      pairings_created: pairingsCreated,
      envelopes_created: envelopesCreated,
    },
  });

  return NextResponse.json({
    success: true,
    couple_name: coupleName,
    course,
    pairings_created: pairingsCreated,
    envelopes_created: envelopesCreated,
  });
}
