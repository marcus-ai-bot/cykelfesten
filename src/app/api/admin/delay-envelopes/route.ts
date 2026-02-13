import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

/**
 * Delay Envelopes API
 * 
 * Admin can push back envelope times for remaining courses.
 * Already activated courses are frozen.
 */

export async function POST(request: Request) {
  try {
    const { event_id, delay_minutes, reason } = await request.json();
    
    if (!event_id || !delay_minutes) {
      return NextResponse.json(
        { error: 'event_id och delay_minutes krävs' },
        { status: 400 }
      );
    }
    
    // Auth: Require organizer access to this event
    const auth = await requireEventAccess(event_id);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
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
    
    // Update event time offset
    const newOffset = (event.time_offset_minutes || 0) + delay_minutes;
    
    const { error: updateError } = await supabase
      .from('events')
      .update({
        time_offset_minutes: newOffset,
        time_offset_updated_at: new Date().toISOString(),
      })
      .eq('id', event_id);
    
    if (updateError) {
      return NextResponse.json(
        { error: 'Kunde inte uppdatera tider', details: updateError.message },
        { status: 500 }
      );
    }
    
    // Get active match plan
    if (event.active_match_plan_id) {
      // Update all non-activated envelope times
      const { data: envelopes } = await supabase
        .from('envelopes')
        .select('id, scheduled_at, activated_at')
        .eq('match_plan_id', event.active_match_plan_id)
        .is('activated_at', null);
      
      if (envelopes?.length) {
        for (const env of envelopes) {
          const newTime = new Date(new Date(env.scheduled_at).getTime() + delay_minutes * 60 * 1000);
          await supabase
            .from('envelopes')
            .update({ scheduled_at: newTime.toISOString() })
            .eq('id', env.id);
        }
      }
      
      // Log the delay
      await supabase.from('event_log').insert({
        event_id,
        match_plan_id: event.active_match_plan_id,
        action: 'envelopes_delayed',
        details: {
          delay_minutes,
          new_offset: newOffset,
          affected_envelopes: envelopes?.length || 0,
          reason: reason || 'Admin skjöt upp kuvert',
        },
      });
    }
    
    return NextResponse.json({
      success: true,
      new_offset: newOffset,
      delay_applied: delay_minutes,
    });
    
  } catch (error) {
    console.error('Delay error:', error);
    return NextResponse.json(
      { error: 'Kunde inte skjuta upp kuvert', details: String(error) },
      { status: 500 }
    );
  }
}
