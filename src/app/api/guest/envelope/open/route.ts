import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';

// POST /api/guest/envelope/open
// Body: { envelope_id: string }
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const envelopeId = body?.envelope_id as string | undefined;

  if (!envelopeId) {
    return NextResponse.json({ error: 'envelope_id required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = cookieStore.get('guest_session')?.value;

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(session);
  if (!payload || payload.type !== 'guest') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guestEmail = payload.email.toLowerCase().trim();
  const supabase = createAdminClient();

  const { data: couple } = await supabase
    .from('couples')
    .select('id')
    .eq('cancelled', false)
    .or(`invited_email.eq.${guestEmail},partner_email.eq.${guestEmail}`)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('envelopes')
    .update({ opened_at: now })
    .eq('id', envelopeId)
    .eq('couple_id', couple.id);

  if (error) {
    return NextResponse.json({ error: 'Failed to open envelope' }, { status: 500 });
  }

  return NextResponse.json({ success: true, opened_at: now });
}
