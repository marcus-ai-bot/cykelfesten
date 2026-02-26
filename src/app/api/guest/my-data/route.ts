import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';

// GET /api/guest/my-data?slug=xxx
// Returns event + couple + envelopes for the logged-in guest (via guest_session cookie)
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

  const { data: event, error: eventError } = await supabase
    .from('events_public')
    .select('id, name, event_date, starter_time, main_time, dessert_time, time_offset_minutes')
    .eq('slug', slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, partner_email, partner_invite_sent_at, address')
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

  const { data: planData } = await supabase
    .from('match_plans')
    .select('id')
    .eq('event_id', event.id)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  let envelopes: any[] = [];
  if (planData?.id) {
    const { data: envelopesData } = await supabase
      .from('envelopes')
      .select('id, course, scheduled_at, activated_at, opened_at, destination_address, destination_notes, host_couple_id')
      .eq('match_plan_id', planData.id)
      .eq('couple_id', couple.id)
      .order('scheduled_at');

    envelopes = envelopesData || [];
  }

  const hostEnvelope = envelopes.find(e => e.host_couple_id === couple.id);
  const assignment = hostEnvelope ? hostEnvelope.course : null;

  // Get organizer contact email
  const { data: eventFull } = await supabase
    .from('events')
    .select('organizer_email')
    .eq('id', event.id)
    .single();

  // Check if this guest is also an organizer for this event
  let isOrganizer = false;
  const { data: orgRecord } = await supabase
    .from('organizers')
    .select('id')
    .eq('email', guestEmail)
    .maybeSingle();

  if (orgRecord) {
    const { data: eo } = await supabase
      .from('event_organizers')
      .select('id')
      .eq('event_id', event.id)
      .eq('organizer_id', orgRecord.id)
      .is('removed_at', null)
      .not('accepted_at', 'is', null)
      .maybeSingle();
    isOrganizer = !!eo;
  }

  return NextResponse.json({
    event,
    couple,
    envelopes,
    assignment,
    organizerEmail: eventFull?.organizer_email ?? null,
    isOrganizer,
  });
}
