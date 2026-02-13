import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { geocodeAddress } from '@/lib/geo';
import { requireEventAccess } from '@/lib/auth';

// POST /api/admin/geocode-addresses
// Geocodes all addresses for couples in an event that don't have coordinates yet

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
      errors: [] as string[],
    };
    
    for (const couple of couples) {
      if (!couple.address) continue;
      
      try {
        const coords = await geocodeAddress(couple.address);
        
        if (coords) {
          const { error: updateError } = await supabase
            .from('couples')
            .update({ coordinates: coords })
            .eq('id', couple.id);
          
          if (updateError) {
            results.failed++;
            results.errors.push(`${couple.id}: Update failed`);
          } else {
            results.geocoded++;
          }
        } else {
          results.failed++;
          results.errors.push(`${couple.id}: Could not geocode "${couple.address}"`);
        }
        
        // Rate limit: Nominatim allows 1 req/sec
        await new Promise(resolve => setTimeout(resolve, 1100));
        
      } catch (err: any) {
        results.failed++;
        results.errors.push(`${couple.id}: ${err.message}`);
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
