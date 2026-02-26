import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';

// GET /api/guest/host-data?slug=xxx
// Returns host assignment + guest list for the logged-in couple
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

  const { data: event } = await supabase
    .from('events')
    .select('id, name, slug, active_match_plan_id')
    .eq('slug', slug)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  const { data: couple } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, invited_email')
    .eq('event_id', event.id)
    .eq('cancelled', false)
    .or(`invited_email.eq.${guestEmail},partner_email.eq.${guestEmail}`)
    .single();

  if (!couple) {
    return NextResponse.json({ error: 'Inget par kopplat till din email' }, { status: 404 });
  }

  // Get assignment
  const { data: assignment } = await supabase
    .from('assignments')
    .select('course')
    .eq('couple_id', couple.id)
    .single();

  if (!assignment || !event.active_match_plan_id) {
    return NextResponse.json({ event: { name: event.name, slug: event.slug }, couple, hostData: null });
  }

  // Get guests for this host
  const { data: pairings } = await supabase
    .from('course_pairings')
    .select('guest_couple_id')
    .eq('match_plan_id', event.active_match_plan_id)
    .eq('host_couple_id', couple.id)
    .eq('course', assignment.course);

  const guestIds = pairings?.map(p => p.guest_couple_id) || [];

  let guests: any[] = [];
  if (guestIds.length > 0) {
    const { data: guestsData } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, person_count, invited_allergies, invited_allergy_notes, partner_allergies, partner_allergy_notes, invited_birth_year, partner_birth_year, invited_fun_facts, partner_fun_facts')
      .in('id', guestIds);
    guests = guestsData || [];
  }

  return NextResponse.json({
    event: { name: event.name, slug: event.slug },
    couple,
    hostData: {
      course: assignment.course,
      guests,
    },
  });
}
