import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { geocodeAddress, calculateDistance, type Coordinates } from '@/lib/geo';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CoupleWithCoords {
  id: string;
  invited_name: string;
  partner_name: string | null;
  address: string;
  coordinates: Coordinates | null;
}

interface PairwiseDistance {
  from_id: string;
  from_name: string;
  from_address: string;
  to_id: string;
  to_name: string;
  to_address: string;
  distance_km: number;
}

export async function POST(request: NextRequest) {
  try {
    const { event_id, max_distance_km = 5 } = await request.json();
    
    if (!event_id) {
      return NextResponse.json({ error: 'event_id required' }, { status: 400 });
    }
    
    // Load couples
    const { data: couples, error } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, address, coordinates')
      .eq('event_id', event_id)
      .eq('cancelled', false);
    
    if (error) throw error;
    if (!couples || couples.length === 0) {
      return NextResponse.json({ warnings: [], message: 'No couples found' });
    }
    
    // Geocode any addresses without coordinates
    const needsGeocoding = couples.filter(c => !c.coordinates && c.address);
    
    if (needsGeocoding.length > 0) {
      console.log(`Geocoding ${needsGeocoding.length} addresses...`);
      
      for (const couple of needsGeocoding) {
        const coords = await geocodeAddress(couple.address);
        
        if (coords) {
          // Update database
          await supabase
            .from('couples')
            .update({ coordinates: coords })
            .eq('id', couple.id);
          
          couple.coordinates = coords;
        }
        
        // Rate limit: 1 request per second for Nominatim
        await new Promise(resolve => setTimeout(resolve, 1100));
      }
    }
    
    // Filter couples with coordinates
    const withCoords = couples.filter(c => c.coordinates) as CoupleWithCoords[];
    
    if (withCoords.length < 2) {
      return NextResponse.json({ 
        warnings: [],
        pairwise_distances: [],
        message: 'Not enough geocoded addresses to check distances',
        geocoded: withCoords.length,
        total: couples.length,
      });
    }
    
    // Calculate ALL pairwise distances between hosts
    const pairwiseDistances: PairwiseDistance[] = [];
    
    for (let i = 0; i < withCoords.length; i++) {
      for (let j = i + 1; j < withCoords.length; j++) {
        const a = withCoords[i];
        const b = withCoords[j];
        const distance = calculateDistance(a.coordinates!, b.coordinates!);
        
        pairwiseDistances.push({
          from_id: a.id,
          from_name: a.invited_name + (a.partner_name ? ` & ${a.partner_name}` : ''),
          from_address: a.address,
          to_id: b.id,
          to_name: b.invited_name + (b.partner_name ? ` & ${b.partner_name}` : ''),
          to_address: b.address,
          distance_km: Math.round(distance * 10) / 10,
        });
      }
    }
    
    // Sort by distance descending (longest first)
    pairwiseDistances.sort((a, b) => b.distance_km - a.distance_km);
    
    // Find warnings (pairs > max_distance_km apart)
    const warnings = pairwiseDistances.filter(d => d.distance_km > max_distance_km);
    
    // Calculate stats
    const allDistances = pairwiseDistances.map(d => d.distance_km);
    const maxDistance = Math.max(...allDistances);
    const minDistance = Math.min(...allDistances);
    const avgDistance = Math.round((allDistances.reduce((a, b) => a + b, 0) / allDistances.length) * 10) / 10;
    
    return NextResponse.json({
      warnings,
      pairwise_distances: pairwiseDistances,
      stats: {
        max_km: maxDistance,
        min_km: minDistance,
        avg_km: avgDistance,
        total_pairs: pairwiseDistances.length,
      },
      max_distance_km,
      geocoded: withCoords.length,
      total: couples.length,
      not_geocoded: couples.filter(c => !c.coordinates).map(c => ({
        id: c.id,
        name: c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : ''),
        address: c.address,
      })),
    });
    
  } catch (error: any) {
    console.error('Check distances error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check distances' },
      { status: 500 }
    );
  }
}
