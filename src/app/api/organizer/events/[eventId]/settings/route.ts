import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(address)}&country=se&limit=1&access_token=${token}`
    );
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates;
    if (coords && coords.length === 2) {
      return { lng: coords[0], lat: coords[1] };
    }
  } catch { /* ignore */ }
  return null;
}

// GET /api/organizer/events/[eventId]/settings
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
  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single();

  return NextResponse.json({ event });
}

// PATCH /api/organizer/events/[eventId]/settings
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

  // Whitelist
  const allowed = ['name', 'event_date', 'city', 'description', 'status',
    'starter_time', 'main_time', 'dessert_time',
    'afterparty_title', 'afterparty_location', 'afterparty_time', 'afterparty_description',
    'afterparty_teasing_at', 'afterparty_revealed_at',
    'course_timing_offsets'];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  // Handle afterparty coordinates
  if (updates.afterparty_coordinates && typeof updates.afterparty_coordinates === 'object') {
    const { lat, lng } = updates.afterparty_coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') {
      filtered.afterparty_coordinates = `(${lng},${lat})`;
    }
  }

  // Fallback: geocode afterparty_location if no coordinates provided
  if (filtered.afterparty_location && !filtered.afterparty_coordinates) {
    const coords = await geocodeAddress(filtered.afterparty_location);
    if (coords) {
      filtered.afterparty_coordinates = `(${coords.lng},${coords.lat})`;
    }
  }

  const supabase = createAdminClient();
  const { data: event, error } = await supabase
    .from('events')
    .update(filtered)
    .eq('id', eventId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-recalculate wrap stats when afterparty location changes
  if (filtered.afterparty_coordinates && event?.active_match_plan_id) {
    try {
      const baseUrl = request.nextUrl.origin;
      await fetch(`${baseUrl}/api/organizer/events/${eventId}/wrap/calculate`, {
        method: 'POST',
        headers: { cookie: request.headers.get('cookie') || '' },
      });
    } catch {
      // Non-blocking — wrap recalc is best-effort
    }
  }

  return NextResponse.json({ event });
}
