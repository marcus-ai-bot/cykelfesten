import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';

// GET /api/guest/couple?slug=berget-2026
// Returns the couple matching the logged-in guest's email for a specific event
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
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

  // Look up event
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  // Find couple by email
  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name')
    .eq('event_id', event.id)
    .eq('cancelled', false)
    .or(`invited_email.eq.${guestEmail},partner_email.eq.${guestEmail}`)
    .single();

  if (coupleError || !couple) {
    return NextResponse.json(
      { error: 'Inget kuvert kopplat till din email för detta event.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    eventId: event.id,
    eventName: event.name,
    couple: {
      id: couple.id,
      invited_name: couple.invited_name,
      partner_name: couple.partner_name,
    },
  });
}
