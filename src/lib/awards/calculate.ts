/**
 * Award Calculation System
 * 
 * Calculates awards for all participants.
 * Each person gets exactly ONE award (most unique first).
 */

export interface Participant {
  couple_id: string;
  names: string;
  invited_birth_year: number | null;
  partner_birth_year: number | null;
  distance_km: number;
  fun_facts_count: number;
  allergies_count: number;
  is_vegetarian: boolean;
  registered_at: string;
  address_distance_from_center: number; // km from city center
}

export interface Award {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  color_from: string;
  color_to: string;
}

export const AWARDS: Award[] = [
  // Distance
  { id: 'longest_distance', emoji: '🚴', title: 'Maratonisten', subtitle: 'Du cyklade längst av alla!', color_from: 'from-blue-500', color_to: 'to-cyan-400' },
  { id: 'shortest_distance', emoji: '⚡', title: 'Turisten', subtitle: 'Kortaste sträckan — du hade tur!', color_from: 'from-yellow-400', color_to: 'to-orange-500' },
  { id: 'average_distance', emoji: '📏', title: 'Guldlocken', subtitle: 'Lagom är bäst — exakt medel!', color_from: 'from-emerald-400', color_to: 'to-teal-500' },
  
  // Age
  { id: 'oldest', emoji: '👑', title: 'Veteranen', subtitle: 'Mest erfaren på festen!', color_from: 'from-amber-500', color_to: 'to-yellow-400' },
  { id: 'youngest', emoji: '⭐', title: 'Rookie', subtitle: 'Yngst och fräschast!', color_from: 'from-pink-500', color_to: 'to-rose-400' },
  { id: 'average_age', emoji: '📊', title: 'Statistikern', subtitle: 'Exakt medelålder — du ÄR normen!', color_from: 'from-indigo-500', color_to: 'to-purple-500' },
  
  // Registration
  { id: 'first_signup', emoji: '🏃', title: 'Entusiasten', subtitle: 'Först att anmäla sig!', color_from: 'from-green-500', color_to: 'to-emerald-400' },
  { id: 'last_signup', emoji: '😎', title: 'Fashionably Late', subtitle: 'Sist in — men med stil!', color_from: 'from-violet-500', color_to: 'to-purple-400' },
  
  // Geography
  { id: 'furthest_from_center', emoji: '🗺️', title: 'Äventyraren', subtitle: 'Du reste längst för att vara med!', color_from: 'from-orange-500', color_to: 'to-red-500' },
  { id: 'closest_to_center', emoji: '🎯', title: 'Centransen', subtitle: 'Närmast centrum — bekvämt!', color_from: 'from-cyan-500', color_to: 'to-blue-500' },
  
  // Personality
  { id: 'most_fun_facts', emoji: '📝', title: 'Berättaren', subtitle: 'Flest fun facts — delningsglad!', color_from: 'from-fuchsia-500', color_to: 'to-pink-500' },
  { id: 'least_fun_facts', emoji: '🎭', title: 'Mystikern', subtitle: 'Minst fakta — mest mystisk!', color_from: 'from-slate-600', color_to: 'to-gray-500' },
  
  // Diet
  { id: 'only_vegetarian', emoji: '🌿', title: 'Gröna Hjälten', subtitle: 'Enda vegetarianen — trendsättare!', color_from: 'from-lime-500', color_to: 'to-green-500' },
  { id: 'most_allergies', emoji: '🦸', title: 'Överlevaren', subtitle: 'Flest allergier — men du fixade det!', color_from: 'from-red-500', color_to: 'to-orange-500' },
  
  // Random/social
  { id: 'wildcard', emoji: '🎲', title: 'Wildcard', subtitle: 'Slumpen valde dig — grattis!', color_from: 'from-purple-500', color_to: 'to-indigo-500' },
  { id: 'social_butterfly', emoji: '🦋', title: 'Social Butterfly', subtitle: 'Du pratade med alla!', color_from: 'from-sky-400', color_to: 'to-indigo-400' },
  { id: 'mystery_guest', emoji: '🕵️', title: 'Mystery Guest', subtitle: 'Ingen visste vem du var — nu vet de!', color_from: 'from-gray-700', color_to: 'to-slate-600' },
  { id: 'perfect_host', emoji: '👨‍🍳', title: 'Mästervärd', subtitle: 'Dina gäster älskade dig!', color_from: 'from-amber-400', color_to: 'to-orange-400' },
  { id: 'party_starter', emoji: '🎉', title: 'Party Starter', subtitle: 'Du satte stämningen!', color_from: 'from-rose-500', color_to: 'to-pink-400' },
  { id: 'night_owl', emoji: '🦉', title: 'Nattuggle', subtitle: 'Sist kvar på efterfesten!', color_from: 'from-indigo-600', color_to: 'to-violet-500' },
];

export interface AwardAssignment {
  couple_id: string;
  names: string;
  award: Award;
  value: string | number | null; // The actual value (e.g., "6.8 km")
}

/**
 * Calculate and assign awards to all participants.
 * Each participant gets exactly ONE award.
 */
export function calculateAwards(participants: Participant[]): AwardAssignment[] {
  if (participants.length === 0) return [];
  
  const assignments: AwardAssignment[] = [];
  const assignedCoupleIds = new Set<string>();
  const assignedAwardIds = new Set<string>();
  
  // Helper to assign award if not already assigned
  function tryAssign(coupleId: string, awardId: string, value: string | number | null): boolean {
    if (assignedCoupleIds.has(coupleId) || assignedAwardIds.has(awardId)) {
      return false;
    }
    
    const participant = participants.find(p => p.couple_id === coupleId);
    const award = AWARDS.find(a => a.id === awardId);
    
    if (participant && award) {
      assignments.push({
        couple_id: coupleId,
        names: participant.names,
        award,
        value,
      });
      assignedCoupleIds.add(coupleId);
      assignedAwardIds.add(awardId);
      return true;
    }
    return false;
  }
  
  // Sort helpers
  const byDistance = [...participants].sort((a, b) => b.distance_km - a.distance_km);
  const byAge = [...participants]
    .filter(p => p.invited_birth_year || p.partner_birth_year)
    .sort((a, b) => {
      const aYear = Math.min(a.invited_birth_year || 9999, a.partner_birth_year || 9999);
      const bYear = Math.min(b.invited_birth_year || 9999, b.partner_birth_year || 9999);
      return aYear - bYear; // Oldest first (lowest year)
    });
  const byRegistration = [...participants].sort((a, b) => 
    new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime()
  );
  const byFunFacts = [...participants].sort((a, b) => b.fun_facts_count - a.fun_facts_count);
  const byAllergies = [...participants].sort((a, b) => b.allergies_count - a.allergies_count);
  const byDistanceFromCenter = [...participants].sort((a, b) => 
    b.address_distance_from_center - a.address_distance_from_center
  );
  
  // 1. Longest distance
  if (byDistance.length > 0) {
    const winner = byDistance[0];
    tryAssign(winner.couple_id, 'longest_distance', `${winner.distance_km} km`);
  }
  
  // 2. Shortest distance
  if (byDistance.length > 1) {
    const winner = byDistance[byDistance.length - 1];
    tryAssign(winner.couple_id, 'shortest_distance', `${winner.distance_km} km`);
  }
  
  // 3. Oldest
  if (byAge.length > 0) {
    const winner = byAge[0];
    const year = Math.min(winner.invited_birth_year || 9999, winner.partner_birth_year || 9999);
    tryAssign(winner.couple_id, 'oldest', `${2026 - year} år`);
  }
  
  // 4. Youngest
  if (byAge.length > 1) {
    const winner = byAge[byAge.length - 1];
    const year = Math.max(winner.invited_birth_year || 0, winner.partner_birth_year || 0);
    tryAssign(winner.couple_id, 'youngest', `${2026 - year} år`);
  }
  
  // 5. First signup
  if (byRegistration.length > 0) {
    tryAssign(byRegistration[0].couple_id, 'first_signup', null);
  }
  
  // 6. Last signup
  if (byRegistration.length > 1) {
    tryAssign(byRegistration[byRegistration.length - 1].couple_id, 'last_signup', null);
  }
  
  // 7. Furthest from center
  if (byDistanceFromCenter.length > 0 && byDistanceFromCenter[0].address_distance_from_center > 0) {
    const winner = byDistanceFromCenter[0];
    tryAssign(winner.couple_id, 'furthest_from_center', `${winner.address_distance_from_center} km`);
  }
  
  // 8. Closest to center
  if (byDistanceFromCenter.length > 1) {
    const winner = byDistanceFromCenter[byDistanceFromCenter.length - 1];
    tryAssign(winner.couple_id, 'closest_to_center', `${winner.address_distance_from_center} km`);
  }
  
  // 9. Most fun facts
  if (byFunFacts.length > 0 && byFunFacts[0].fun_facts_count > 0) {
    const winner = byFunFacts[0];
    tryAssign(winner.couple_id, 'most_fun_facts', `${winner.fun_facts_count} fakta`);
  }
  
  // 10. Least fun facts (mysterious)
  if (byFunFacts.length > 1) {
    const winner = byFunFacts[byFunFacts.length - 1];
    tryAssign(winner.couple_id, 'least_fun_facts', null);
  }
  
  // 11. Only vegetarian
  const vegetarians = participants.filter(p => p.is_vegetarian);
  if (vegetarians.length === 1) {
    tryAssign(vegetarians[0].couple_id, 'only_vegetarian', null);
  }
  
  // 12. Most allergies
  if (byAllergies.length > 0 && byAllergies[0].allergies_count > 0) {
    tryAssign(byAllergies[0].couple_id, 'most_allergies', `${byAllergies[0].allergies_count} allergier`);
  }
  
  // 13. Average distance (closest to mean)
  const avgDistance = participants.reduce((sum, p) => sum + p.distance_km, 0) / participants.length;
  const byDistanceFromAvg = [...participants].sort((a, b) => 
    Math.abs(a.distance_km - avgDistance) - Math.abs(b.distance_km - avgDistance)
  );
  if (byDistanceFromAvg.length > 0) {
    tryAssign(byDistanceFromAvg[0].couple_id, 'average_distance', `${byDistanceFromAvg[0].distance_km} km`);
  }
  
  // 14. Average age
  const ages = participants
    .filter(p => p.invited_birth_year || p.partner_birth_year)
    .map(p => {
      const year = Math.min(p.invited_birth_year || 9999, p.partner_birth_year || 9999);
      return { couple_id: p.couple_id, age: 2026 - year };
    });
  if (ages.length > 0) {
    const avgAge = ages.reduce((sum, a) => sum + a.age, 0) / ages.length;
    const closestToAvgAge = ages.sort((a, b) => Math.abs(a.age - avgAge) - Math.abs(b.age - avgAge))[0];
    tryAssign(closestToAvgAge.couple_id, 'average_age', `${closestToAvgAge.age} år`);
  }
  
  // 15-20. Fill remaining with wildcards
  const remainingAwards = AWARDS.filter(a => !assignedAwardIds.has(a.id));
  const remainingParticipants = participants.filter(p => !assignedCoupleIds.has(p.couple_id));
  
  // Shuffle remaining for fairness
  const shuffled = remainingParticipants.sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < shuffled.length && i < remainingAwards.length; i++) {
    tryAssign(shuffled[i].couple_id, remainingAwards[i].id, null);
  }
  
  return assignments;
}
