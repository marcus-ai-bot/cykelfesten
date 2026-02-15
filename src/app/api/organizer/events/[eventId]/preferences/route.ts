import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// GET /api/organizer/events/[eventId]/preferences?coupleId=xxx
// Returns all preferences for a specific couple, plus all other couples in the event
export async function GET(request: Request, context: RouteContext) {
  const organizer = await getOrganizer();
  if (!organizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventId } = await context.params;
  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const coupleId = url.searchParams.get('coupleId');
  if (!coupleId) {
    return NextResponse.json({ error: 'coupleId required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Get all active couples for this event
  const { data: couples, error: couplesErr } = await supabase
    .from('couples')
    .select('id, invited_name, partner_name, address, address_unit, invited_allergies, partner_allergies, invited_pet_allergy, partner_pet_allergy, coordinates')
    .eq('event_id', eventId)
    .neq('cancelled', true)
    .order('invited_name');

  if (couplesErr) {
    return NextResponse.json({ error: couplesErr.message }, { status: 500 });
  }

  // Get existing preferences for this couple
  const { data: preferences, error: prefsErr } = await supabase
    .from('couple_preferences')
    .select('target_couple_id, preference')
    .eq('couple_id', coupleId)
    .eq('event_id', eventId);

  if (prefsErr && !prefsErr.message?.includes('couple_preferences')) {
    return NextResponse.json({ error: prefsErr.message }, { status: 500 });
  }

  // Build preference map
  const prefMap: Record<string, string> = {};
  (preferences || []).forEach((p: any) => {
    prefMap[p.target_couple_id] = p.preference;
  });

  // Find the source couple for distance calculation
  const sourcCouple = couples?.find((c: any) => c.id === coupleId);
  const sourceCoords = sourcCouple?.coordinates;

  // Calculate distances and build response
  const otherCouples = (couples || [])
    .filter((c: any) => c.id !== coupleId)
    .map((c: any) => {
      let distance: number | null = null;
      if (sourceCoords && c.coordinates) {
        distance = haversineKm(sourceCoords, c.coordinates);
      }
      return {
        id: c.id,
        invited_name: c.invited_name,
        partner_name: c.partner_name,
        address: c.address,
        address_unit: c.address_unit,
        allergies: [
          ...(c.invited_allergies || []),
          ...(c.partner_allergies || []),
        ].filter(Boolean),
        pet_allergy: c.invited_pet_allergy !== 'none' || c.partner_pet_allergy !== 'none',
        distance,
        preference: prefMap[c.id] || 'neutral',
      };
    });

  return NextResponse.json({
    sourceCouple: sourcCouple ? {
      id: sourcCouple.id,
      invited_name: sourcCouple.invited_name,
      partner_name: sourcCouple.partner_name,
    } : null,
    couples: otherCouples,
  });
}

// PUT /api/organizer/events/[eventId]/preferences
// Body: { coupleId, targetCoupleId, preference }
export async function PUT(request: Request, context: RouteContext) {
  const organizer = await getOrganizer();
  if (!organizer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { eventId } = await context.params;
  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { coupleId, targetCoupleId, preference } = body;

  if (!coupleId || !targetCoupleId || !preference) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const validPrefs = ['avoid', 'low', 'neutral', 'preferred', 'known'];
  if (!validPrefs.includes(preference)) {
    return NextResponse.json({ error: 'Invalid preference' }, { status: 400 });
  }

  const supabase = createAdminClient();

  if (preference === 'neutral') {
    // Delete the preference (neutral = default, no need to store)
    await supabase
      .from('couple_preferences')
      .delete()
      .eq('couple_id', coupleId)
      .eq('target_couple_id', targetCoupleId);
  } else {
    // Upsert
    const { error } = await supabase
      .from('couple_preferences')
      .upsert({
        event_id: eventId,
        couple_id: coupleId,
        target_couple_id: targetCoupleId,
        preference,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'couple_id,target_couple_id',
      });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// Haversine distance in km
function haversineKm(
  a: { lat: number; lng: number } | any,
  b: { lat: number; lng: number } | any
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const lat1 = typeof a === 'object' && 'lat' in a ? a.lat : a?.latitude || 0;
  const lng1 = typeof a === 'object' && 'lng' in a ? a.lng : a?.longitude || 0;
  const lat2 = typeof b === 'object' && 'lat' in b ? b.lat : b?.latitude || 0;
  const lng2 = typeof b === 'object' && 'lng' in b ? b.lng : b?.longitude || 0;
  
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const sa = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(sa), Math.sqrt(1 - sa));
}
