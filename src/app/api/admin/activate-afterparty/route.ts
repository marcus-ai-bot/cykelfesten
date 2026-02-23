import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

/**
 * Activate Afterparty API
 * 
 * Admin can manually activate the afterparty reveal:
 * - action: 'tease' → Sets afterparty_teasing_at to now (TEASING state)
 * - action: 'reveal' → Sets afterparty_revealed_at to now (REVEALED state)
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

    let updates: Record<string, string | null> = {};

    switch (action) {
      case 'tease':
        updates = { afterparty_teasing_at: now };
        break;
      case 'reveal':
        // Also set teasing if not already set
        updates = { 
          afterparty_teasing_at: now,
          afterparty_revealed_at: now,
        };
        break;
      case 'reset':
        updates = { 
          afterparty_teasing_at: null,
          afterparty_revealed_at: null,
        };
        break;
    }

    const { data: event, error: updateError } = await supabase
      .from('events')
      .update(updates)
      .eq('id', event_id)
      .select('id, afterparty_teasing_at, afterparty_revealed_at')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Kunde inte uppdatera efterfest-status', details: updateError.message },
        { status: 500 }
      );
    }

    // Log the activation
    await supabase.from('event_log').insert({
      event_id,
      action: `afterparty_${action}`,
      details: {
        manual_activation: true,
        afterparty_teasing_at: event?.afterparty_teasing_at,
        afterparty_revealed_at: event?.afterparty_revealed_at,
      },
    });

    return NextResponse.json({
      success: true,
      action,
      afterparty_teasing_at: event?.afterparty_teasing_at,
      afterparty_revealed_at: event?.afterparty_revealed_at,
    });

  } catch (error) {
    console.error('Afterparty activation error:', error);
    return NextResponse.json(
      { error: 'Kunde inte aktivera efterfest', details: String(error) },
      { status: 500 }
    );
  }
}
