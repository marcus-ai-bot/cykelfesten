import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

// GET /api/organizer/events/[eventId]/team/emails
// Returns list of organizer emails for this event (for checking promote eligibility)

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const auth = await requireEventAccess(eventId);

  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = createAdminClient();

  const { data } = await supabase
    .from('event_organizers')
    .select('organizer:organizers(email)')
    .eq('event_id', eventId)
    .is('removed_at', null);

  const emails = (data || [])
    .map((d: any) => d.organizer?.email)
    .filter(Boolean);

  return NextResponse.json({ emails });
}
