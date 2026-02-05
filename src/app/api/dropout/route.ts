import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { runRematch, setEnvelopeTimes } from '@/lib/matching';
import type { Assignment, Couple, Event, Course } from '@/types/database';

/**
 * Dropout API
 * 
 * Handles participant dropouts:
 * 1. Marks couple as cancelled
 * 2. If host dropout: triggers re-match for affected guests
 * 3. If guest dropout: updates capacity/pairings
 */

export async function POST(request: Request) {
  try {
    const { couple_id, reason, is_host_dropout } = await request.json();
    
    if (!couple_id) {
      return NextResponse.json(
        { error: 'couple_id krävs' },
        { status: 400 }
      );
    }
    
    const supabase = createAdminClient();
    
    // Fetch couple and their event
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('*, events(*)')
      .eq('id', couple_id)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json(
        { error: 'Par hittades inte', details: coupleError?.message },
        { status: 404 }
      );
    }
    
    const event = couple.events as Event;
    
    // Check dropout window
    const eventDate = new Date(event.event_date);
    const eventTime = event.starter_time.split(':').map(Number);
    eventDate.setHours(eventTime[0], eventTime[1], 0, 0);
    
    const now = new Date();
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    
    const isUrgent = hoursUntilEvent < 24;
    const isEmergency = hoursUntilEvent < event.dropout_cutoff_hours;
    
    // Mark couple as cancelled
    const { error: updateError } = await supabase
      .from('couples')
      .update({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', couple_id);
    
    if (updateError) {
      return NextResponse.json(
        { error: 'Kunde inte registrera avhopp', details: updateError.message },
        { status: 500 }
      );
    }
    
    // Log the dropout
    await supabase.from('event_log').insert({
      event_id: event.id,
      action: is_host_dropout ? 'host_dropout' : 'guest_dropout',
      details: {
        couple_id,
        couple_name: `${couple.invited_name}${couple.partner_name ? ` & ${couple.partner_name}` : ''}`,
        reason,
        hours_until_event: Math.round(hoursUntilEvent),
        is_urgent: isUrgent,
        is_emergency: isEmergency,
      },
    });
    
    // Fetch assignment to determine if host or guest
    const { data: assignment } = await supabase
      .from('assignments')
      .select('*')
      .eq('couple_id', couple_id)
      .single();
    
    let rematchResult = null;
    let affectedGuests: string[] = [];
    
    // If this is a host dropout, we need to re-match their guests
    if (assignment && is_host_dropout) {
      // Fetch current active match plan
      const { data: matchPlan } = await supabase
        .from('match_plans')
        .select('*')
        .eq('id', event.active_match_plan_id)
        .single();
      
      if (matchPlan) {
        // Find guests affected by this host dropping out
        const { data: affectedPairings } = await supabase
          .from('course_pairings')
          .select('guest_couple_id')
          .eq('match_plan_id', matchPlan.id)
          .eq('host_couple_id', couple_id);
        
        affectedGuests = affectedPairings?.map(p => p.guest_couple_id) || [];
        
        // Fetch all active couples (excluding dropout)
        const { data: activeCouples } = await supabase
          .from('couples')
          .select('*')
          .eq('event_id', event.id)
          .eq('cancelled', false);
        
        // Fetch all assignments
        const { data: allAssignments } = await supabase
          .from('assignments')
          .select('*')
          .eq('event_id', event.id);
        
        // Fetch blocked pairs
        const { data: blockedPairs } = await supabase
          .from('blocked_pairs')
          .select('couple_a_id, couple_b_id')
          .eq('event_id', event.id);
        
        const blocked: [string, string][] = (blockedPairs || []).map(bp => [
          bp.couple_a_id,
          bp.couple_b_id,
        ]);
        
        // Determine frozen courses (envelopes already activated)
        const { data: activatedEnvelopes } = await supabase
          .from('envelopes')
          .select('course')
          .eq('match_plan_id', matchPlan.id)
          .not('activated_at', 'is', null);
        
        const frozenCourses = [...new Set(activatedEnvelopes?.map(e => e.course as Course) || [])];
        
        // Create new match plan version
        const newVersion = matchPlan.version + 1;
        
        const { data: newPlan, error: planError } = await supabase
          .from('match_plans')
          .insert({
            event_id: event.id,
            version: newVersion,
            status: 'draft',
            frozen_courses: frozenCourses,
          })
          .select()
          .single();
        
        if (!planError && newPlan) {
          // Run re-match
          rematchResult = runRematch({
            event,
            couples: activeCouples as Couple[],
            assignments: allAssignments as Assignment[],
            blocked_pairs: blocked,
            frozen_courses: frozenCourses,
            match_plan_id: newPlan.id,
          });
          
          // Save new pairings
          await supabase
            .from('course_pairings')
            .insert(rematchResult.course_pairings);
          
          // Save new envelopes
          const envelopesWithTimes = setEnvelopeTimes(
            rematchResult.envelopes,
            event
          );
          await supabase.from('envelopes').insert(envelopesWithTimes);
          
          // Update match plan stats
          await supabase
            .from('match_plans')
            .update({
              stats: rematchResult.stats,
            })
            .eq('id', newPlan.id);
          
          // Mark old plan as superseded
          await supabase
            .from('match_plans')
            .update({
              status: 'superseded',
              superseded_at: new Date().toISOString(),
              superseded_by: newPlan.id,
            })
            .eq('id', matchPlan.id);
          
          // Update event active match plan
          await supabase
            .from('events')
            .update({ active_match_plan_id: newPlan.id })
            .eq('id', event.id);
          
          // Log re-match
          await supabase.from('event_log').insert({
            event_id: event.id,
            match_plan_id: newPlan.id,
            action: 'rematch_completed',
            details: {
              trigger: 'host_dropout',
              dropout_couple_id: couple_id,
              affected_guests: affectedGuests.length,
              frozen_courses: frozenCourses,
              new_version: newVersion,
            },
          });
        }
      }
    }
    
    // Notify flex hosts if urgent dropout
    if (isUrgent && !isEmergency) {
      // TODO: Send notifications to flex hosts
      await supabase.from('event_log').insert({
        event_id: event.id,
        action: 'flex_hosts_notified',
        details: {
          dropout_couple_id: couple_id,
          hours_until_event: Math.round(hoursUntilEvent),
        },
      });
    }
    
    // Activate emergency hosts if emergency dropout
    if (isEmergency && is_host_dropout) {
      // TODO: Notify emergency hosts
      await supabase.from('event_log').insert({
        event_id: event.id,
        action: 'emergency_hosts_activated',
        details: {
          dropout_couple_id: couple_id,
          hours_until_event: Math.round(hoursUntilEvent),
        },
      });
    }
    
    return NextResponse.json({
      success: true,
      couple_id,
      is_host_dropout,
      is_urgent: isUrgent,
      is_emergency: isEmergency,
      affected_guests: affectedGuests.length,
      rematch_version: rematchResult ? 'new plan created' : null,
    });
    
  } catch (error) {
    console.error('Dropout error:', error);
    return NextResponse.json(
      { error: 'Avhoppsregistrering misslyckades', details: String(error) },
      { status: 500 }
    );
  }
}
