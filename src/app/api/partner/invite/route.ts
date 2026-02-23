import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

/**
 * Partner Invite API
 * 
 * Sends an invite to the partner so they can claim their profile
 * and fill in their own mystery profile, Instagram, etc.
 */

export async function POST(request: Request) {
  try {
    const { couple_id } = await request.json();
    
    if (!couple_id) {
      return NextResponse.json({ error: 'couple_id krävs' }, { status: 400 });
    }
    
    const supabase = createAdminClient();
    
    // Get couple
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('*, events(slug, name)')
      .eq('id', couple_id)
      .eq('cancelled', false)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Par hittades inte eller har avbokats' }, { status: 404 });
    }
    
    if (!couple.partner_name) {
      return NextResponse.json({ error: 'Ingen partner registrerad' }, { status: 400 });
    }
    
    if (!couple.partner_email) {
      return NextResponse.json({ error: 'Partner har ingen email' }, { status: 400 });
    }
    
    // Generate invite token
    const token = randomBytes(32).toString('hex');
    
    // Save token
    const { error: updateError } = await supabase
      .from('couples')
      .update({
        partner_invite_token: token,
        partner_invite_sent_at: new Date().toISOString(),
      })
      .eq('id', couple_id);
    
    if (updateError) {
      return NextResponse.json({ error: 'Kunde inte skapa inbjudan' }, { status: 500 });
    }
    
    // Build invite URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cykelfesten.vercel.app';
    const inviteUrl = `${baseUrl}/e/${couple.events.slug}/partner?token=${token}`;
    
    const partnerEmail = couple.partner_email;
    const partnerName = couple.partner_name;
    const invitedName = couple.invited_name;
    const eventName = couple.events?.name || 'Cykelfesten';
    const profileUrl = inviteUrl;

    const { error: emailError } = await sendEmail({
      to: partnerEmail,
      subject: `${invitedName} har anmält er till ${eventName}`,
      html: `<p>Hej ${partnerName}!</p><p>${invitedName} har anmält er till <strong>${eventName}</strong>.</p><p>Fyll i din profil här: <a href="${profileUrl}">${profileUrl}</a></p>`,
    });

    if (emailError) {
      console.error('Partner invite email error:', emailError);
      return NextResponse.json({ error: 'Kunde inte skicka inbjudan' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      partner_name: partnerName,
      partner_email: partnerEmail,
      invite_url: inviteUrl,
      message: 'Inbjudan skickad! Be din partner kolla sin email.',
    });
    
  } catch (error) {
    console.error('Partner invite error:', error);
    return NextResponse.json({ error: 'Kunde inte skapa inbjudan' }, { status: 500 });
  }
}
