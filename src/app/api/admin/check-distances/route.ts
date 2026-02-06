import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { geocodeAddress, calculateDistance, calculateCentroid, type Coordinates } from '@/lib/geo';

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
        message: 'Not enough geocoded addresses to check distances',
        geocoded: withCoords.length,
        total: couples.length,
      });
    }
    
    // Calculate centroid
    const centroid = calculateCentroid(withCoords.map(c => c.coordinates!));
    
    // Calculate distances and find warnings
    const distances = withCoords.map(c => {
      const distance = calculateDistance(centroid, c.coordinates!);
      return {
        id: c.id,
        name: c.invited_name + (c.partner_name ? ` & ${c.partner_name}` : ''),
        address: c.address,
        distance_km: Math.round(distance * 10) / 10,
        coordinates: c.coordinates,
      };
    });
    
    // Sort by distance descending
    distances.sort((a, b) => b.distance_km - a.distance_km);
    
    // Find warnings (> max_distance_km from center)
    const warnings = distances.filter(d => d.distance_km > max_distance_km);
    
    // Calculate median distance for reference
    const sortedDistances = distances.map(d => d.distance_km).sort((a, b) => a - b);
    const medianDistance = sortedDistances[Math.floor(sortedDistances.length / 2)];
    
    return NextResponse.json({
      warnings,
      all_distances: distances,
      centroid,
      median_distance_km: Math.round(medianDistance * 10) / 10,
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
