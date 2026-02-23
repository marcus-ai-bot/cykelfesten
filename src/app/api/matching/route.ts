import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runFullMatch, setEnvelopeTimes } from '@/lib/matching';
import { populateLivingEnvelopeData } from '@/lib/envelope';
import { requireEventAccess } from '@/lib/auth';
import type { Couple, Event, Assignment, EventTiming } from '@/types/database';

type CoordPair = [number, number];

function parsePoint(point: unknown): CoordPair | null {
  if (!point) return null;
  if (typeof point === 'string') {
    const match = point.match(/\(([^,]+),([^)]+)\)/);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
  }
  if (typeof point === 'object' && point !== null) {
    const p = point as Record<string, number>;
    if (p.lng != null && p.lat != null) return [p.lng, p.lat];
    if (p.x != null && p.y != null) return [p.x, p.y];
  }
  return null;
}

async function getCyclingDistanceKm(fromCoords: CoordPair, toCoords: CoordPair): Promise<number | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?overview=false&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.routes?.[0]?.distance ? Math.round(data.routes[0].distance / 10) / 100 : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { event_id } = await request.json();
    
    if (!event_id) {
      return NextResponse.json(
        { error: 'event_id krävs' },
        { status: 400 }
      );
    }
    
    // Auth: Require organizer access to this event
    const auth = await requireEventAccess(event_id);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    
    const supabase = createAdminClient();
    
    // Fetch event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', event_id)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event hittades inte', details: eventError?.message },
        { status: 404 }
      );
    }
    
    // Fetch couples
    const { data: couples, error: couplesError } = await supabase
      .from('couples')
      .select('*')
      .eq('event_id', event_id)
      .eq('cancelled', false);
    
    if (couplesError) {
      return NextResponse.json(
        { error: 'Kunde inte hämta par', details: couplesError.message },
        { status: 500 }
      );
    }
    
    if (!couples || couples.length < 3) {
      return NextResponse.json(
        { error: 'Minst 3 par krävs för matchning' },
        { status: 400 }
      );
    }
    
    // Fetch blocked pairs
    const { data: blockedPairs } = await supabase
      .from('blocked_pairs')
      .select('couple_a_id, couple_b_id')
      .eq('event_id', event_id);
    
    const blocked: [string, string][] = (blockedPairs || []).map(bp => [
      bp.couple_a_id,
      bp.couple_b_id,
    ]);
    
    // Create new match plan
    const { data: existingPlans } = await supabase
      .from('match_plans')
      .select('version')
      .eq('event_id', event_id)
      .order('version', { ascending: false })
      .limit(1);
    
    const newVersion = (existingPlans?.[0]?.version || 0) + 1;
    
    const { data: matchPlan, error: planError } = await supabase
      .from('match_plans')
      .insert({
        event_id,
        version: newVersion,
        status: 'draft',
      })
      .select()
      .single();
    
    if (planError || !matchPlan) {
      return NextResponse.json(
        { error: 'Kunde inte skapa match plan', details: planError?.message },
        { status: 500 }
      );
    }
    
    // Check if assignments already exist for this event
    const { data: existingAssignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('event_id', event_id);
    
    let matchResult;
    
    if (existingAssignments && existingAssignments.length > 0) {
      // Re-match: Use existing assignments, only run Step B
      const { assignCourses } = await import('@/lib/matching');
      const { matchGuestsToHosts } = await import('@/lib/matching');
      
      // Create a "fake" Step A result from existing assignments
      const stepA = {
        assignments: existingAssignments.map(a => ({
          event_id: a.event_id,
          couple_id: a.couple_id,
          course: a.course,
          is_host: a.is_host,
          max_guests: a.max_guests,
          is_flex_host: a.is_flex_host,
          flex_extra_capacity: a.flex_extra_capacity,
          is_emergency_host: a.is_emergency_host,
        })),
        stats: {
          preference_satisfaction: 1,
          capacity_per_course: { starter: 0, main: 0, dessert: 0 },
        },
      };
      
      // Run Step B with existing assignments
      const stepB = matchGuestsToHosts({
        event_id,
        match_plan_id: matchPlan.id,
        assignments: existingAssignments as Assignment[],
        couples: couples as Couple[],
        blocked_pairs: blocked,
        frozen_courses: [],
      });
      
      matchResult = { stepA, stepB, warnings: stepB.warnings };
    } else {
      // First match: Run full matching (Step A + B)
      matchResult = runFullMatch({
        event: event as Event,
        couples: couples as Couple[],
        blocked_pairs: blocked,
        match_plan_id: matchPlan.id,
      });
      
      // Save assignments (Step A)
      const { error: assignError } = await supabase
        .from('assignments')
        .insert(matchResult.stepA.assignments);
      
      if (assignError) {
        console.error('Assignment error:', assignError);
      }
    }
    
    const pairingsForDb = matchResult.stepB.course_pairings.map(({ forced, ...rest }) => rest);

    // Save course pairings (Step B)
    const { error: pairError } = await supabase
      .from('course_pairings')
      .insert(pairingsForDb);
    
    if (pairError) {
      console.error('Pairing error:', pairError);
    }
    
    // Save envelopes with proper times
    const envelopesWithTimes = setEnvelopeTimes(
      matchResult.stepB.envelopes,
      event as Event
    );
    
    const { error: envError } = await supabase
      .from('envelopes')
      .insert(envelopesWithTimes);
    
    if (envError) {
      console.error('Envelope error:', envError);
    }
    
    // === LIVING ENVELOPE: Populate clues, street info, and timing ===
    
    // Fetch event timing (or use defaults)
    const { data: eventTiming } = await supabase
      .from('event_timing')
      .select('*')
      .eq('event_id', event_id)
      .single();
    
    // Populate living envelope data
    const populateResult = populateLivingEnvelopeData({
      event: event as Event,
      couples: couples as Couple[],
      pairings: pairingsForDb,
      envelopes: matchResult.stepB.envelopes,
      timing: eventTiming as EventTiming | undefined,
      // cyclingDistances could be fetched from OpenRouteService here
    });
    
    // Save course_clues
    if (populateResult.courseClues.length > 0) {
      const { error: cluesError } = await supabase
        .from('course_clues')
        .upsert(populateResult.courseClues, { 
          onConflict: 'couple_id,course_type' 
        });
      
      if (cluesError) {
        console.error('Course clues error:', cluesError);
      }
    }
    
    // Save street_info
    if (populateResult.streetInfos.length > 0) {
      const { error: streetError } = await supabase
        .from('street_info')
        .upsert(populateResult.streetInfos, { 
          onConflict: 'couple_id' 
        });
      
      if (streetError) {
        console.error('Street info error:', streetError);
      }
    }
    
    // Update envelopes with living envelope times
    for (const update of populateResult.envelopeUpdates) {
      const { error: updateError } = await supabase
        .from('envelopes')
        .update({
          teasing_at: update.teasing_at,
          clue_1_at: update.clue_1_at,
          clue_2_at: update.clue_2_at,
          street_at: update.street_at,
          number_at: update.number_at,
          opened_at: update.opened_at,
          cycling_minutes: update.cycling_minutes,
          current_state: 'LOCKED',
        })
        .eq('match_plan_id', matchPlan.id)
        .eq('couple_id', update.couple_id)
        .eq('course', update.course);
      
      if (updateError) {
        console.error('Envelope update error:', updateError);
      }
    }

    // Calculate and persist cycling distances per envelope
    const coupleCoords = new Map<string, CoordPair>();
    for (const couple of couples as Couple[]) {
      const coords = parsePoint(couple.coordinates);
      if (coords) coupleCoords.set(couple.id, coords);
    }

    const distanceBatch = 10;
    for (let i = 0; i < envelopesWithTimes.length; i += distanceBatch) {
      const batch = envelopesWithTimes.slice(i, i + distanceBatch);
      const distances = await Promise.all(
        batch.map(async env => {
          if (!env.host_couple_id) return { env, distanceKm: null };
          if (env.couple_id === env.host_couple_id) return { env, distanceKm: 0 };
          const from = coupleCoords.get(env.couple_id);
          const to = coupleCoords.get(env.host_couple_id);
          if (!from || !to) return { env, distanceKm: null };
          const distanceKm = await getCyclingDistanceKm(from, to);
          return { env, distanceKm };
        })
      );

      await Promise.all(
        distances.map(({ env, distanceKm }) =>
          supabase
            .from('envelopes')
            .update({ cycling_distance_km: distanceKm })
            .eq('match_plan_id', matchPlan.id)
            .eq('couple_id', env.couple_id)
            .eq('course', env.course)
        )
      );
    }
    
    // Update match plan stats
    await supabase
      .from('match_plans')
      .update({
        stats: {
          couples_matched: matchResult.stepB.stats.couples_matched,
          preference_satisfaction: matchResult.stepA.stats.preference_satisfaction,
          capacity_utilization: matchResult.stepB.stats.capacity_utilization,
          forced_assignments: matchResult.stepB.stats.forced_assignments,
        },
      })
      .eq('id', matchPlan.id);
    
    // Set this as the active match plan + auto-lock invite phase
    await supabase
      .from('events')
      .update({
        active_match_plan_id: matchPlan.id,
        status: 'matched',
      })
      .eq('id', event_id);

    // Log event
    await supabase.from('event_log').insert({
      event_id,
      match_plan_id: matchPlan.id,
      action: 'match_plan_created',
      details: {
        version: newVersion,
        couples_count: couples.length,
        warnings: matchResult.warnings,
      },
    });
    
    return NextResponse.json({
      success: true,
      match_plan_id: matchPlan.id,
      version: newVersion,
      stats: {
        couples_matched: matchResult.stepB.stats.couples_matched,
        preference_satisfaction: matchResult.stepA.stats.preference_satisfaction,
        capacity_utilization: matchResult.stepB.stats.capacity_utilization,
        forced_assignments: matchResult.stepB.stats.forced_assignments,
        pairings_created: matchResult.stepB.course_pairings.length,
        envelopes_created: envelopesWithTimes.length,
        // Living Envelope stats
        clues_allocated: populateResult.courseClues.length,
        street_infos_created: populateResult.streetInfos.length,
      },
      warnings: matchResult.warnings,
    });
    
  } catch (error) {
    console.error('Matching error:', error);
    return NextResponse.json(
      { error: 'Matchning misslyckades', details: String(error) },
      { status: 500 }
    );
  }
}
