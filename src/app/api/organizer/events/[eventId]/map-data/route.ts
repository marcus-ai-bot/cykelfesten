import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer, checkEventAccess } from '@/lib/auth';
import type { Coordinates } from '@/lib/geo';

interface RouteContext {
  params: Promise<{ eventId: string }>;
}

// Parse PostgREST point format "(lng,lat)" to {lat, lng}
function parsePoint(point: unknown): Coordinates | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as any;
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  }
  return null;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const organizer = await getOrganizer();
    if (!organizer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { eventId } = await context.params;

    const access = await checkEventAccess(organizer.id, eventId);
    if (!access.hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data: couples, error } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, address, coordinates, is_host, confirmed_at')
      .eq('event_id', eventId)
      .order('invited_name');

    if (error) {
      console.error('Supabase error in map-data:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const withCoords: Array<{ id: string; name: string; address: string; lat: number; lng: number; isHost: boolean; isConfirmed: boolean }> = [];
    const missingCoords: Array<{ id: string; name: string; address: string }> = [];

    (couples || []).forEach((c: any) => {
      const name = c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : '');
      const coords = parsePoint(c.coordinates);
      if (coords) {
        withCoords.push({
          id: c.id,
          name,
          address: c.address,
          lat: coords.lat,
          lng: coords.lng,
          isHost: !!c.is_host,
          isConfirmed: !!c.confirmed_at,
        });
      } else {
        missingCoords.push({
          id: c.id,
          name,
          address: c.address,
        });
      }
    });

    return NextResponse.json({ couples: withCoords, missingCoords });
  } catch (err: any) {
    console.error('map-data route error:', err);
    return NextResponse.json({ error: err?.message || 'Internal error', stack: err?.stack?.split('\n').slice(0, 3) }, { status: 500 });
  }
}
