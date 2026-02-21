import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';

// GET /api/guest/events
// Returns events for guest email from guest_session cookie
export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get('guest_session')?.value;

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(session);
  if (!payload || payload.type !== 'guest') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = payload.email;
  const supabase = createAdminClient();

  const { data: couples, error: couplesError } = await supabase
    .from('couples')
    .select('event_id')
    .or(`invited_email.eq.${email},partner_email.eq.${email}`);

  if (couplesError) {
    console.error('Guest events couple lookup error:', couplesError);
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  }

  const eventIds = Array.from(new Set((couples || []).map((c: any) => c.event_id)));
  if (eventIds.length === 0) {
    return NextResponse.json({ events: [] });
  }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, name, slug, event_date, status')
    .in('id', eventIds)
    .order('event_date', { ascending: true });

  if (eventsError) {
    console.error('Guest events lookup error:', eventsError);
    return NextResponse.json({ error: 'Failed to load events' }, { status: 500 });
  }

  return NextResponse.json({ events: events || [] });
}
