import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getOrganizer } from '@/lib/auth';
import { randomBytes } from 'crypto';

// POST /api/organizer/events
// Create a new event

export async function POST(request: NextRequest) {
  try {
    const organizer = await getOrganizer();
    
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    
    const { name, event_date, city, description } = await request.json();
    
    if (!name || !event_date || !city) {
      return NextResponse.json({ error: 'Name, date and city are required' }, { status: 400 });
    }
    
    const supabase = createAdminClient();
    
    // Generate unique slug
    const baseSlug = name
      .toLowerCase()
      .replace(/[åä]/g, 'a')
      .replace(/ö/g, 'o')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    // Check if slug exists and find unique one
    let slug = baseSlug;
    let suffix = 2;
    while (true) {
      const { data: existing } = await supabase
        .from('events')
        .select('id')
        .eq('slug', slug)
        .limit(1)
        .single();
      if (!existing) break;
      slug = `${baseSlug}-${suffix}`;
      suffix++;
    }
    
    // Create event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        name,
        slug,
        event_date,
        city,
        description,
        organizer_email: organizer.email, // For email notifications
      })
      .select()
      .single();
    
    if (eventError) {
      console.error('Event create error:', eventError);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }
    
    // Add organizer as founder
    const { error: linkError } = await supabase
      .from('event_organizers')
      .insert({
        event_id: event.id,
        organizer_id: organizer.id,
        role: 'founder',
        accepted_at: new Date().toISOString(), // Auto-accept for creator
      });
    
    if (linkError) {
      console.error('Link error:', linkError);
      // Rollback event creation
      await supabase.from('events').delete().eq('id', event.id);
      return NextResponse.json({ error: 'Failed to link organizer' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      event,
    });
    
  } catch (error) {
    console.error('Create event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/organizer/events
// List all events for current organizer

export async function GET() {
  try {
    const organizer = await getOrganizer();
    
    if (!organizer) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }
    
    const supabase = createAdminClient();
    
    const { data: eventLinks, error } = await supabase
      .from('event_organizers')
      .select(`
        event_id,
        role,
        event:events(*)
      `)
      .eq('organizer_id', organizer.id)
      .is('removed_at', null)
      .not('accepted_at', 'is', null);
    
    if (error) {
      console.error('Events fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }
    
    return NextResponse.json({ 
      events: eventLinks?.map(l => ({ ...l.event, role: l.role })) || [],
    });
    
  } catch (error) {
    console.error('List events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
