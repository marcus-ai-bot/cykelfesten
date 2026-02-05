import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Reserve Management API
 * 
 * Admin can:
 * - Mark couples as reserves (role: 'reserve')
 * - Activate reserves when needed
 * - List all reserves for an event
 */

export async function POST(request: Request) {
  try {
    const { event_id, couple_id, action } = await request.json();
    // action: 'set_reserve' | 'activate' | 'list'
    
    if (!action) {
      return NextResponse.json({ error: 'action krävs' }, { status: 400 });
    }
    
    const supabase = createAdminClient();
    
    if (action === 'list') {
      if (!event_id) {
        return NextResponse.json({ error: 'event_id krävs för list' }, { status: 400 });
      }
      
      const { data: reserves } = await supabase
        .from('couples')
        .select('id, invited_name, partner_name, address, role')
        .eq('event_id', event_id)
        .eq('role', 'reserve')
        .eq('cancelled', false);
      
      return NextResponse.json({ reserves: reserves || [] });
    }
    
    if (!couple_id) {
      return NextResponse.json({ error: 'couple_id krävs' }, { status: 400 });
    }
    
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('*, events(id, name, active_match_plan_id)')
      .eq('id', couple_id)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Par hittades inte' }, { status: 404 });
    }
    
    if (action === 'set_reserve') {
      // Mark as reserve - they won't get assignments or envelopes
      await supabase
        .from('couples')
        .update({ role: 'reserve' })
        .eq('id', couple_id);
      
      // Remove any existing assignments
      await supabase
        .from('assignments')
        .delete()
        .eq('couple_id', couple_id);
      
      // Remove from current match plan pairings
      if (couple.events.active_match_plan_id) {
        await supabase
          .from('course_pairings')
          .delete()
          .eq('match_plan_id', couple.events.active_match_plan_id)
          .or(`host_couple_id.eq.${couple_id},guest_couple_id.eq.${couple_id}`);
        
        await supabase
          .from('envelopes')
          .delete()
          .eq('match_plan_id', couple.events.active_match_plan_id)
          .eq('couple_id', couple_id);
      }
      
      await supabase.from('event_log').insert({
        event_id: couple.events.id,
        action: 'reserve_set',
        details: {
          couple_id,
          name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
        },
      });
      
      return NextResponse.json({
        success: true,
        message: `${couple.invited_name} är nu hemlig reserv. De får inga kuvert tills de aktiveras.`,
      });
      
    } else if (action === 'activate') {
      // Activate reserve - make them normal participant
      await supabase
        .from('couples')
        .update({ role: 'normal' })
        .eq('id', couple_id);
      
      await supabase.from('event_log').insert({
        event_id: couple.events.id,
        action: 'reserve_activated',
        details: {
          couple_id,
          name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
        },
      });
      
      return NextResponse.json({
        success: true,
        message: `${couple.invited_name} är nu aktiv deltagare. Kör matchning för att inkludera dem.`,
        needs_rematch: true,
      });
    }
    
    return NextResponse.json({ error: 'Ogiltig action' }, { status: 400 });
    
  } catch (error) {
    console.error('Reserve error:', error);
    return NextResponse.json({ error: 'Reserve-operation misslyckades' }, { status: 500 });
  }
}
