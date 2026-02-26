import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail = process.env.RESEND_FROM || 'Cykelfesten <noreply@molt.isaksson.cc>';

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { audience, message } = await req.json();

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 });
  }

  if (!['all', 'starter', 'main', 'dessert'].includes(audience)) {
    return NextResponse.json({ error: 'Ogiltig mottagare' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get event info
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name, active_match_plan_id')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  // Get couples to notify
  let coupleIds: string[] = [];

  if (audience === 'all') {
    // All confirmed couples
    const { data } = await supabase
      .from('couples')
      .select('id, invited_email, invited_name')
      .eq('event_id', eventId)
      .eq('confirmed', true)
      .eq('cancelled', false);
    coupleIds = (data || []).map(c => c.id);
  } else {
    // Filter by course assignment
    if (!event.active_match_plan_id) {
      return NextResponse.json({ error: 'Ingen matchning aktiv' }, { status: 400 });
    }

    const courseMap: Record<string, string> = { starter: 'starter', main: 'main', dessert: 'dessert' };
    const { data: assignments } = await supabase
      .from('assignments')
      .select('couple_id')
      .eq('match_plan_id', event.active_match_plan_id)
      .eq('course', courseMap[audience]);

    coupleIds = (assignments || []).map(a => a.couple_id);
  }

  if (coupleIds.length === 0) {
    return NextResponse.json({ error: 'Inga mottagare hittades' }, { status: 400 });
  }

  // Get email addresses
  const { data: couples } = await supabase
    .from('couples')
    .select('id, invited_name, invited_email, partner_name, partner_email')
    .in('id', coupleIds);

  // Collect all email addresses
  const emails: { to: string; name: string }[] = [];
  for (const c of couples || []) {
    if (c.invited_email) emails.push({ to: c.invited_email, name: c.invited_name });
    if (c.partner_email) emails.push({ to: c.partner_email, name: c.partner_name || '' });
  }

  if (emails.length === 0) {
    return NextResponse.json({ error: 'Inga emailadresser hittades' }, { status: 400 });
  }

  // Send emails via Resend
  let sent = 0;
  const errors: string[] = [];

  for (const { to, name } of emails) {
    try {
      await resend.emails.send({
        from: fromEmail,
        to,
        subject: `📢 Meddelande från ${event.name}`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
            <div style="background: #FEF3C7; border-radius: 12px; padding: 20px; border: 1px solid #FCD34D;">
              <h2 style="margin: 0 0 8px 0; font-size: 18px;">📢 Meddelande från arrangören</h2>
              <p style="margin: 0 0 16px 0; color: #92400E; font-size: 14px;">${event.name}</p>
              <div style="background: white; border-radius: 8px; padding: 16px; font-size: 15px; line-height: 1.5;">
                ${message.trim().replace(/\n/g, '<br>')}
              </div>
            </div>
            <p style="margin-top: 16px; font-size: 12px; color: #9CA3AF; text-align: center;">
              Detta meddelande skickades av arrangören för ${event.name}
            </p>
          </div>
        `,
      });
      sent++;
    } catch (e: any) {
      errors.push(`${to}: ${e.message || 'unknown'}`);
    }
  }

  // TODO: Future — also send push notification via web push

  return NextResponse.json({
    sent,
    total: emails.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
