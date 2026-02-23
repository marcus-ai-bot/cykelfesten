import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/matching
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

  const { data: event } = await supabase
    .from('events')
    .select('id, name, slug, event_date')
    .eq('id', eventId)
    .single();

  const { data: couples } = await supabase
    .from('couples')
    .select('*')
    .eq('event_id', eventId)
    .neq('cancelled', true)
    .eq('confirmed', true)
    .order('invited_name');

  // Latest match plan
  const { data: matchPlan } = await supabase
    .from('match_plans')
    .select('*')
    .eq('event_id', eventId)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  let pairings: any[] = [];
  if (matchPlan) {
    const { data } = await supabase
      .from('course_pairings')
      .select('*')
      .eq('match_plan_id', matchPlan.id);
    pairings = data || [];
  }

  return NextResponse.json({ event, couples, matchPlan, pairings });
}
