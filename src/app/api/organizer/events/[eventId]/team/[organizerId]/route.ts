import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

// DELETE /api/organizer/events/[eventId]/team/[organizerId]
// Remove a co-organizer or revoke a pending invite

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string; organizerId: string }> }
) {
  try {
    const { eventId, organizerId } = await params;
    const auth = await requireEventAccess(eventId);

    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const supabase = createAdminClient();

    // Fetch target row
    const { data: target, error: fetchError } = await supabase
      .from('event_organizers')
      .select('organizer_id, role, accepted_at')
      .eq('event_id', eventId)
      .eq('organizer_id', organizerId)
      .is('removed_at', null)
      .single();

    if (fetchError || !target) {
      return NextResponse.json({ error: 'Arrangören hittades inte' }, { status: 404 });
    }

    // Can't remove founder
    if (target.role === 'founder') {
      return NextResponse.json({ error: 'Grundaren kan inte tas bort' }, { status: 400 });
    }

    // Can't remove yourself
    if (organizerId === auth.organizer.id) {
      return NextResponse.json({ error: 'Du kan inte ta bort dig själv' }, { status: 400 });
    }

    // Accepted co-organizers: only founder can remove
    if (target.accepted_at && auth.role !== 'founder') {
      return NextResponse.json({ error: 'Bara grundaren kan ta bort medarrangörer' }, { status: 403 });
    }

    // Soft delete
    const { error: updateError } = await supabase
      .from('event_organizers')
      .update({
        removed_at: new Date().toISOString(),
        invite_token: null,
      })
      .eq('event_id', eventId)
      .eq('organizer_id', organizerId);

    if (updateError) {
      console.error('Remove organizer error:', updateError);
      return NextResponse.json({ error: 'Kunde inte ta bort arrangören' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Team DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
