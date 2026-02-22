import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/awards
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
    .select('id, name, slug, enabled_awards, thank_you_message, wrap_stats')
    .eq('id', eventId)
    .single();

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get assignments
  const { data: couples } = await supabase
    .from('couples')
    .select('id')
    .eq('event_id', eventId);

  let assignments: any[] = [];
  if (couples && couples.length > 0) {
    const coupleIds = couples.map(c => c.id);
    const { data } = await supabase
      .from('award_assignments')
      .select('*, couples(invited_name, partner_name)')
      .in('couple_id', coupleIds);
    assignments = data || [];
  }

  return NextResponse.json({ event, assignments });
}

// PATCH /api/organizer/events/[eventId]/awards — save settings
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const { enabled_awards, thank_you_message, award_approved_at, award_sent_at } = await request.json();

  const supabase = createAdminClient();
  
  // Store approval/send timestamps in wrap_stats JSON (no schema migration needed)
  const updateData: Record<string, unknown> = {
    enabled_awards: enabled_awards || [],
    thank_you_message: thank_you_message || null,
  };
  
  // If approval or send timestamps provided, merge into wrap_stats
  if (award_approved_at !== undefined || award_sent_at !== undefined) {
    const { data: current } = await supabase.from('events').select('wrap_stats').eq('id', eventId).single();
    const ws = current?.wrap_stats || {};
    if (award_approved_at !== undefined) ws.award_approved_at = award_approved_at;
    if (award_sent_at !== undefined) ws.award_sent_at = award_sent_at;
    updateData.wrap_stats = ws;
  }

  const { error } = await supabase
    .from('events')
    .update(updateData)
    .eq('id', eventId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
