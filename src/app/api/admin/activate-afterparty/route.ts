import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

/**
 * Activate Afterparty API
 * 
 * Admin can manually activate the afterparty reveal:
 * - action: 'tease' → Sets teasing_at to now (TEASING state)
 * - action: 'reveal' → Sets teasing_at (if missing) + opened_at to now (OPEN state)
 * - action: 'reset' → Clears both timestamps (back to LOCKED)
 */

export async function POST(request: Request) {
  try {
    const { event_id, action } = await request.json();

    if (!event_id || !action) {
      return NextResponse.json(
        { error: 'event_id och action krävs' },
        { status: 400 }
      );
    }

    // Auth
    const auth = await requireEventAccess(event_id);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const validActions = ['tease', 'reveal', 'reset'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: 'Ogiltig action. Välj tease, reveal eller reset.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const now = new Date().toISOString();

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, active_match_plan_id')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (!event.active_match_plan_id) {
      return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
    }

    const matchPlanId = event.active_match_plan_id;
    let updatedCount = 0;

    switch (action) {
      case 'tease': {
        const { data, error } = await supabase
          .from('envelopes')
          .update({ teasing_at: now })
          .eq('match_plan_id', matchPlanId)
          .eq('course', 'afterparty')
          .neq('cancelled', true)
          .select('id');

        if (error) {
          return NextResponse.json(
            { error: 'Kunde inte uppdatera afterparty-kuvert', details: error.message },
            { status: 500 }
          );
        }
        updatedCount = data?.length ?? 0;
        break;
      }
      case 'reveal': {
        const { error: teaseError } = await supabase
          .from('envelopes')
          .update({ teasing_at: now })
          .eq('match_plan_id', matchPlanId)
          .eq('course', 'afterparty')
          .is('teasing_at', null)
          .neq('cancelled', true);

        if (teaseError) {
          return NextResponse.json(
            { error: 'Kunde inte uppdatera afterparty-kuvert', details: teaseError.message },
            { status: 500 }
          );
        }

        const { data, error } = await supabase
          .from('envelopes')
          .update({ opened_at: now })
          .eq('match_plan_id', matchPlanId)
          .eq('course', 'afterparty')
          .neq('cancelled', true)
          .select('id');

        if (error) {
          return NextResponse.json(
            { error: 'Kunde inte uppdatera afterparty-kuvert', details: error.message },
            { status: 500 }
          );
        }
        updatedCount = data?.length ?? 0;
        break;
      }
      case 'reset': {
        const { data, error } = await supabase
          .from('envelopes')
          .update({ teasing_at: null, opened_at: null })
          .eq('match_plan_id', matchPlanId)
          .eq('course', 'afterparty')
          .neq('cancelled', true)
          .select('id');

        if (error) {
          return NextResponse.json(
            { error: 'Kunde inte uppdatera afterparty-kuvert', details: error.message },
            { status: 500 }
          );
        }
        updatedCount = data?.length ?? 0;
        break;
      }
    }

    // Log the activation
    await supabase.from('event_log').insert({
      event_id,
      match_plan_id: matchPlanId,
      action: `afterparty_${action}`,
      details: {
        manual_activation: true,
        envelopes_updated: updatedCount,
      },
    });

    return NextResponse.json({
      success: true,
      action,
      updated: updatedCount,
    });

  } catch (error) {
    console.error('Afterparty activation error:', error);
    return NextResponse.json(
      { error: 'Kunde inte aktivera efterfest', details: String(error) },
      { status: 500 }
    );
  }
}
