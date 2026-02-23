import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

/**
 * Activate Course API
 * 
 * Admin can manually activate envelopes for a course,
 * making them openable immediately.
 */

export async function POST(request: Request) {
  try {
    const { event_id, course } = await request.json();

    if (!event_id || !course) {
      return NextResponse.json(
        { error: 'event_id och course krävs' },
        { status: 400 }
      );
    }

    // Auth: Require organizer access to this event
    const auth = await requireEventAccess(event_id);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const validCourses = ['starter', 'main', 'dessert'];
    if (!validCourses.includes(course)) {
      return NextResponse.json(
        { error: 'Ogiltig rätt. Välj starter, main eller dessert.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event hittades inte' },
        { status: 404 }
      );
    }

    if (!event.active_match_plan_id) {
      return NextResponse.json(
        { error: 'Ingen aktiv matchning finns' },
        { status: 400 }
      );
    }

    const now = new Date();
    const updates = {
      activated_at: now.toISOString(),
      teasing_at: now.toISOString(),
      clue_1_at: new Date(now.getTime() + 30 * 1000).toISOString(),
      clue_2_at: new Date(now.getTime() + 60 * 1000).toISOString(),
      street_at: new Date(now.getTime() + 90 * 1000).toISOString(),
      number_at: new Date(now.getTime() + 120 * 1000).toISOString(),
      opened_at: new Date(now.getTime() + 150 * 1000).toISOString(),
    };

    // Activate all envelopes for this course
    const { data: updated, error: updateError } = await supabase
      .from('envelopes')
      .update(updates)
      .eq('match_plan_id', event.active_match_plan_id)
      .eq('course', course)
      .is('activated_at', null)
      .select('id');

    if (updateError) {
      return NextResponse.json(
        { error: 'Kunde inte aktivera kuvert', details: updateError.message },
        { status: 500 }
      );
    }

    // Log the activation
    await supabase.from('event_log').insert({
      event_id,
      match_plan_id: event.active_match_plan_id,
      action: 'course_activated',
      details: {
        course,
        activated_envelopes: updated?.length || 0,
        manual_activation: true,
      },
    });

    // Mark course as frozen in match plan
    const { data: plan } = await supabase
      .from('match_plans')
      .select('frozen_courses')
      .eq('id', event.active_match_plan_id)
      .single();

    const frozenCourses = [...(plan?.frozen_courses || [])];
    if (!frozenCourses.includes(course)) {
      frozenCourses.push(course);
      await supabase
        .from('match_plans')
        .update({ frozen_courses: frozenCourses })
        .eq('id', event.active_match_plan_id);
    }

    return NextResponse.json({
      success: true,
      course,
      activated_count: updated?.length || 0,
    });

  } catch (error) {
    console.error('Activation error:', error);
    return NextResponse.json(
      { error: 'Kunde inte aktivera rätt', details: String(error) },
      { status: 500 }
    );
  }
}
