import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

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
    .select('id, name, slug, status')
    .eq('id', eventId)
    .single();

  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: couples } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, invited_email, partner_email, invited_phone, address, address_unit, coordinates, confirmed, cancelled, role, course_preference, invited_allergies, partner_allergies, invited_fun_facts, partner_fun_facts, accessibility_ok, accessibility_needs, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  // Since we don't have approval_status column yet, derive it:
  // confirmed=true → 'approved' (for now, until we add the column)
  // confirmed=false → 'waiting'
  const couplesWithStatus = (couples || []).map(c => ({
    ...c,
    approval_status: c.cancelled ? 'rejected'
      : !c.confirmed ? 'waiting'
      : 'approved' as 'waiting' | 'approved' | 'rejected',
  }));

  return NextResponse.json({ event, couples: couplesWithStatus });
}
