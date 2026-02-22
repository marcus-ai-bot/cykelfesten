import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const { action, couple_ids } = await request.json();
  if (!action || !Array.isArray(couple_ids) || couple_ids.length === 0) {
    return NextResponse.json({ error: 'action och couple_ids krävs' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify all couples belong to this event
  const { data: verified } = await supabase
    .from('couples')
    .select('id')
    .eq('event_id', eventId)
    .in('id', couple_ids);

  const verifiedIds = (verified || []).map(c => c.id);
  if (verifiedIds.length === 0) {
    return NextResponse.json({ error: 'Inga giltiga par' }, { status: 400 });
  }

  switch (action) {
    case 'approve': {
      const { error } = await supabase
        .from('couples')
        .update({ confirmed: true })
        .in('id', verifiedIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ message: `${verifiedIds.length} par godkända` });
    }

    case 'reject': {
      const { error } = await supabase
        .from('couples')
        .update({ cancelled: true, cancelled_at: new Date().toISOString() })
        .in('id', verifiedIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ message: `${verifiedIds.length} par nekade` });
    }

    case 'remind_address':
    case 'remind_ff': {
      // TODO: Integrate with Resend to send actual reminder emails
      // For now, just return success
      const type = action === 'remind_address' ? 'adress' : 'fun facts';
      return NextResponse.json({ 
        message: `Påminnelse om ${type} — e-postutskick kommer snart. ${verifiedIds.length} par.`,
        sent: 0,
        pending: verifiedIds.length,
      });
    }

    default:
      return NextResponse.json({ error: 'Okänd åtgärd' }, { status: 400 });
  }
}
