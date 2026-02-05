/**
 * Ledtråds-generator
 * 
 * Skapar "På spåret"-style ledtrådar för värdvyn
 * baserat på ålder, avstånd och fun facts.
 */

import { getAgeReference, getMusicClue } from './age-references';

export interface GuestProfile {
  personCount: number;
  invited: {
    birthYear?: number;
    address?: string;
    funFacts?: FunFacts;
  };
  partner?: {
    birthYear?: number;
    funFacts?: FunFacts;
  };
}

export interface FunFacts {
  musicDecade?: string;
  pet?: { type: string; name?: string };
  talent?: string;
  firstJob?: string;
  dreamDestination?: string;
  instruments?: string[];
  sport?: string;
  unknownFact?: string;
  importantYear?: { year: number; reason?: string };
}

export interface ClueContext {
  hostAddress: string;
  previousCourseAddress?: string;
}

/**
 * Haversine-formel för avstånd mellan koordinater
 */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Jordens radie i km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Formatera avstånd för visning
 */
function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

/**
 * Generera fun fact-ledtråd
 */
function getFunFactClue(facts: FunFacts): string | null {
  const clues: string[] = [];
  
  if (facts.pet) {
    if (facts.pet.name) {
      clues.push(`Bor med en ${facts.pet.type} vid namn ${facts.pet.name}`);
    } else {
      clues.push(`Har en ${facts.pet.type} hemma`);
    }
  }
  
  if (facts.talent) {
    clues.push(`Hemligt talent: ${facts.talent}`);
  }
  
  if (facts.firstJob) {
    clues.push(`Första jobbet: ${facts.firstJob}`);
  }
  
  if (facts.dreamDestination) {
    clues.push(`Drömmer om att resa till ${facts.dreamDestination}`);
  }
  
  if (facts.instruments?.length) {
    const instr = facts.instruments.join(' och ');
    clues.push(`Spelar ${instr}`);
  }
  
  if (facts.sport) {
    clues.push(`Gillar ${facts.sport}`);
  }
  
  if (facts.unknownFact) {
    clues.push(facts.unknownFact);
  }
  
  if (facts.importantYear) {
    const y = facts.importantYear;
    if (y.reason) {
      clues.push(`${y.year} var ett viktigt år (${y.reason})`);
    } else {
      clues.push(`${y.year} var ett speciellt år`);
    }
  }
  
  if (facts.musicDecade) {
    const decades: Record<string, string> = {
      '60': '60-talslåtar',
      '70': 'ABBA och disco',
      '80': 'synthpop',
      '90': '90-talshits',
      '00': '2000-talsmusik',
      '10': '2010-talets hits',
      '20': 'dagens musik',
    };
    clues.push(`Föredrar ${decades[facts.musicDecade] || 'okänt årtionde'}`);
  }
  
  if (clues.length === 0) return null;
  
  // Returnera slumpmässig ledtråd
  return clues[Math.floor(Math.random() * clues.length)];
}

/**
 * Generera komplett ledtråd för en gäst
 */
export function generateClues(
  guest: GuestProfile,
  context: ClueContext,
  guestCoordinates?: { lat: number; lon: number },
  hostCoordinates?: { lat: number; lon: number }
): string[] {
  const clues: string[] = [];
  const currentYear = new Date().getFullYear();
  
  // === ÅLDER ===
  if (guest.invited.birthYear) {
    const age1 = currentYear - guest.invited.birthYear;
    
    if (guest.partner?.birthYear) {
      const age2 = currentYear - guest.partner.birthYear;
      
      // Båda åldrar
      if (Math.abs(age1 - age2) > 10) {
        clues.push(`${age1} och ${age2} år. ${getMusicClue(guest.invited.birthYear, guest.partner.birthYear)}`);
      } else {
        clues.push(`Båda runt ${Math.round((age1 + age2) / 2)} år`);
      }
      
      // Åldersreferens för en av dem
      clues.push(getAgeReference(guest.invited.birthYear));
    } else {
      // Singel
      clues.push(getAgeReference(guest.invited.birthYear));
      clues.push(`${age1} år gammal`);
    }
  }
  
  // === AVSTÅND ===
  if (guestCoordinates && hostCoordinates) {
    const distance = haversineDistance(
      guestCoordinates.lat, guestCoordinates.lon,
      hostCoordinates.lat, hostCoordinates.lon
    );
    
    if (distance < 0.5) {
      clues.push(`Bor grannarna — under 500m bort`);
    } else if (distance < 1) {
      clues.push(`Cyklar ${formatDistance(distance)} för att nå er`);
    } else {
      clues.push(`Trampar ${formatDistance(distance)} hit`);
    }
  }
  
  // === FUN FACTS ===
  if (guest.invited.funFacts) {
    const funClue = getFunFactClue(guest.invited.funFacts);
    if (funClue) clues.push(funClue);
  }
  
  if (guest.partner?.funFacts) {
    const partnerClue = getFunFactClue(guest.partner.funFacts);
    if (partnerClue) clues.push(`Partnern: ${partnerClue}`);
  }
  
  // === ANTAL ===
  if (guest.personCount === 1) {
    clues.push('Kommer ensam men social');
  } else {
    clues.push(`${guest.personCount} hungriga själar`);
  }
  
  // Slumpa ordning och välj 2-4 ledtrådar
  const shuffled = clues.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(4, shuffled.length));
}

/**
 * Formatera ledtrådar för visning
 */
export function formatCluesForDisplay(clues: string[]): string {
  return clues.join(' • ');
}
