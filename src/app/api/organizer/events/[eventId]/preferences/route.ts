import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import { parsePoint, getCyclingDistance, type Coordinates } from '@/lib/geo';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Parse PostgREST point format "(lng,lat)" to {lat, lng}

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
  const sourceCouple = couples?.find((c: any) => c.id === coupleId);
  const sourceCoords = parsePoint(sourceCouple?.coordinates);

  // Calculate cycling distances for all other couples
  const others = (couples || []).filter((c: any) => c.id !== coupleId);
  
  // Build distances: use ORS cycling for each pair (parallel, max 5 concurrent)
  const distanceMap = new Map<string, { km: number; min: number; source: string }>();
  
  if (sourceCoords) {
    const targets = others
      .map(c => ({ id: c.id, coords: parsePoint(c.coordinates) }))
      .filter(t => t.coords !== null);
    
    // Batch parallel requests (5 at a time to stay within rate limits)
    const BATCH_SIZE = 5;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (t) => {
          const dist = await getCyclingDistance(sourceCoords, t.coords!);
          return { id: t.id, dist };
        })
      );
      results.forEach(r => distanceMap.set(r.id, { km: r.dist.distance_km, min: r.dist.duration_min, source: r.dist.source }));
    }
  }

  const otherCouples = others.map((c: any) => {
    const dist = distanceMap.get(c.id);
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
      distance: dist ? dist.km : null,
      duration_min: dist ? dist.min : null,
      distance_source: dist ? dist.source : null,
      preference: prefMap[c.id] || 'neutral',
    };
  });

  return NextResponse.json({
    sourceCouple: sourceCouple ? {
      id: sourceCouple.id,
      invited_name: sourceCouple.invited_name,
      partner_name: sourceCouple.partner_name,
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

// (haversine removed - using getCyclingDistance from @/lib/geo instead)
