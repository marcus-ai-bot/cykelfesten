/**
 * Memories Data API
 * 
 * GET /api/memories/data?eventSlug=xxx&token=yyy
 * 
 * Returns memories page data after validating participant token.
 * Restricts personal stats to the authenticated couple only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getAccessFromParams } from '@/lib/tokens';

interface HostMessage {
  host_names: string;
  course: string;
  message: string;
}

interface Participant {
  name: string;
  instagram: string | null;
}

interface PersonalStats {
  couple_name: string;
  distance_cycled_km: number;
  people_met: number;
  courses_eaten: number;
}

interface MemoriesData {
  event_name: string;
  event_date: string;
  total_couples: number;
  total_distance_km: number;
  total_dishes: number;
  host_messages: HostMessage[];
  participants: Participant[];
  personal_stats: PersonalStats | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const eventSlug = searchParams.get('eventSlug');
  const supabase = createAdminClient();
  
  // Validate token
  const access = getAccessFromParams(searchParams);
  
  if (!eventSlug || !access) {
    return NextResponse.json(
      { error: 'Missing eventSlug or valid token' },
      { status: 400 }
    );
  }
  
  const { coupleId } = access;
  
  try {
    // 1. Get event by slug
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('slug', eventSlug)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    
    // 2. Verify couple belongs to this event
    const { data: authCouple } = await supabase
      .from('couples')
      .select('id, event_id')
      .eq('id', coupleId)
      .single();
    
    if (!authCouple || authCouple.event_id !== event.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    
    // 3. Get all confirmed couples
    const { data: couples } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name, instagram_handle, partner_instagram')
      .eq('event_id', event.id)
      .eq('confirmed', true);
    
    // 4. Get host recaps with couple info
    const { data: recaps } = await supabase
      .from('host_recaps')
      .select('generated_message, couples(invited_name, partner_name)')
      .in('couple_id', couples?.map(c => c.id) || []);
    
    // 5. Get envelopes for distance calculation
    const { data: envelopes } = await supabase
      .from('envelopes')
      .select('cycling_distance_km, couple_id')
      .eq('match_plan_id', event.active_match_plan_id);
    
    // Calculate totals
    const totalCouples = couples?.length || 0;
    const totalDistanceKm = Math.round(((envelopes?.reduce((sum, e) => sum + (e.cycling_distance_km || 0), 0) || 0) * 10)) / 10;
    
    // Build participants list
    const participants: Participant[] = [];
    for (const c of couples || []) {
      if (c.invited_name) {
        participants.push({ name: c.invited_name, instagram: c.instagram_handle });
      }
      if (c.partner_name) {
        participants.push({ name: c.partner_name, instagram: c.partner_instagram });
      }
    }
    
    // Build host messages
    const hostMessages: HostMessage[] = (recaps || [])
      .filter(r => r.generated_message)
      .map(r => ({
        host_names: `${(r.couples as any)?.invited_name || ''}${(r.couples as any)?.partner_name ? ` & ${(r.couples as any).partner_name}` : ''}`,
        course: 'Värd',
        message: r.generated_message,
      }));
    
    // Personal stats (only for the authenticated couple)
    let personalStats: PersonalStats | null = null;
    const couple = couples?.find(c => c.id === coupleId);
    
    if (couple) {
      const coupleEnvelopes = envelopes?.filter(e => e.couple_id === coupleId);
      const personalDistanceKm = coupleEnvelopes?.reduce((sum, e) => sum + (e.cycling_distance_km || 0), 0) || 0;
      
      personalStats = {
        couple_name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
        distance_cycled_km: Math.round(personalDistanceKm * 10) / 10,
        people_met: Math.max(0, (totalCouples - 1) * 2),
        courses_eaten: 3,
      };
    }
    
    const data: MemoriesData = {
      event_name: event.name,
      event_date: event.event_date,
      total_couples: totalCouples,
      total_distance_km: totalDistanceKm,
      total_dishes: totalCouples * 3,
      host_messages: hostMessages,
      participants,
      personal_stats: personalStats,
    };
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Memories data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
