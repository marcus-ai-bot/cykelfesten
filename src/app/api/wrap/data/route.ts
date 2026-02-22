/**
 * Wrap Data API
 * 
 * GET /api/wrap/data?eventSlug=xxx&token=yyy
 * 
 * Returns wrap data for a participant after validating their token.
 * This is the secure replacement for client-side Supabase queries.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccessFromParams } from '@/lib/tokens';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface WrapStats {
  total_distance_km: number;
  total_couples: number;
  total_people: number;
  total_portions: number;
  shortest_ride_meters: number;
  shortest_ride_couple: string;
  longest_ride_meters: number;
  longest_ride_couple: string;
  districts_count: number;
  fun_facts_count: number;
  last_guest_departure: string | null;
}

interface WrapData {
  person_name: string;
  event_name: string;
  event_date: string;
  distance_km: number;
  distance_percent: number;
  people_met: number;
  music_decade: string;
  wrap_stats: WrapStats | null;
  has_award: boolean;
  is_longest_rider: boolean;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const eventSlug = searchParams.get('eventSlug');
  
  // Validate token
  const access = getAccessFromParams(searchParams);
  
  if (!eventSlug || !access) {
    return NextResponse.json(
      { error: 'Missing eventSlug or valid token' },
      { status: 400 }
    );
  }
  
  const { coupleId, personType } = access;
  const supabase = getSupabase();
  
  try {
    // 1. Get couple and event data
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select(`
        *,
        invited_fun_facts,
        partner_fun_facts,
        events(*)
      `)
      .eq('id', coupleId)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
    }
    
    // Verify event slug matches
    if (couple.events.slug !== eventSlug) {
      return NextResponse.json({ error: 'Event mismatch' }, { status: 403 });
    }
    
    const event = couple.events;
    
    // 2. Get envelopes for distance calculation
    const { data: envelopes } = await supabase
      .from('envelopes')
      .select('couple_id, course, host_couple_id, cycling_minutes')
      .eq('match_plan_id', event.active_match_plan_id);
    
    // 3. Get all couples for statistics
    const { data: allCouples } = await supabase
      .from('couples')
      .select('id, invited_name, partner_name')
      .eq('event_id', event.id)
      .eq('confirmed', true);
    
    // 4. Get wrap_stats from events table (stored as JSON column)
    const wrapStats = event.wrap_stats as Record<string, any> | null;
    
    // 5. Check if person has an award
    const { data: award } = await supabase
      .from('award_assignments')
      .select('award_id')
      .eq('couple_id', coupleId)
      .eq('person_type', personType)
      .maybeSingle();
    
    // Calculate person-specific data
    const personName = personType === 'partner' ? couple.partner_name : couple.invited_name;
    const personFunFacts = personType === 'partner' 
      ? couple.partner_fun_facts 
      : couple.invited_fun_facts;
    
    // Calculate individual distance
    const coupleEnvelopes = envelopes?.filter(e => e.couple_id === coupleId) ?? [];
    const coupleMinutes = coupleEnvelopes.reduce(
      (sum, e) => sum + Math.min(e.cycling_minutes ?? 0, 60),
      0
    );
    const hasPartner = !!couple.partner_name;
    const individualDistanceKm = Math.round((coupleMinutes * 0.25 / (hasPartner ? 2 : 1)) * 10) / 10;
    
    // Calculate total event distance
    const totalMinutes = envelopes?.reduce(
      (sum, e) => sum + Math.min(e.cycling_minutes ?? 0, 60),
      0
    ) ?? 0;
    const totalDistanceKm = Math.round(totalMinutes * 0.25 * 10) / 10;
    const distancePercent = totalDistanceKm > 0 
      ? Math.round((individualDistanceKm / totalDistanceKm) * 100 * 10) / 10
      : 0;
    
    // Count people met: tablemates per course (exclude self), estimate people per couple
    let couplesMet = 0;
    for (const env of coupleEnvelopes) {
      if (!env.host_couple_id) continue;
      const tablemates = (envelopes ?? [])
        .filter(e => e.course === env.course && e.host_couple_id === env.host_couple_id)
        .map(e => e.couple_id);
      const uniqueCouples = new Set(tablemates);
      uniqueCouples.delete(coupleId);
      couplesMet += uniqueCouples.size;
    }
    const peopleMet = Math.round(couplesMet * 1.9);
    
    // Determine music decade from fun facts
    const musicDecade = getMusicDecade(personFunFacts);
    
    // Check if longest rider
    const allDistances = new Map<string, number>();
    for (const e of envelopes ?? []) {
      const current = allDistances.get(e.couple_id) || 0;
      allDistances.set(e.couple_id, current + Math.min(e.cycling_minutes ?? 0, 60));
    }
    const maxDistance = Math.max(...Array.from(allDistances.values()));
    const isLongestRider = allDistances.get(coupleId) === maxDistance;
    
    // Build response
    const data: WrapData = {
      person_name: personName || 'Deltagare',
      event_name: event.name,
      event_date: event.event_date,
      distance_km: individualDistanceKm,
      distance_percent: distancePercent,
      people_met: peopleMet,
      music_decade: musicDecade,
      wrap_stats: wrapStats ? {
        total_distance_km: wrapStats.total_distance_km ?? totalDistanceKm,
        total_couples: wrapStats.total_couples ?? allCouples?.length ?? 0,
        total_people: wrapStats.total_people ?? Math.round((allCouples?.length ?? 0) * 1.8),
        total_portions: wrapStats.total_portions ?? (allCouples?.length ?? 0) * 3,
        shortest_ride_meters: Math.round((wrapStats.shortest_ride_km ?? 0) * 1000),
        shortest_ride_couple: wrapStats.shortest_ride_couple ?? '',
        longest_ride_meters: Math.round((wrapStats.longest_ride_km ?? 0) * 1000),
        longest_ride_couple: wrapStats.longest_ride_couple ?? '',
        districts_count: wrapStats.districts_count ?? 1,
        fun_facts_count: wrapStats.fun_facts_count ?? 0,
        last_guest_departure: wrapStats.last_guest_departure ?? null,
      } : null,
      has_award: !!award,
      is_longest_rider: isLongestRider,
    };
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Wrap data error:', error instanceof Error ? error.message : error);
    console.error('Stack:', error instanceof Error ? error.stack : 'no stack');
    return NextResponse.json({ 
      error: 'Internal server error',
      detail: process.env.NODE_ENV === 'development' ? String(error) : undefined 
    }, { status: 500 });
  }
}

function getMusicDecade(funFacts: string[] | null): string {
  if (!funFacts || funFacts.length === 0) return 'default';
  
  const decadeKeywords: Record<string, string[]> = {
    '80s': ['80-tal', '80s', 'eighties', '1980'],
    '90s': ['90-tal', '90s', 'nineties', '1990'],
    '2000s': ['2000-tal', '2000s', 'nollnoll', '00-tal'],
    '2010s': ['2010-tal', '2010s', 'tio-tal'],
    '2020s': ['2020-tal', '2020s', 'tjugo-tal', 'nu', 'modern'],
  };
  
  const allFacts = funFacts.join(' ').toLowerCase();
  
  for (const [decade, keywords] of Object.entries(decadeKeywords)) {
    if (keywords.some(kw => allFacts.includes(kw))) {
      return decade;
    }
  }
  
  return 'default';
}
