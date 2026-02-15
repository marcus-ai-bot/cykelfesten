import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/messages
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
    .select('name, host_self_messages, lips_sealed_messages, mystery_host_messages')
    .eq('id', eventId)
    .single();

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    eventName: event.name,
    host_self_messages: event.host_self_messages,
    lips_sealed_messages: event.lips_sealed_messages,
    mystery_host_messages: event.mystery_host_messages,
  });
}

// PATCH /api/organizer/events/[eventId]/messages
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
  const allowed = ['host_self_messages', 'lips_sealed_messages', 'mystery_host_messages'];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('events').update(filtered).eq('id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
