import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/notifications
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const supabase = createAdminClient();

  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single();
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Tracking stats
  const { data: couples } = await supabase.from('couples').select('id').eq('event_id', eventId);
  let stats = { total_opens: 0, unique_people: 0, by_person: [] as any[] };

  if (couples && couples.length > 0) {
    const coupleIds = couples.map(c => c.id);
    const { data: opens } = await supabase.from('wrap_link_opens').select('*').in('couple_id', coupleIds);
    if (opens) {
      const unique = new Set(opens.map(o => `${o.couple_id}-${o.person_type}`));
      stats = {
        total_opens: opens.length,
        unique_people: unique.size,
        by_person: [
          { person_type: 'invited', count: opens.filter(o => o.person_type === 'invited').length },
          { person_type: 'partner', count: opens.filter(o => o.person_type === 'partner').length },
        ],
      };
    }
  }

  // Email log
  const { data: emailLog } = await supabase
    .from('email_log')
    .select('*')
    .eq('event_id', eventId)
    .order('sent_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ event, stats, emailLog: emailLog || [] });
}

// PATCH /api/organizer/events/[eventId]/notifications — save settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const updates = await request.json();
  const allowed = ['organizer_email', 'wrap_reminder_time'];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('events').update(filtered).eq('id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
