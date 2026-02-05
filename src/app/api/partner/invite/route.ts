import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
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
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Par hittades inte' }, { status: 404 });
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
    
    // TODO: Send email to partner
    // For now, return the URL for manual sharing
    console.log(`[PARTNER INVITE] To: ${couple.partner_email}, URL: ${inviteUrl}`);
    
    return NextResponse.json({
      success: true,
      partner_name: couple.partner_name,
      partner_email: couple.partner_email,
      invite_url: inviteUrl,
      message: 'Inbjudan skapad! Dela länken med din partner.',
    });
    
  } catch (error) {
    console.error('Partner invite error:', error);
    return NextResponse.json({ error: 'Kunde inte skapa inbjudan' }, { status: 500 });
  }
}
