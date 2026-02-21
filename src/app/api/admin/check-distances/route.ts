import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireEventAccess } from '@/lib/auth';

interface Coordinates {
  lat: number;
  lng: number;
}

// Parse PostgREST point format "(lng,lat)" to {lat, lng}
function parsePoint(point: unknown): Coordinates | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as Record<string, number>;
    if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  }
  return null;
}

function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/**
 * Get cycling distance via Mapbox Directions API (same source as map view)
 */
async function getCyclingDistance(
  from: Coordinates,
  to: Coordinates,
  token: string
): Promise<{ distance_km: number; duration_min: number; source: 'cycling' | 'haversine' }> {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false&access_token=${token}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox ${res.status}`);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) throw new Error('No route');
    return {
      distance_km: Math.round((route.distance / 1000) * 10) / 10,
      duration_min: Math.round(route.duration / 60),
      source: 'cycling',
    };
  } catch {
    const dist = haversineKm(from, to);
    return {
      distance_km: Math.round(dist * 10) / 10,
      duration_min: Math.round(dist * 4),
      source: 'haversine',
    };
  }
}

interface PairwiseDistance {
  from_id: string;
  from_name: string;
  from_address: string;
  to_id: string;
  to_name: string;
  to_address: string;
  distance_km: number;
  duration_min?: number;
  source: 'cycling' | 'haversine';
}

export async function POST(request: NextRequest) {
  try {
    const { event_id, max_distance_km = 2 } = await request.json();

    if (!event_id) {
      return NextResponse.json({ error: 'event_id required' }, { status: 400 });
    }

    const auth = await requireEventAccess(event_id);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) {
      return NextResponse.json({ error: 'Mapbox token not configured' }, { status: 500 });
    }

    const supabase = createAdminClient();

    const { data: couples, error } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, address, coordinates')
      .eq('event_id', event_id)
      .eq('cancelled', false);

    if (error) throw error;
    if (!couples || couples.length === 0) {
      return NextResponse.json({ warnings: [], message: 'No couples found' });
    }

    // Parse coordinates
    const withCoords = couples
      .map(c => ({ ...c, coordinates: parsePoint(c.coordinates) }))
      .filter(c => c.coordinates) as Array<{
        id: string; invited_name: string; partner_name: string | null;
        address: string; coordinates: Coordinates;
      }>;

    if (withCoords.length < 2) {
      return NextResponse.json({
        warnings: [],
        pairwise_distances: [],
        message: 'Not enough geocoded addresses',
        geocoded: withCoords.length,
        total: couples.length,
      });
    }

    // Calculate all pairwise cycling distances via Mapbox
    // Batch with concurrency limit to avoid rate limits
    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < withCoords.length; i++) {
      for (let j = i + 1; j < withCoords.length; j++) {
        pairs.push([i, j]);
      }
    }

    const CONCURRENCY = 10;
    const results: PairwiseDistance[] = [];
    let cyclingCount = 0;

    for (let batch = 0; batch < pairs.length; batch += CONCURRENCY) {
      const chunk = pairs.slice(batch, batch + CONCURRENCY);
      const promises = chunk.map(async ([i, j]) => {
        const a = withCoords[i];
        const b = withCoords[j];
        const dist = await getCyclingDistance(a.coordinates, b.coordinates, mapboxToken);
        if (dist.source === 'cycling') cyclingCount++;
        return {
          from_id: a.id,
          from_name: a.invited_name + (a.partner_name ? ` & ${a.partner_name}` : ''),
          from_address: a.address,
          to_id: b.id,
          to_name: b.invited_name + (b.partner_name ? ` & ${b.partner_name}` : ''),
          to_address: b.address,
          distance_km: dist.distance_km,
          duration_min: dist.duration_min,
          source: dist.source,
        };
      });
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
    }

    // Sort by distance descending
    results.sort((a, b) => b.distance_km - a.distance_km);

    const warnings = results.filter(d => d.distance_km > max_distance_km);
    const allDistances = results.map(d => d.distance_km);
    const distanceSource = cyclingCount > 0 ? 'cycling' : 'haversine';

    return NextResponse.json({
      warnings,
      pairwise_distances: results,
      stats: {
        max_km: Math.max(...allDistances),
        min_km: Math.min(...allDistances),
        avg_km: Math.round((allDistances.reduce((a, b) => a + b, 0) / allDistances.length) * 10) / 10,
        total_pairs: results.length,
      },
      distance_source: distanceSource,
      distance_source_label: distanceSource === 'cycling' ? '🚴 Cykelväg' : '🐦 Fågelvägen',
      max_distance_km,
      geocoded: withCoords.length,
      total: couples.length,
      not_geocoded: couples.filter(c => !parsePoint(c.coordinates)).map(c => ({
        id: c.id,
        name: c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : ''),
        address: c.address,
      })),
    });

  } catch (error: unknown) {
    console.error('Check distances error:', error);
    const message = error instanceof Error ? error.message : 'Failed to check distances';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
