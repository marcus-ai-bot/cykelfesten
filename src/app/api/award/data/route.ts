/**
 * Award Data API
 * 
 * GET /api/award/data?eventSlug=xxx&token=yyy
 * 
 * Returns award data for a participant after validating their token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAccessFromParams } from '@/lib/tokens';
import { AWARDS, type Award } from '@/lib/awards/calculate';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const DEFAULT_ENABLED_AWARDS = [
  'longest_distance', 'shortest_distance', 'average_distance',
  'first_signup', 'last_signup',
  'furthest_from_center', 'closest_to_center',
  'most_fun_facts',
  'wildcard', 'social_butterfly', 'mystery_guest',
  'perfect_host', 'party_starter', 'night_owl',
];

interface AwardData {
  person_name: string;
  event_name: string;
  event_date: string;
  award: Award | null;
  value: string | null;
  explanation: string;
  thank_you_message: string | null;
  has_award: boolean;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const eventSlug = searchParams.get('eventSlug');
  
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
    // Get couple with event
    const { data: couple, error: coupleError } = await supabase
      .from('couples')
      .select('*, events(id, name, slug, event_date, enabled_awards, thank_you_message)')
      .eq('id', coupleId)
      .single();
    
    if (coupleError || !couple) {
      return NextResponse.json({ error: 'Couple not found' }, { status: 404 });
    }
    
    // Verify event slug
    if (couple.events.slug !== eventSlug) {
      return NextResponse.json({ error: 'Event mismatch' }, { status: 403 });
    }
    
    const event = couple.events;
    const enabledAwards: string[] = event.enabled_awards ?? DEFAULT_ENABLED_AWARDS;
    const thankYouMessage: string | null = event.thank_you_message || null;
    
    // Get person name
    const personName = personType === 'partner' 
      ? couple.partner_name 
      : couple.invited_name;
    
    // Get award assignment
    const { data: assignment } = await supabase
      .from('award_assignments')
      .select('*')
      .eq('couple_id', coupleId)
      .eq('person_type', personType)
      .maybeSingle();
    
    // No award or awards disabled
    if (!assignment || enabledAwards.length === 0) {
      return NextResponse.json({
        person_name: personName || 'Deltagare',
        event_name: event.name,
        event_date: event.event_date,
        award: null,
        value: null,
        explanation: '',
        thank_you_message: thankYouMessage,
        has_award: false,
      });
    }
    
    // Check if this award is enabled
    if (!enabledAwards.includes(assignment.award_id)) {
      return NextResponse.json({
        person_name: personName || 'Deltagare',
        event_name: event.name,
        event_date: event.event_date,
        award: null,
        value: null,
        explanation: '',
        thank_you_message: thankYouMessage,
        has_award: false,
      });
    }
    
    // Find award definition
    const award = AWARDS.find(a => a.id === assignment.award_id);
    
    if (!award) {
      return NextResponse.json({
        person_name: personName || 'Deltagare',
        event_name: event.name,
        event_date: event.event_date,
        award: null,
        value: null,
        explanation: '',
        thank_you_message: thankYouMessage,
        has_award: false,
      });
    }
    
    // Build personalized explanation
    const explanation = buildExplanation(award, assignment.value, personName || 'Du');
    
    const data: AwardData = {
      person_name: personName || 'Deltagare',
      event_name: event.name,
      event_date: event.event_date,
      award,
      value: assignment.value,
      explanation,
      thank_you_message: thankYouMessage,
      has_award: true,
    };
    
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Award data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildExplanation(award: Award, value: string | null, name: string): string {
  const explanations: Record<string, string> = {
    'longest_distance': `${name} cyklade längst av alla på kvällen${value ? ` — hela ${value}` : ''}! 🚴‍♂️`,
    'shortest_distance': `${name} hade kvällens kortaste cykelfärd${value ? ` — bara ${value}` : ''}. Ibland är närmsta vägen bäst! 🎯`,
    'average_distance': `${name} cyklade exakt lagom långt${value ? ` (${value})` : ''} — som en sann medelmåtta! ⚖️`,
    'first_signup': `${name} var först att anmäla sig. Engagemang belönas! 🥇`,
    'last_signup': `${name} var sist att anmäla sig. Bättre sent än aldrig! ⏰`,
    'oldest': `${name} är kvällens äldsta deltagare${value ? ` (${value})` : ''}. Visdom och erfarenhet! 🦉`,
    'youngest': `${name} är kvällens yngsta deltagare${value ? ` (${value})` : ''}. Framtiden är ljus! ✨`,
    'most_fun_facts': `${name} delade flest roliga fakta${value ? ` (${value})` : ''}. Underhållande! 🎭`,
    'wildcard': `${name} får kvällens wildcard-utmärkelse. Bara för att du är du! 🃏`,
    'social_butterfly': `${name} pratade med flest personer ikväll. Social fjäril! 🦋`,
    'mystery_guest': `${name} förblev lite mystisk hela kvällen. Intrigant! 🎭`,
    'perfect_host': `${name} var en fantastisk värd! Tack för maten! 🏠`,
    'party_starter': `${name} satte igång stämningen. Festfixare! 🎉`,
    'night_owl': `${name} stannade längst. Nattuggla! 🦉`,
  };
  
  return explanations[award.id] || `${name} får utmärkelsen "${award.title}"! ${award.emoji}`;
}
