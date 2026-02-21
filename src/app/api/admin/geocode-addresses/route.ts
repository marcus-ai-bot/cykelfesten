import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geocodeAddressDetailed } from '@/lib/geocode';
import { requireEventAccess } from '@/lib/auth';

// POST /api/admin/geocode-addresses
// Geocodes all addresses for couples in an event that don't have coordinates yet
// Uses Mapbox v6 (rooftop accuracy) with Nominatim fallback

function parsePoint(point: unknown): { lat: number; lng: number } | undefined {
  if (!point) return undefined;
  if (typeof point === 'string') {
    const m = point.match(/\(([^,]+),([^)]+)\)/);
    if (m) return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const { eventId } = await request.json();
    
    if (!eventId) {
      return NextResponse.json({ error: 'eventId required' }, { status: 400 });
    }
    
    // Auth: Require organizer access to this event
    const auth = await requireEventAccess(eventId);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    
    const supabase = await createClient();

    // Get event location for proximity bias
    const { data: event } = await supabase
      .from('events')
      .select('location, coordinates')
      .eq('id', eventId)
      .single();

    const proximity = event?.coordinates ? parsePoint(event.coordinates) : undefined;
    const city = event?.location || undefined;
    
    // Get couples without coordinates
    const { data: couples, error: fetchError } = await supabase
      .from('couples')
      .select('id, address, coordinates')
      .eq('event_id', eventId)
      .is('coordinates', null)
      .not('address', 'is', null);
    
    if (fetchError) {
      return NextResponse.json({ error: 'Failed to fetch couples' }, { status: 500 });
    }
    
    if (!couples || couples.length === 0) {
      return NextResponse.json({ 
        message: 'All addresses already geocoded', 
        geocoded: 0 
      });
    }
    
    const results = {
      geocoded: 0,
      failed: 0,
      details: [] as Array<{ id: string; address: string; source?: string; accuracy?: string; error?: string }>,
    };
    
    for (const couple of couples) {
      if (!couple.address) continue;
      
      try {
        const result = await geocodeAddressDetailed(couple.address, { proximity, city });
        
        if (result) {
          const pointValue = `(${result.coordinates.lng},${result.coordinates.lat})`;
          const { error: updateError } = await supabase
            .from('couples')
            .update({ coordinates: pointValue })
            .eq('id', couple.id);
          
          if (updateError) {
            results.failed++;
            results.details.push({ id: couple.id, address: couple.address, error: 'DB update failed' });
          } else {
            results.geocoded++;
            results.details.push({
              id: couple.id,
              address: couple.address,
              source: result.source,
              accuracy: result.accuracy,
            });
          }
        } else {
          results.failed++;
          results.details.push({ id: couple.id, address: couple.address, error: 'No geocode match' });
        }
        
        // Small delay between requests (Mapbox is fast, but be nice)
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (err: unknown) {
        results.failed++;
        results.details.push({ id: couple.id, address: couple.address, error: String(err) });
      }
    }
    
    return NextResponse.json({
      success: true,
      total_processed: couples.length,
      ...results,
    });
    
  } catch (error) {
    console.error('Geocode error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
