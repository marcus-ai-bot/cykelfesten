import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';

/**
 * POST /api/organizer/couples/[coupleId]/resign-host
 *
 * "Avsäg värdskap" — removes the couple's host-pairings (freeing their guests)
 * but keeps any guest-pairings intact.
 *
 * Returns which guests became unplaced and for which course.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get couple
  const { data: couple } = await supabase
    .from('couples')
    .select('id, event_id, invited_name, partner_name')
    .eq('id', coupleId)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
  }

  // Verify organizer access to this event
  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) {
    return NextResponse.json({ error: 'No access' }, { status: 403 });
  }

  // Get event with active match plan
  const { data: event } = await supabase
    .from('events')
    .select('id, active_match_plan_id')
    .eq('id', couple.event_id)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;

  // Find all course_pairings where this couple is HOST
  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('id, course, guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId);

  if (!hostPairings || hostPairings.length === 0) {
    return NextResponse.json({ error: 'Couple is not a host in any course' }, { status: 400 });
  }

  // Collect affected guest IDs and courses
  const affectedGuests: { couple_id: string; course: string }[] = [];
  const affectedCourses = new Set<string>();

  for (const pairing of hostPairings) {
    // Don't include self-hosting pairings (where host == guest)
    if (pairing.guest_couple_id !== coupleId) {
      affectedGuests.push({
        couple_id: pairing.guest_couple_id,
        course: pairing.course,
      });
    }
    affectedCourses.add(pairing.course);
  }

  // Get names of affected guests for the response
  const guestIds = [...new Set(affectedGuests.map(g => g.couple_id))];
  let guestNames: { id: string; name: string }[] = [];
  if (guestIds.length > 0) {
    const { data: guestCouples } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name')
      .in('id', guestIds);

    guestNames = (guestCouples ?? []).map(c => ({
      id: c.id,
      name: c.partner_name
        ? `${c.invited_name} & ${c.partner_name}`
        : c.invited_name,
    }));
  }

  // Delete host pairings (all pairings where this couple is host)
  const hostPairingIds = hostPairings.map(p => p.id);
  const { error: deleteError } = await supabase
    .from('course_pairings')
    .delete()
    .in('id', hostPairingIds);

  if (deleteError) {
    console.error('Failed to delete host pairings:', deleteError);
    return NextResponse.json(
      { error: 'Failed to remove host pairings', details: deleteError.message },
      { status: 500 }
    );
  }

  // Cancel envelopes for the affected guests (for the courses where this couple was host)
  if (guestIds.length > 0) {
    for (const course of affectedCourses) {
      const courseGuestIds = affectedGuests
        .filter(g => g.course === course)
        .map(g => g.couple_id);

      if (courseGuestIds.length > 0) {
        await supabase
          .from('envelopes')
          .update({ cancelled: true })
          .eq('match_plan_id', matchPlanId)
          .eq('host_couple_id', coupleId)
          .eq('course', course)
          .in('couple_id', courseGuestIds);
      }
    }
  }

  // Remove the host assignment for this couple
  await supabase
    .from('assignments')
    .delete()
    .eq('event_id', couple.event_id)
    .eq('couple_id', coupleId)
    .eq('is_host', true);

  // Log in event_log
  const coupleName = couple.partner_name
    ? `${couple.invited_name} & ${couple.partner_name}`
    : couple.invited_name;

  await supabase.from('event_log').insert({
    event_id: couple.event_id,
    match_plan_id: matchPlanId,
    action: 'resign_host',
    actor_id: organizer.id,
    details: {
      couple_id: coupleId,
      couple_name: coupleName,
      courses: [...affectedCourses],
      freed_guests: guestNames,
      pairings_removed: hostPairingIds.length,
    },
  });

  return NextResponse.json({
    success: true,
    couple_name: coupleName,
    courses: [...affectedCourses],
    freed_guests: guestNames,
    pairings_removed: hostPairingIds.length,
  });
}
