import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyToken } from '@/lib/tokens';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

// GET /api/guest/couple?slug=berget-2026[&coupleId=xxx]
// Returns the couple matching the logged-in guest's email for a specific event.
// If coupleId is provided AND caller is an authenticated organizer with event access,
// returns that couple directly (organizer preview mode).
export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get('slug');
  const previewCoupleId = request.nextUrl.searchParams.get('coupleId');

  if (!slug) {
    return NextResponse.json({ error: 'slug required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Look up event
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name')
    .eq('slug', slug)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event hittades inte' }, { status: 404 });
  }

  // Organizer preview mode: coupleId param + valid organizer session
  if (previewCoupleId) {
    const organizer = await getOrganizer();
    if (organizer) {
      const access = await checkEventAccess(organizer.id, event.id);
      if (access.hasAccess) {
        const { data: couple } = await supabase
          .from('couples')
          .select('id, invited_name, partner_name')
          .eq('id', previewCoupleId)
          .eq('event_id', event.id)
          .single();

        if (couple) {
          return NextResponse.json({
            eventId: event.id,
            eventName: event.name,
            couple: {
              id: couple.id,
              invited_name: couple.invited_name,
              partner_name: couple.partner_name,
            },
          });
        }
      }
    }
    // Fall through to guest auth if organizer check fails
  }

  // Standard guest auth
  const cookieStore = await cookies();
  const session = cookieStore.get('guest_session')?.value;

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyToken(session);
  if (!payload || payload.type !== 'guest') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const guestEmail = payload.email.toLowerCase().trim();

  // Find couple by email
  const { data: couple, error: coupleError } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name')
    .eq('event_id', event.id)
    .eq('cancelled', false)
    .or(`invited_email.eq.${guestEmail},partner_email.eq.${guestEmail}`)
    .single();

  if (coupleError || !couple) {
    return NextResponse.json(
      { error: 'Inget kuvert kopplat till din email för detta event.' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    eventId: event.id,
    eventName: event.name,
    couple: {
      id: couple.id,
      invited_name: couple.invited_name,
      partner_name: couple.partner_name,
    },
  });
}
