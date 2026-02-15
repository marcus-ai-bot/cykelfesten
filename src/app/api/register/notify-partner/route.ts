import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { randomBytes } from 'crypto';

// POST /api/register/notify-partner
// Called after registration to send partner invite email
// Body: { couple_id: string }

export async function POST(request: NextRequest) {
  try {
    const { couple_id } = await request.json();

    if (!couple_id) {
      return NextResponse.json({ error: 'couple_id required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, partner_email, partner_invite_token, events(slug, name, event_date)')
      .eq('id', couple_id)
      .single();

    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
    }

    if (!couple.partner_email || !couple.partner_name) {
      return NextResponse.json({ skipped: true, reason: 'No partner email' });
    }

    // Generate token if not exists
    let token = couple.partner_invite_token;
    if (!token) {
      token = randomBytes(32).toString('hex');
      await supabase
        .from('couples')
        .update({
          partner_invite_token: token,
          partner_invite_sent_at: new Date().toISOString(),
        })
        .eq('id', couple_id);
    }

    const event = couple.events as any;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';
    const partnerUrl = `${baseUrl}/e/${event.slug}/partner?token=${token}`;

    const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: couple.partner_email,
      subject: `🚴 ${couple.invited_name} har anmält er till ${event.name}!`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #7c3aed;">🚴 Cykelfesten</h1>
          <p>Hej ${couple.partner_name}!</p>
          <p><strong>${couple.invited_name}</strong> har anmält er till <strong>${event.name}</strong> den ${eventDate}.</p>
          <p>Klicka på knappen nedan för att fylla i din egen profil — allergier, mysterieprofil och annat roligt:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${partnerUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 15px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
              Fyll i din profil →
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">
            Du kan uppdatera dina uppgifter när som helst innan festen.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Partner email error:', emailError);
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
    }

    return NextResponse.json({ success: true, sent_to: couple.partner_email });
  } catch (error) {
    console.error('Notify partner error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
