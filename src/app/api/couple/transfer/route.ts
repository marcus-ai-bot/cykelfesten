import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

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
    
    const supabase = createAdminClient();
    
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('*, events(id, name)')
      .eq('id', couple_id)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Par hittades inte' }, { status: 404 });
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
      // Swap invited and partner
      const { error: updateError } = await supabase
        .from('couples')
        .update({
          // Swap names
          invited_name: couple.partner_name,
          partner_name: couple.invited_name,
          // Swap emails
          invited_email: couple.partner_email || couple.invited_email,
          partner_email: couple.invited_email,
          // Swap phones
          invited_phone: couple.partner_phone,
          partner_phone: couple.invited_phone,
          // Swap allergies
          invited_allergies: couple.partner_allergies,
          partner_allergies: couple.invited_allergies,
          // Swap birth years
          invited_birth_year: couple.partner_birth_year,
          partner_birth_year: couple.invited_birth_year,
          // Swap fun facts
          invited_fun_facts: couple.partner_fun_facts,
          partner_fun_facts: couple.invited_fun_facts,
          // Swap pet allergies
          invited_pet_allergy: couple.partner_pet_allergy,
          partner_pet_allergy: couple.invited_pet_allergy,
          // Swap addresses if partner had different
          address: couple.partner_address || couple.address,
          partner_address: couple.partner_address ? couple.address : null,
          // Clear transfer request
          transfer_requested_at: null,
        })
        .eq('id', couple_id);
      
      if (updateError) {
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
