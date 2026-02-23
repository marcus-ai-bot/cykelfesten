import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

// POST /api/register/notify-registered
// Sends confirmation email to the person who registered
// Body: { couple_id: string }

const NOTIFY_RATE_LIMIT = { maxCount: 5, windowMinutes: 15, prefix: 'notify-reg' };

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const ipKey = `${NOTIFY_RATE_LIMIT.prefix}:${ip}`;
    const rl = await checkRateLimit(
      ipKey,
      NOTIFY_RATE_LIMIT.windowMinutes,
      NOTIFY_RATE_LIMIT.maxCount
    );
    if (!rl.success) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const { couple_id } = await request.json();

    if (!couple_id || typeof couple_id !== 'string' || couple_id.length > 50) {
      return NextResponse.json({ error: 'couple_id required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('id, invited_name, invited_email, partner_name, events(name, slug, event_date, starter_time, main_time, dessert_time)')
      .eq('id', couple_id)
      .single();

    if (coupleError || !couple) {
      console.error('Couple not found:', coupleError);
      return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
    }

    if (!couple.invited_email) {
      return NextResponse.json({ skipped: true, reason: 'No email' });
    }

    const event = couple.events as any;
    const eventDate = new Date(event.event_date).toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const partnerLine = couple.partner_name
      ? `<p>Du och <strong>${couple.partner_name}</strong> är nu anmälda! 🎉</p>`
      : `<p>Du är nu anmäld! 🎉</p>`;

    const { error: emailError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: couple.invited_email,
      subject: `✅ Anmälan bekräftad — ${event.name}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #d97706;">🚴 Cykelfesten</h1>
          <p>Hej ${couple.invited_name}!</p>
          ${partnerLine}
          <div style="background: #fffbeb; border-radius: 12px; padding: 20px; margin: 20px 0;">
            <h2 style="margin: 0 0 8px; color: #92400e;">${event.name}</h2>
            <p style="margin: 0; color: #78350f;">${eventDate}</p>
          </div>
          <h3 style="color: #92400e;">Vad händer nu?</h3>
          <ol style="color: #78350f;">
            <li>Arrangören samlar in fler anmälningar</li>
            <li>Matchningen körs — du får veta vilken rätt du lagar</li>
            <li>Kvällen innan: förbered din rätt!</li>
            <li>Festdagen: öppna kuvert och cykla! 🚴</li>
          </ol>
          <p style="color: #6b7280; font-size: 14px;">
            Du kan alltid hitta din länk via event-sidan om du tappar bort den.
          </p>
        </div>
      `,
    });

    if (emailError) {
      console.error('Registration confirmation email error:', emailError);
      return NextResponse.json({ error: 'Failed to send email', details: String(emailError) }, { status: 500 });
    }

    return NextResponse.json({ success: true, sent_to: couple.invited_email });
  } catch (error) {
    console.error('Notify registered error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
