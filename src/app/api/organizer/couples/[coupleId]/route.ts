import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';

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

// GET /api/organizer/couples/[coupleId]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: couple, error } = await supabase
    .from('couples')
    .select('*, events(id, name, slug)')
    .eq('id', coupleId)
    .single();

  if (error || !couple) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Verify organizer has access to this event
  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) {
    return NextResponse.json({ error: 'No access' }, { status: 403 });
  }

  return NextResponse.json({ couple });
}

// PATCH /api/organizer/couples/[coupleId] — update couple fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  // Get couple + verify access
  const { data: couple } = await supabase
    .from('couples')
    .select('event_id')
    .eq('id', coupleId)
    .single();

  if (!couple) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const updates = await request.json();

  // Whitelist allowed fields
  const allowed = [
    'invited_name', 'invited_email', 'invited_phone', 'invited_allergies',
    'invited_birth_year', 'invited_fun_facts', 'invited_pet_allergy',
    'partner_name', 'partner_email', 'partner_phone', 'partner_allergies',
    'partner_birth_year', 'partner_fun_facts', 'partner_pet_allergy',
    'address', 'address_unit', 'address_notes', 'course_preference',
    'instagram_handle', 'accessibility_needs', 'accessibility_ok',
  ];

  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in updates) filtered[key] = updates[key];
  }

  // Handle coordinates from address autocomplete
  if (updates.address_coordinates && typeof updates.address_coordinates === 'object') {
    const { lat, lng } = updates.address_coordinates;
    if (typeof lat === 'number' && typeof lng === 'number') {
      filtered.coordinates = `(${lng},${lat})`;
    }
  }

  // If address changed but no coordinates provided, try server-side geocoding
  if (filtered.address && !filtered.coordinates) {
    const coords = await geocodeAddress(filtered.address);
    if (coords) {
      filtered.coordinates = `(${coords.lng},${coords.lat})`;
    }
  }

  const { data, error } = await supabase
    .from('couples')
    .update(filtered)
    .eq('id', coupleId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ couple: data });
}

// DELETE /api/organizer/couples/[coupleId] — soft-delete (cancel)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ coupleId: string }> }
) {
  const { coupleId } = await params;
  const organizer = await getOrganizer();
  if (!organizer) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: couple } = await supabase
    .from('couples')
    .select('event_id')
    .eq('id', coupleId)
    .single();

  if (!couple) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: access } = await supabase
    .from('event_organizers')
    .select('role')
    .eq('event_id', couple.event_id)
    .eq('organizer_id', organizer.id)
    .not('accepted_at', 'is', null)
    .is('removed_at', null)
    .single();

  if (!access) return NextResponse.json({ error: 'No access' }, { status: 403 });

  const { error } = await supabase
    .from('couples')
    .update({ cancelled: true, cancelled_at: new Date().toISOString() })
    .eq('id', coupleId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
