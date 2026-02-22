import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/wrap
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

  // Get couples for preview dropdown
  const { data: couples } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name')
    .eq('event_id', eventId)
    .eq('confirmed', true)
    .order('invited_name');

  return NextResponse.json({ event, couples: couples || [] });
}

// POST /api/organizer/events/[eventId]/wrap/calculate
// Moved to separate route below

// PATCH /api/organizer/events/[eventId]/wrap — update wrap_stats
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const { wrap_stats } = await request.json();

  const supabase = createAdminClient();
  const { error } = await supabase.from('events').update({ wrap_stats }).eq('id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
