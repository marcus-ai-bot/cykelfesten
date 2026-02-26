import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

// POST /api/organizer/events/[eventId]/promote-guest
// Promote a registered guest to co-organizer (no invite loop)

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

    const { email, name } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email krävs' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = createAdminClient();

    // Verify that email belongs to a guest in this event
    const { data: couples } = await supabase
      .from('couples')
      .select('id, invited_email, partner_email')
      .eq('event_id', eventId)
      .neq('cancelled', true);

    const isGuest = (couples || []).some(c =>
      c.invited_email?.toLowerCase() === normalizedEmail ||
      c.partner_email?.toLowerCase() === normalizedEmail
    );

    if (!isGuest) {
      return NextResponse.json({ error: 'Denna email tillhör ingen registrerad gäst i eventet' }, { status: 400 });
    }

    // Check if already an organizer for this event
    const { data: existing } = await supabase
      .from('event_organizers')
      .select('organizer_id, removed_at')
      .eq('event_id', eventId)
      .in('organizer_id', (
        await supabase.from('organizers').select('id').eq('email', normalizedEmail)
      ).data?.map(o => o.id) || ['__none__']);

    const activeExisting = existing?.find(e => !e.removed_at);
    if (activeExisting) {
      return NextResponse.json({ error: 'Denna person är redan medarrangör' }, { status: 400 });
    }

    // Check 5-person limit
    const { count } = await supabase
      .from('event_organizers')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .is('removed_at', null);

    if ((count || 0) >= 5) {
      return NextResponse.json({ error: 'Max 5 arrangörer per event' }, { status: 400 });
    }

    // Find or create organizer record
    let { data: organizer } = await supabase
      .from('organizers')
      .select('id')
      .eq('email', normalizedEmail)
      .single();

    if (!organizer) {
      const { data: newOrg } = await supabase
        .from('organizers')
        .insert({ email: normalizedEmail, name: name || null })
        .select('id')
        .single();
      organizer = newOrg;
    }

    if (!organizer) {
      return NextResponse.json({ error: 'Kunde inte skapa arrangörskonto' }, { status: 500 });
    }

    // Check if there's a removed row to reactivate
    const removedExisting = existing?.find(e => e.removed_at && e.organizer_id === organizer!.id);

    if (removedExisting) {
      await supabase
        .from('event_organizers')
        .update({
          removed_at: null,
          accepted_at: new Date().toISOString(),
          role: 'co-organizer',
          invite_token: null,
        })
        .eq('event_id', eventId)
        .eq('organizer_id', organizer.id);
    } else {
      await supabase
        .from('event_organizers')
        .insert({
          event_id: eventId,
          organizer_id: organizer.id,
          role: 'co-organizer',
          accepted_at: new Date().toISOString(),
        });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Promote guest error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
