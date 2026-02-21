import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// POST /api/organizer/events/[eventId]/unlock-invite
// Unlocks the invite phase by setting event status back to 'open'
export async function POST(_request: Request, context: RouteContext) {
  const organizer = await getOrganizer();
  if (!organizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventId } = await context.params;
  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Only allow unlocking from 'matched' or 'locked' status
  const { data: event } = await supabase
    .from('events')
    .select('status')
    .eq('id', eventId)
    .single();

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (event.status !== 'matched' && event.status !== 'locked') {
    return NextResponse.json({ error: 'Event is not locked' }, { status: 400 });
  }

  const { error } = await supabase
    .from('events')
    .update({ status: 'open' })
    .eq('id', eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
