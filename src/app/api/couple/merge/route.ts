import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * Merge Singles API
 * 
 * When a single invites another registered single as partner,
 * merge them into one couple without admin intervention.
 */

export async function POST(request: Request) {
  try {
    const { inviter_couple_id, invitee_email } = await request.json();
    
    if (!inviter_couple_id || !invitee_email) {
      return NextResponse.json({ 
        error: 'inviter_couple_id och invitee_email krävs' 
      }, { status: 400 });
    }
    
    const supabase = createAdminClient();
    
    // Get inviter (the one doing the inviting)
    const { data: inviter, error: inviterError } = await supabase
      .from('couples')
      .select('*, events(id, name)')
      .eq('id', inviter_couple_id)
      .single();
    
    if (inviterError || !inviter) {
      return NextResponse.json({ error: 'Inviter hittades inte' }, { status: 404 });
    }
    
    if (inviter.partner_name) {
      return NextResponse.json({ 
        error: 'Du har redan en partner. Ta bort partnern först.' 
      }, { status: 400 });
    }
    
    // Find invitee by email in same event
    const { data: invitee, error: inviteeError } = await supabase
      .from('couples')
      .select('*')
      .eq('event_id', inviter.event_id)
      .eq('invited_email', invitee_email.toLowerCase().trim())
      .eq('cancelled', false)
      .single();
    
    if (inviteeError || !invitee) {
      // No existing registration - just add as new partner
      return NextResponse.json({
        success: true,
        action: 'new_partner',
        message: 'Email inte registrerat — lägg till som ny partner',
      });
    }
    
    // Check if invitee is also a single
    if (invitee.partner_name) {
      return NextResponse.json({
        error: `${invitee.invited_name} är redan registrerad med ${invitee.partner_name}. De måste separera först.`,
      }, { status: 400 });
    }
    
    // Merge: Add invitee as partner to inviter, cancel invitee's registration
    const { error: updateError } = await supabase
      .from('couples')
      .update({
        partner_name: invitee.invited_name,
        partner_email: invitee.invited_email,
        partner_phone: invitee.invited_phone,
        partner_allergies: invitee.invited_allergies,
        partner_birth_year: invitee.invited_birth_year,
        partner_fun_facts: invitee.invited_fun_facts,
        partner_pet_allergy: invitee.invited_pet_allergy,
        partner_address: invitee.address !== inviter.address ? invitee.address : null,
      })
      .eq('id', inviter_couple_id);
    
    if (updateError) {
      return NextResponse.json({ error: 'Kunde inte slå ihop' }, { status: 500 });
    }
    
    // Cancel the invitee's solo registration
    await supabase
      .from('couples')
      .update({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', invitee.id);
    
    // Log the merge
    await supabase.from('event_log').insert({
      event_id: inviter.event_id,
      action: 'singles_merged',
      details: {
        inviter_id: inviter.id,
        inviter_name: inviter.invited_name,
        invitee_id: invitee.id,
        invitee_name: invitee.invited_name,
        address_kept: inviter.address,
        address_secondary: invitee.address !== inviter.address ? invitee.address : null,
      },
    });
    
    return NextResponse.json({
      success: true,
      action: 'merged',
      message: `${invitee.invited_name} är nu din partner! Deras soloregistrering är borttagen.`,
      merged_person: {
        name: invitee.invited_name,
        had_different_address: invitee.address !== inviter.address,
      },
    });
    
  } catch (error) {
    console.error('Merge error:', error);
    return NextResponse.json({ error: 'Merge misslyckades' }, { status: 500 });
  }
}
