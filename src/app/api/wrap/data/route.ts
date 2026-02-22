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
import { getMusicDecade } from '@/lib/fun-facts';

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
  fun_facts_count: number;
  last_guest_departure: string | null;
  unique_streets: number;
  busiest_street: { name: string; couples: number } | null;
  top_meal_street: { name: string; servings: number } | null;
  event_radius_km: number;
  event_radius_pair: string[];
  event_area_km2: number;
  neighbor_pairs: Array<{ a: string; b: string; street: string }>;
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
      .select('couple_id, course, host_couple_id, cycling_distance_km')
      .eq('match_plan_id', event.active_match_plan_id);
    
    const envelopeDistanceByCouple = new Map<string, number>();
    for (const env of envelopes ?? []) {
      const current = envelopeDistanceByCouple.get(env.couple_id) || 0;
      envelopeDistanceByCouple.set(env.couple_id, current + (env.cycling_distance_km || 0));
    }

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
    
    // Calculate individual distance from wrap_stats routes (Mapbox cycling)
    // This is the FULL route: home → starter → main → dessert → afterparty → home
    // Both people in a couple cycle the same distance, so no dividing by 2
    const routes = Array.isArray(wrapStats?.routes) ? wrapStats.routes : [];
    const coupleRoute = routes.find((r: any) => r.couple_id === coupleId);
    const envelopeDistanceKm = envelopeDistanceByCouple.get(coupleId) || 0;
    const individualDistanceKm = coupleRoute?.totalKm ?? envelopeDistanceKm;
    const hasPartner = !!couple.partner_name;
    
    // Total event distance from wrap_stats (fallback to envelope totals)
    const envelopeTotalKm = Array.from(envelopeDistanceByCouple.values()).reduce((sum, km) => sum + km, 0);
    const totalDistanceKm = wrapStats?.total_distance_km ?? envelopeTotalKm;
    const distancePercent = totalDistanceKm > 0 
      ? Math.round((individualDistanceKm / totalDistanceKm) * 100 * 10) / 10
      : 0;
    
    // Count people met: tablemates per course (exclude self), estimate people per couple
    const coupleEnvelopes = envelopes?.filter(e => e.couple_id === coupleId) ?? [];
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
    
    // Check if longest rider (from wrap_stats routes)
    const isLongestRider = routes.length > 0
      ? coupleRoute?.totalKm === Math.max(...routes.map((r: any) => r.totalKm ?? 0))
      : envelopeDistanceKm > 0 && envelopeDistanceKm === Math.max(...Array.from(envelopeDistanceByCouple.values()));
    
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
        fun_facts_count: wrapStats.fun_facts_count ?? 0,
        last_guest_departure: wrapStats.last_guest_departure ?? null,
        unique_streets: wrapStats.unique_streets ?? 0,
        busiest_street: wrapStats.busiest_street ?? null,
        top_meal_street: wrapStats.top_meal_street ?? null,
        event_radius_km: wrapStats.event_radius_km ?? 0,
        event_radius_pair: wrapStats.event_radius_pair ?? [],
        event_area_km2: wrapStats.event_area_km2 ?? 0,
        neighbor_pairs: wrapStats.neighbor_pairs ?? [],
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

// getMusicDecade is now imported from @/lib/fun-facts
