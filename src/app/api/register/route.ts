import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyInviteToken } from '@/lib/tokens';

// POST /api/register
// Server-side registration: insert couple + trigger emails

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slug, invite_token, ...formData } = body;

    if (!slug || !invite_token) {
      return NextResponse.json({ error: 'Missing slug or invite token' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, status')
      .eq('slug', slug)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
    }

    if (event.status !== 'open') {
      return NextResponse.json({ error: 'Anmälan är inte öppen för detta event' }, { status: 400 });
    }

    // Verify invite token
    if (!verifyInviteToken(event.id, invite_token)) {
      return NextResponse.json({ error: 'Ogiltig inbjudningslänk' }, { status: 403 });
    }

    // Insert couple
    const { data: couple, error: insertError } = await supabase
      .from('couples')
      .insert({
        event_id: event.id,
        ...formData,
        confirmed: true,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Insert couple error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Send emails (fire-and-forget, but server-side so they actually run)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://cykelfesten.vercel.app';

    // Confirmation email
    fetch(`${baseUrl}/api/register/notify-registered`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couple_id: couple.id }),
    }).catch((err) => console.error('notify-registered failed:', err));

    // Partner invite email
    if (formData.partner_email) {
      fetch(`${baseUrl}/api/register/notify-partner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couple_id: couple.id }),
      }).catch((err) => console.error('notify-partner failed:', err));
    }

    return NextResponse.json({ success: true, couple_id: couple.id });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
