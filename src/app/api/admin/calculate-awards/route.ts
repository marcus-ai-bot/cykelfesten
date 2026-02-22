import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AWARDS } from '@/lib/awards/calculate';
import { requireEventAccess } from '@/lib/auth';
import { countFunFacts } from '@/lib/fun-facts';

// Default enabled awards (non-sensitive)
const DEFAULT_ENABLED_AWARDS = [
  'longest_distance', 'shortest_distance', 'average_distance',
  'first_signup', 'last_signup',
  'furthest_from_center', 'closest_to_center',
  'most_fun_facts',
  'wildcard', 'social_butterfly', 'mystery_guest',
  'perfect_host', 'party_starter', 'night_owl',
];

interface Person {
  couple_id: string;
  person_type: 'invited' | 'partner';
  name: string;
  birth_year: number | null;
  fun_facts_count: number;
  distance_km: number;
  registered_at: string;
  allergies_count: number;
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
    
    // Use service role for admin operations
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Get event settings
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, enabled_awards, active_match_plan_id')
      .eq('id', eventId)
      .single();
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    
    // Get enabled awards (null = defaults)
    const enabledAwards: string[] = event.enabled_awards ?? DEFAULT_ENABLED_AWARDS;
    
    // Edge case: No awards enabled
    if (enabledAwards.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No awards enabled',
        assignments: [] 
      });
    }
    
    // Get all couples with their data
    const { data: couples, error: couplesError } = await supabase
      .from('couples')
      .select(`
        id,
        invited_name,
        partner_name,
        invited_birth_year,
        partner_birth_year,
        invited_fun_facts,
        partner_fun_facts,
        invited_allergies,
        partner_allergies,
        created_at
      `)
      .eq('event_id', eventId)
      .eq('confirmed', true);
    
    if (couplesError) {
      return NextResponse.json({ error: 'Failed to fetch couples' }, { status: 500 });
    }
    
    // Edge case: No couples
    if (!couples || couples.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No confirmed couples',
        assignments: [] 
      });
    }
    
    // Get envelope data for distances
    const coupleIds = couples.map(c => c.id);
    const { data: envelopes } = await supabase
      .from('envelopes')
      .select('couple_id, cycling_distance_km')
      .in('couple_id', coupleIds)
      .eq('match_plan_id', event.active_match_plan_id);
    
    // Calculate distance per couple
    const distanceByCouple = new Map<string, number>();
    envelopes?.forEach(e => {
      const current = distanceByCouple.get(e.couple_id) || 0;
      const distanceKm = e.cycling_distance_km ?? 0;
      distanceByCouple.set(e.couple_id, current + distanceKm);
    });
    
    // Build person list (invited + partners separately)
    const persons: Person[] = [];
    
    for (const couple of couples) {
      const coupleDistance = distanceByCouple.get(couple.id) || 0;
      // Both persons in a couple cycle the SAME distance (they ride together)
      const personDistance = coupleDistance;
      
      // Invited person
      persons.push({
        couple_id: couple.id,
        person_type: 'invited',
        name: couple.invited_name,
        birth_year: couple.invited_birth_year,
        fun_facts_count: countFunFacts(couple.invited_fun_facts),
        distance_km: Math.round(personDistance * 10) / 10,
        registered_at: couple.created_at,
        allergies_count: (couple.invited_allergies as string[] | null)?.length || 0,
      });
      
      // Partner (if exists)
      if (couple.partner_name) {
        persons.push({
          couple_id: couple.id,
          person_type: 'partner',
          name: couple.partner_name,
          birth_year: couple.partner_birth_year,
          fun_facts_count: countFunFacts(couple.partner_fun_facts),
          distance_km: Math.round(personDistance * 10) / 10,
          registered_at: couple.created_at,
          allergies_count: (couple.partner_allergies as string[] | null)?.length || 0,
        });
      }
    }
    
    // Calculate awards
    const assignments: Array<{
      couple_id: string;
      person_type: string;
      award_id: string;
      value: string | null;
    }> = [];
    
    const assignedPersons = new Set<string>(); // "coupleId:personType"
    const assignedAwards = new Set<string>();
    
    // Awards based on shared couple data (same route, same address) → both get it
    const COUPLE_AWARDS = new Set([
      'longest_distance', 'shortest_distance', 'average_distance',
      'furthest_from_center', 'closest_to_center',
      'perfect_host',
    ]);
    
    function tryAssign(person: Person, awardId: string, value: string | null): boolean {
      const personKey = `${person.couple_id}:${person.person_type}`;
      
      // Skip if person already has award or award already given
      if (assignedPersons.has(personKey)) return false;
      if (assignedAwards.has(awardId)) return false;
      if (!enabledAwards.includes(awardId)) return false;
      
      assignments.push({
        couple_id: person.couple_id,
        person_type: person.person_type,
        award_id: awardId,
        value,
      });
      assignedPersons.add(personKey);
      
      // For couple-shared awards: also assign to partner if they exist
      if (COUPLE_AWARDS.has(awardId)) {
        const otherType = person.person_type === 'invited' ? 'partner' : 'invited';
        const partner = persons.find(p => p.couple_id === person.couple_id && p.person_type === otherType);
        const partnerKey = `${person.couple_id}:${otherType}`;
        if (partner && !assignedPersons.has(partnerKey)) {
          assignments.push({
            couple_id: partner.couple_id,
            person_type: partner.person_type,
            award_id: awardId,
            value,
          });
          assignedPersons.add(partnerKey);
        }
      }
      
      assignedAwards.add(awardId);
      return true;
    }
    
    // Sort helpers
    const byDistance = [...persons].sort((a, b) => b.distance_km - a.distance_km);
    const byAge = [...persons]
      .filter(p => p.birth_year)
      .sort((a, b) => (a.birth_year || 9999) - (b.birth_year || 9999));
    const byRegistration = [...persons].sort((a, b) => 
      new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()
    );
    const byFunFacts = [...persons].sort((a, b) => b.fun_facts_count - a.fun_facts_count);
    const byAllergies = [...persons].sort((a, b) => b.allergies_count - a.allergies_count);
    
    // 1. Longest distance
    if (byDistance.length > 0) {
      const winner = byDistance[0];
      tryAssign(winner, 'longest_distance', `${winner.distance_km} km`);
    }
    
    // 2. Shortest distance
    if (byDistance.length > 1) {
      const winner = byDistance[byDistance.length - 1];
      tryAssign(winner, 'shortest_distance', `${winner.distance_km} km`);
    }
    
    // 3. Average distance
    if (byDistance.length > 2) {
      const avgDistance = persons.reduce((sum, p) => sum + p.distance_km, 0) / persons.length;
      const closest = [...persons].sort((a, b) => 
        Math.abs(a.distance_km - avgDistance) - Math.abs(b.distance_km - avgDistance)
      )[0];
      tryAssign(closest, 'average_distance', `${closest.distance_km} km`);
    }
    
    // 4. Oldest
    if (byAge.length > 0) {
      const winner = byAge[0];
      const age = 2026 - (winner.birth_year || 2000);
      tryAssign(winner, 'oldest', `${age} år`);
    }
    
    // 5. Youngest
    if (byAge.length > 1) {
      const winner = byAge[byAge.length - 1];
      const age = 2026 - (winner.birth_year || 2000);
      tryAssign(winner, 'youngest', `${age} år`);
    }
    
    // 6. Average age
    if (byAge.length > 2) {
      const avgYear = byAge.reduce((sum, p) => sum + (p.birth_year || 0), 0) / byAge.length;
      const closest = [...byAge].sort((a, b) => 
        Math.abs((a.birth_year || 0) - avgYear) - Math.abs((b.birth_year || 0) - avgYear)
      )[0];
      const age = 2026 - (closest.birth_year || 2000);
      tryAssign(closest, 'average_age', `${age} år`);
    }
    
    // 7. First signup
    if (byRegistration.length > 0) {
      tryAssign(byRegistration[0], 'first_signup', null);
    }
    
    // 8. Last signup
    if (byRegistration.length > 1) {
      tryAssign(byRegistration[byRegistration.length - 1], 'last_signup', null);
    }
    
    // 9. Most fun facts
    if (byFunFacts.length > 0 && byFunFacts[0].fun_facts_count > 0) {
      const winner = byFunFacts[0];
      tryAssign(winner, 'most_fun_facts', `${winner.fun_facts_count} fakta`);
    }
    
    // 10. Least fun facts (mystery)
    if (byFunFacts.length > 1) {
      const winner = byFunFacts[byFunFacts.length - 1];
      tryAssign(winner, 'least_fun_facts', null);
    }
    
    // 11. Only vegetarian - SKIPPED (no dietary column in database)
    // Would need to add dietary preferences to couples table
    
    // 12. Most allergies
    if (byAllergies.length > 0 && byAllergies[0].allergies_count > 0) {
      tryAssign(byAllergies[0], 'most_allergies', `${byAllergies[0].allergies_count} allergier`);
    }
    
    // Fill remaining with random awards
    const remainingAwards = AWARDS
      .filter(a => enabledAwards.includes(a.id) && !assignedAwards.has(a.id))
      .map(a => a.id);
    
    const remainingPersons = persons.filter(p => 
      !assignedPersons.has(`${p.couple_id}:${p.person_type}`)
    );
    
    // Shuffle for fairness
    const shuffledPersons = remainingPersons.sort(() => Math.random() - 0.5);
    const shuffledAwards = remainingAwards.sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffledPersons.length && i < shuffledAwards.length; i++) {
      tryAssign(shuffledPersons[i], shuffledAwards[i], null);
    }
    
    // Delete existing assignments for this event
    await supabase
      .from('award_assignments')
      .delete()
      .in('couple_id', coupleIds);
    
    // Insert new assignments
    if (assignments.length > 0) {
      const { error: insertError } = await supabase
        .from('award_assignments')
        .insert(assignments.map(a => ({
          couple_id: a.couple_id,
          person_type: a.person_type,
          award_id: a.award_id,
          value: a.value,
          assigned_at: new Date().toISOString(),
        })));
      
      if (insertError) {
        return NextResponse.json({ error: 'Failed to save assignments: ' + insertError.message }, { status: 500 });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `${assignments.length} awards assigned to ${persons.length} persons`,
      assignments: assignments.map(a => ({
        ...a,
        name: persons.find(p => p.couple_id === a.couple_id && p.person_type === a.person_type)?.name,
        award_title: AWARDS.find(aw => aw.id === a.award_id)?.title,
      })),
    });
    
  } catch (error) {
    console.error('Calculate awards error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
