import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyInviteToken } from '@/lib/tokens';

// GET /api/register/verify-invite?slug=xxx&invite=xxx
// Verifies that the invite token is valid for the event

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const invite = request.nextUrl.searchParams.get('invite');

  if (!slug || !invite) {
    return NextResponse.json({ valid: false, error: 'Missing parameters' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: event } = await supabase
    .from('events')
    .select('id, status')
    .eq('slug', slug)
    .single();

  if (!event) {
    return NextResponse.json({ valid: false, error: 'Event not found' }, { status: 404 });
  }

  if (event.status !== 'open') {
    return NextResponse.json({ valid: false, error: 'Anmälan är inte öppen för detta event', status: event.status }, { status: 403 });
  }

  if (!verifyInviteToken(event.id, invite)) {
    return NextResponse.json({ valid: false, error: 'Invalid invite' }, { status: 403 });
  }

  return NextResponse.json({ valid: true, status: event.status });
}
