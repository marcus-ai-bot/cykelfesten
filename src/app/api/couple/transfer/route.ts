import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

/**
 * Transfer Ownership API
 * 
 * Allows invited person to transfer ownership to partner,
 * or request transfer (notifies admin).
 */

export async function POST(request: Request) {
  try {
    const { couple_id, action } = await request.json();
    // action: 'request' | 'execute' | 'cancel'
    
    if (!couple_id || !action) {
      return NextResponse.json({ error: 'couple_id och action krävs' }, { status: 400 });
    }
    
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('*, events(id, name)')
      .eq('id', couple_id)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Par hittades inte' }, { status: 404 });
    }

    const { hasAccess } = await checkEventAccess(organizer.id, couple.event_id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    if (!couple.partner_name) {
      return NextResponse.json({ error: 'Ingen partner att överlåta till' }, { status: 400 });
    }
    
    if (action === 'request') {
      // Mark transfer as requested
      await supabase
        .from('couples')
        .update({
          transfer_requested_at: new Date().toISOString(),
        })
        .eq('id', couple_id);
      
      // Log for admin
      await supabase.from('event_log').insert({
        event_id: couple.events.id,
        action: 'transfer_requested',
        details: {
          couple_id,
          from: couple.invited_name,
          to: couple.partner_name,
        },
      });
      
      return NextResponse.json({
        success: true,
        message: `Överlåtelse begärd. Admin har meddelats.`,
      });
      
    } else if (action === 'execute') {
      const { error: swapError } = await supabase
        .rpc('swap_couple_ownership', { p_couple_id: couple_id });
      
      if (swapError) {
        return NextResponse.json({ error: 'Kunde inte överlåta' }, { status: 500 });
      }
      
      await supabase.from('event_log').insert({
        event_id: couple.events.id,
        action: 'transfer_executed',
        details: {
          couple_id,
          from: couple.invited_name,
          to: couple.partner_name,
        },
      });
      
      return NextResponse.json({
        success: true,
        message: `Ägande överlåtet till ${couple.partner_name}`,
      });
      
    } else if (action === 'cancel') {
      await supabase
        .from('couples')
        .update({ transfer_requested_at: null })
        .eq('id', couple_id);
      
      return NextResponse.json({ success: true, message: 'Överlåtelse avbruten' });
    }
    
    return NextResponse.json({ error: 'Ogiltig action' }, { status: 400 });
    
  } catch (error) {
    console.error('Transfer error:', error);
    return NextResponse.json({ error: 'Överlåtelse misslyckades' }, { status: 500 });
  }
}
