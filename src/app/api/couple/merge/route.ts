import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

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
    
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    
    // Get inviter (the one doing the inviting)
    const { data: inviter, error: inviterError } = await supabase
      .from('couples')
      .select('*, events(id, name)')
      .eq('id', inviter_couple_id)
      .eq('cancelled', false)
      .single();
    
    if (inviterError || !inviter) {
      return NextResponse.json({ error: 'Inviter hittades inte' }, { status: 404 });
    }

    const { hasAccess } = await checkEventAccess(organizer.id, inviter.event_id);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    if (inviter.partner_name) {
      return NextResponse.json({ 
        error: 'Du har redan en partner. Ta bort partnern först.' 
      }, { status: 400 });
    }
    
    const { data: mergeResult, error: mergeError } = await supabase
      .rpc('merge_couples', {
        p_inviter_id: inviter_couple_id,
        p_invitee_email: invitee_email.toLowerCase().trim(),
        p_event_id: inviter.event_id,
      });
    
    if (mergeError) {
      if (mergeError.message?.includes('Invitee not found')) {
        return NextResponse.json({
          success: true,
          action: 'new_partner',
          message: 'Email inte registrerat — lägg till som ny partner',
        });
      }
      if (mergeError.message?.includes('Invitee already has partner')) {
        return NextResponse.json({
          error: 'Personen är redan registrerad med en partner. De måste separera först.',
        }, { status: 400 });
      }
      if (mergeError.message?.includes('Inviter already has partner')) {
        return NextResponse.json({
          error: 'Du har redan en partner. Ta bort partnern först.',
        }, { status: 400 });
      }
      if (mergeError.message?.includes('Inviter not found')) {
        return NextResponse.json({ error: 'Inviter hittades inte' }, { status: 404 });
      }

      return NextResponse.json({ error: 'Kunde inte slå ihop' }, { status: 500 });
    }

    const merged = Array.isArray(mergeResult) ? mergeResult[0] : mergeResult;
    
    const mergedName = merged?.invitee_name || invitee_email;
    const addressSecondary = merged?.invitee_address && merged?.invitee_address !== merged?.inviter_address
      ? merged.invitee_address
      : null;

    // Log the merge
    await supabase.from('event_log').insert({
      event_id: inviter.event_id,
      action: 'singles_merged',
      details: {
        inviter_id: inviter.id,
        inviter_name: inviter.invited_name,
        invitee_id: merged?.invitee_id,
        invitee_name: mergedName,
        address_kept: merged?.inviter_address ?? inviter.address,
        address_secondary: addressSecondary,
      },
    });
    
    return NextResponse.json({
      success: true,
      action: 'merged',
      message: `${mergedName} är nu din partner! Deras soloregistrering är borttagen.`,
      merged_person: {
        name: mergedName,
        had_different_address: Boolean(addressSecondary),
      },
    });
    
  } catch (error) {
    console.error('Merge error:', error);
    return NextResponse.json({ error: 'Merge misslyckades' }, { status: 500 });
  }
}
