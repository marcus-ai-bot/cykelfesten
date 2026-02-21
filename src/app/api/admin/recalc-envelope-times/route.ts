import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';
import { calculateEnvelopeTimes, parseCourseSchedules } from '@/lib/envelope/timing';

const DEFAULT_TIMING = {
  teasing_hours: 6,
  clue_1_hours: 2,
  clue_2_minutes: 30,
  street_minutes: 15,
  number_minutes: 5,
};

/**
 * Recalculate all envelope reveal times based on current event times + timing settings.
 * Called when organizer changes course start times.
 */
export async function POST(request: NextRequest) {
  try {
    const { event_id } = await request.json();
    if (!event_id) return NextResponse.json({ error: 'event_id required' }, { status: 400 });

    const auth = await requireEventAccess(event_id);
    if (!auth.success) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const supabase = createAdminClient();

    // Get event with current times
    const { data: event } = await supabase
      .from('events')
      .select('*, active_match_plan_id')
      .eq('id', event_id)
      .single();

    if (!event?.active_match_plan_id) {
      return NextResponse.json({ message: 'No active match plan, nothing to recalc' });
    }

    // Get timing settings
    const { data: timing } = await supabase
      .from('event_timing')
      .select('*')
      .eq('event_id', event_id)
      .single();

    const timingConfig = { ...DEFAULT_TIMING, ...timing };

    // Parse course start times from event
    const courseStartTimes = parseCourseSchedules(
      event.event_date,
      event.starter_time || '17:30:00',
      event.main_time || '19:00:00',
      event.dessert_time || '20:30:00'
    );

    // Get all envelopes for active match plan
    const { data: envelopes } = await supabase
      .from('envelopes')
      .select('id, couple_id, course, host_couple_id, cycling_minutes')
      .eq('match_plan_id', event.active_match_plan_id);

    if (!envelopes?.length) {
      return NextResponse.json({ message: 'No envelopes to update' });
    }

    // Recalculate and update each envelope
    let updated = 0;
    for (const env of envelopes) {
      const times = calculateEnvelopeTimes(
        courseStartTimes[env.course as keyof typeof courseStartTimes],
        timingConfig,
        env.cycling_minutes ?? undefined
      );

      await supabase
        .from('envelopes')
        .update({
          teasing_at: times.teasing_at.toISOString(),
          clue_1_at: times.clue_1_at.toISOString(),
          clue_2_at: times.clue_2_at.toISOString(),
          street_at: times.street_at.toISOString(),
          number_at: times.number_at.toISOString(),
          opened_at: times.opened_at.toISOString(),
        })
        .eq('id', env.id);
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('Recalc error:', error);
    return NextResponse.json({ error: 'Recalc failed' }, { status: 500 });
  }
}
