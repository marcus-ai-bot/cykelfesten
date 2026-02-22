import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/envelope-times?coupleId=xxx
// Returns all reveal timestamps for a specific couple's envelopes, sorted chronologically
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const coupleId = request.nextUrl.searchParams.get('coupleId');
  if (!coupleId) return NextResponse.json({ error: 'coupleId required' }, { status: 400 });

  const supabase = createAdminClient();

  // Get event for match plan
  const { data: event } = await supabase
    .from('events')
    .select('active_match_plan_id, event_date')
    .eq('id', eventId)
    .single();

  if (!event?.active_match_plan_id) {
    return NextResponse.json({ times: [] });
  }

  // Get envelopes for this couple
  const { data: envelopes } = await supabase
    .from('envelopes')
    .select('course, teasing_at, clue_1_at, clue_2_at, street_at, number_at, opened_at')
    .eq('match_plan_id', event.active_match_plan_id)
    .eq('couple_id', coupleId)
    .order('course');

  if (!envelopes?.length) {
    return NextResponse.json({ times: [] });
  }

  const courseLabels: Record<string, string> = {
    starter: 'Förrätt',
    main: 'Varmrätt',
    dessert: 'Dessert',
  };

  const stateLabels: Record<string, string> = {
    teasing: 'Nyfiken?',
    clue_1: 'Ledtråd 1',
    clue_2: 'Ledtråd 2',
    street: 'Gatunamn',
    number: 'Husnummer',
    opened: 'Full reveal',
  };

  const times: Array<{ label: string; time: string; display: string; state: string; course: string }> = [];

  // Add a "before anything" timestamp (1 hour before first reveal)
  const allTimestamps: string[] = [];

  for (const env of envelopes) {
    const course = courseLabels[env.course] || env.course;
    const reveals = [
      { key: 'teasing', at: env.teasing_at },
      { key: 'clue_1', at: env.clue_1_at },
      { key: 'clue_2', at: env.clue_2_at },
      { key: 'street', at: env.street_at },
      { key: 'number', at: env.number_at },
      { key: 'opened', at: env.opened_at },
    ];

    for (const r of reveals) {
      if (!r.at) continue;
      allTimestamps.push(r.at);
      const dt = new Date(r.at);
      times.push({
        label: `${course} · ${stateLabels[r.key] || r.key}`,
        time: r.at,
        display: dt.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }),
        state: r.key,
        course: env.course,
      });
    }
  }

  // Sort chronologically
  times.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  // Add "before" entry (30 min before first)
  if (times.length > 0) {
    const firstTime = new Date(times[0].time);
    const before = new Date(firstTime.getTime() - 30 * 60 * 1000);
    times.unshift({
      label: 'Före allt',
      time: before.toISOString(),
      display: before.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' }),
      state: 'locked',
      course: '',
    });
  }

  return NextResponse.json({ times });
}
