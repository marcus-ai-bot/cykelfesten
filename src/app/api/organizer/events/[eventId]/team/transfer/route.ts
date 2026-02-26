import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

// POST /api/organizer/events/[eventId]/team/transfer
// Transfer founder role to another accepted co-organizer (atomic via RPC)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const auth = await requireEventAccess(eventId);

    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (auth.role !== 'founder') {
      return NextResponse.json({ error: 'Bara grundaren kan överföra ägandeskap' }, { status: 403 });
    }

    const { targetOrganizerId } = await request.json();

    if (!targetOrganizerId) {
      return NextResponse.json({ error: 'targetOrganizerId krävs' }, { status: 400 });
    }

    if (targetOrganizerId === auth.organizer.id) {
      return NextResponse.json({ error: 'Du kan inte överföra till dig själv' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc('transfer_founder', {
      p_event_id: eventId,
      p_current_founder_id: auth.organizer.id,
      p_new_founder_id: targetOrganizerId,
    });

    if (error) {
      console.error('Transfer founder RPC error:', error);
      return NextResponse.json({ error: 'Kunde inte överföra grundarskap' }, { status: 500 });
    }

    if (data?.error) {
      return NextResponse.json({ error: data.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Transfer founder error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
