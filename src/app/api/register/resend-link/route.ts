import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { randomBytes } from 'crypto';
import { createToken } from '@/lib/tokens';

// POST /api/register/resend-link
// Universal "send me my link" for guests and partners
// Body: { slug: string, email: string }

export async function POST(request: NextRequest) {
  try {
    const { slug, email } = await request.json();

    if (!slug || !email) {
      return NextResponse.json({ error: 'slug and email required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = createAdminClient();

    // Find event
    const { data: event } = await supabase
      .from('events')
      .select('id, name, slug, event_date')
      .eq('slug', slug)
      .single();

    if (!event) {
      // Don't reveal whether event exists
      return NextResponse.json({ success: true, message: 'Om din email finns i systemet får du en länk.' });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';
    const links: string[] = [];
    let recipientName = '';

    // Check if they're the invited person
    const { data: asInvited } = await supabase
      .from('couples')
      .select('id, invited_name')
      .eq('event_id', event.id)
      .eq('invited_email', normalizedEmail)
      .is('cancelled', null)
      .single();

    if (asInvited) {
      recipientName = asInvited.invited_name;
      const token = createToken(asInvited.id, 'invited');
      links.push(`${baseUrl}/e/${event.slug}/live?token=${token}`);
    }

    // Check if they're a partner
    const { data: asPartner } = await supabase
      .from('couples')
      .select('id, partner_name, partner_invite_token')
      .eq('event_id', event.id)
      .eq('partner_email', normalizedEmail)
      .is('cancelled', null)
      .single();

    if (asPartner) {
      recipientName = recipientName || asPartner.partner_name || '';
      // Ensure partner has an invite token
      let partnerToken = asPartner.partner_invite_token;
      if (!partnerToken) {
        partnerToken = randomBytes(32).toString('hex');
        await supabase
          .from('couples')
          .update({ partner_invite_token: partnerToken })
          .eq('id', asPartner.id);
      }
      links.push(`${baseUrl}/e/${event.slug}/partner?token=${partnerToken}`);
    }

    if (links.length === 0) {
      // Don't reveal whether email exists — always say "sent"
      return NextResponse.json({ success: true, message: 'Om din email finns i systemet får du en länk.' });
    }

    // Build email
    const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });

    const linksHtml = links.map((url, i) => {
      const label = links.length === 1
        ? 'Min sida →'
        : i === 0 ? 'Min gästsida →' : 'Min partnerprofil →';
      return `<p style="text-align: center; margin: 15px 0;">
        <a href="${url}" style="display: inline-block; background: #d97706; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          ${label}
        </a>
      </p>`;
    }).join('');

    await resend.emails.send({
      from: FROM_EMAIL,
      to: normalizedEmail,
      subject: `🔑 Din länk till ${event.name}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #d97706;">🚴 Cykelfesten</h1>
          <p>Hej${recipientName ? ` ${recipientName}` : ''}!</p>
          <p>Här är din länk till <strong>${event.name}</strong> (${eventDate}):</p>
          ${linksHtml}
          <p style="color: #6b7280; font-size: 14px;">
            Om du inte begärde denna länk kan du ignorera detta mail.
          </p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: 'Om din email finns i systemet får du en länk.' });

  } catch (error) {
    console.error('Resend link error:', error);
    return NextResponse.json({ error: 'Något gick fel' }, { status: 500 });
  }
}
