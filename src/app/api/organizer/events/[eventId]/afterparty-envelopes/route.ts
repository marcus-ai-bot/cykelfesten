import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import { calculateHaversineDistance, type Coordinates } from '@/lib/geo';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

function parsePoint(point: unknown): Coordinates | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as Record<string, unknown>;
    if (p.lat != null && p.lng != null) return { lat: Number(p.lat), lng: Number(p.lng) };
  }
  return null;
}

function formatScheduledAt(eventDate: string, afterpartyTime: string | null): string {
  const normalized = afterpartyTime
    ? afterpartyTime.length === 5 ? `${afterpartyTime}:00` : afterpartyTime
    : '22:00:00';
  return `${eventDate}T${normalized}`;
}

function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const km = calculateHaversineDistance(from, to);
  return Math.round(km * 10) / 10;
}

/**
 * POST /api/organizer/events/[eventId]/afterparty-envelopes
 *
 * Creates/updates afterparty envelopes for all active couples.
 */
export async function POST(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { eventId } = await params;

  const organizer = await getOrganizer();
  if (!organizer) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await checkEventAccess(organizer.id, eventId);
  if (!access.hasAccess) {
    return NextResponse.json({ error: 'No access to this event' }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, event_date, afterparty_location, afterparty_coordinates, afterparty_time, afterparty_door_code, active_match_plan_id')
    .eq('id', eventId)
    .single();

  if (eventError || !event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (!event.afterparty_location) {
    return NextResponse.json({ error: 'afterparty_location saknas' }, { status: 400 });
  }

  if (!event.active_match_plan_id) {
    return NextResponse.json({ error: 'No active match plan' }, { status: 400 });
  }

  const matchPlanId = event.active_match_plan_id;
  const afterpartyCoords = parsePoint(event.afterparty_coordinates);

  const { data: couples, error: couplesError } = await supabase
    .from('couples')
    .select('id, cancelled')
    .eq('event_id', eventId)
    .neq('cancelled', true);

  if (couplesError) {
    return NextResponse.json({ error: 'Kunde inte hämta par' }, { status: 500 });
  }

  const activeCouples = (couples ?? []).filter(c => !c.cancelled);

  const { data: existingEnvelopes } = await supabase
    .from('envelopes')
    .select('couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('course', 'afterparty')
    .neq('cancelled', true);

  const existingSet = new Set((existingEnvelopes ?? []).map(e => e.couple_id));

  const { data: dessertPairings, error: pairingsError } = await supabase
    .from('course_pairings')
    .select(`
      guest_couple_id,
      host_couple_id,
      host_couple:couples!course_pairings_host_couple_id_fkey (id, coordinates)
    `)
    .eq('match_plan_id', matchPlanId)
    .eq('course', 'dessert');

  if (pairingsError) {
    return NextResponse.json({ error: 'Kunde inte hämta dessert-pairings' }, { status: 500 });
  }

  const dessertHostCoords = new Map<string, Coordinates>();
  for (const pairing of dessertPairings ?? []) {
    // Supabase FK join returns object (single) or array — normalize
    const hostCouple = Array.isArray((pairing as any).host_couple)
      ? (pairing as any).host_couple[0]
      : (pairing as any).host_couple;
    const hostCoords = parsePoint(hostCouple?.coordinates ?? null);
    if (pairing.guest_couple_id && hostCoords) {
      dessertHostCoords.set(pairing.guest_couple_id, hostCoords);
    }
  }

  const scheduledAt = formatScheduledAt(event.event_date, event.afterparty_time);

  const envelopesToUpsert = activeCouples.map(couple => {
    const hostCoords = dessertHostCoords.get(couple.id);
    const cyclingDistanceKm = hostCoords && afterpartyCoords
      ? calculateDistanceKm(hostCoords, afterpartyCoords)
      : null;

    return {
      match_plan_id: matchPlanId,
      couple_id: couple.id,
      course: 'afterparty',
      host_couple_id: null,
      destination_address: event.afterparty_location,
      destination_notes: event.afterparty_door_code,
      teasing_at: null,
      clue_1_at: null,
      clue_2_at: null,
      street_at: null,
      number_at: null,
      opened_at: null,
      scheduled_at: scheduledAt,
      cycling_distance_km: cyclingDistanceKm,
    };
  });

  const { error: upsertError } = await supabase
    .from('envelopes')
    .upsert(envelopesToUpsert, { onConflict: 'match_plan_id,couple_id,course' });

  if (upsertError) {
    return NextResponse.json(
      { error: 'Kunde inte skapa afterparty-kuvert', details: upsertError.message },
      { status: 500 }
    );
  }

  const created = activeCouples.filter(c => !existingSet.has(c.id)).length;
  const updated = activeCouples.length - created;

  return NextResponse.json({ success: true, created, updated });
}
