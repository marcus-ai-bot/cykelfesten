import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

const DEFAULT_TIMING = {
  teasing_minutes_before: 360,
  clue_1_minutes_before: 120,
  clue_2_minutes_before: 30,
  street_minutes_before: 15,
  number_minutes_before: 5,
  during_meal_clue_interval_minutes: 2,
  distance_adjustment_enabled: true,
};

// GET /api/organizer/events/[eventId]/timing
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

  const { data: event } = await supabase.from('events').select('name').eq('id', eventId).single();

  let { data: timing } = await supabase
    .from('event_timing')
    .select('*')
    .eq('event_id', eventId)
    .single();

  // Create default if not exists
  if (!timing) {
    const { data: newTiming } = await supabase
      .from('event_timing')
      .insert({ event_id: eventId, ...DEFAULT_TIMING })
      .select()
      .single();
    timing = newTiming;
  }

  return NextResponse.json({ timing, eventName: event?.name || '' });
}

// PATCH /api/organizer/events/[eventId]/timing
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
  const allowed = [
    'teasing_minutes_before', 'clue_1_minutes_before', 'clue_2_minutes_before',
    'street_minutes_before', 'number_minutes_before',
    'during_meal_clue_interval_minutes', 'distance_adjustment_enabled',
  ];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const supabase = createAdminClient();
  const { data: timing, error } = await supabase
    .from('event_timing')
    .update(filtered)
    .eq('event_id', eventId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ timing });
}
