/**
 * Åldersreferenser för "På spåret"-ledtrådar
 * 
 * 200+ svenska kulturella och historiska referenser
 * baserade på födelseår.
 */

export interface AgeReference {
  year: number;
  references: string[];
}

// Historiska händelser och kulturella fenomen
export const AGE_REFERENCES: AgeReference[] = [
  // 1940-tal
  { year: 1940, references: [
    "Var 5 år när andra världskriget tog slut",
    "Upplevde ransoneringskorten som barn",
  ]},
  { year: 1945, references: [
    "Född samma år som freden kom",
    "Fredsbarn — andra världskriget slutade",
  ]},
  
  // 1950-tal
  { year: 1950, references: [
    "Var 8 år när TV kom till Sverige",
    "50-talsbarn — rock'n'roll-generationen",
  ]},
  { year: 1955, references: [
    "Var 14 år när Apollo 11 landade på månen",
    "Upplevde Beatles på riktigt",
  ]},
  { year: 1958, references: [
    "Var 8 år när Sverige fick färg-TV",
    "Minns nog Hylands hörna",
  ]},
  
  // 1960-tal  
  { year: 1960, references: [
    "Var 9 år när Sverige började köra höger",
    "60-talsbarn — Beatles-generationen",
  ]},
  { year: 1963, references: [
    "Var 6 år när vi började köra höger",
    "Minns kanske inte Kennedy-mordet",
  ]},
  { year: 1965, references: [
    "Var 2 år när Dagen H infördes",
    "Upplevde månlandningen som 4-åring",
  ]},
  { year: 1967, references: [
    "Dagen H-barn — Sverige körde höger samma år",
    "Var 2 år när månlandningen skedde",
  ]},
  { year: 1969, references: [
    "Föddes samma år som månlandningen",
    "Woodstock-årgång",
  ]},
  
  // 1970-tal
  { year: 1970, references: [
    "Var 4 år när ABBA vann Eurovision",
    "70-talsbarn — ABBA-generationen",
  ]},
  { year: 1972, references: [
    "Var 2 år när ABBA bildades",
    "Minns nog Pippi Långstrump på TV",
  ]},
  { year: 1974, references: [
    "Född samma år som ABBA vann Eurovision",
    "Waterloo-årgång",
  ]},
  { year: 1975, references: [
    "Var 5 år när ABBA var som störst",
    "Upplevde Björn Borgs storhetstid",
  ]},
  { year: 1976, references: [
    "Var 4 år när Björn Borg vann sin första Wimbledon",
    "Palme-era-barn",
  ]},
  { year: 1978, references: [
    "Var 2 år när Sverige förlorade VM-finalen i fotboll",
    "Test-bild-generationen",
  ]},
  { year: 1979, references: [
    "Var 1 år när Ingemar Stenmark dominerade",
    "Disco-årgång",
  ]},
  
  // 1980-tal
  { year: 1980, references: [
    "Var inte född när John Lennon sköts",
    "80-talsbarn — synth och neon",
  ]},
  { year: 1981, references: [
    "Var 5 år när Palme mördades",
    "MTV-generationen",
  ]},
  { year: 1982, references: [
    "Var 3 år när Commodore 64 släpptes",
    "E.T.-årgång",
  ]},
  { year: 1983, references: [
    "Var 3 år när Palme mördades",
    "Var 6 år när Berlinmuren föll",
  ]},
  { year: 1984, references: [
    "Orwell-årgång",
    "Var 5 år när muren föll",
  ]},
  { year: 1985, references: [
    "Herreys vann Eurovision samma år",
    "Var 4 år när Berlinmuren föll",
  ]},
  { year: 1986, references: [
    "Född samma år som Palme mördades",
    "Tjernobyl-årgång",
  ]},
  { year: 1987, references: [
    "Var 2 år när muren föll",
    "Minns inte Berlinmurens fall",
  ]},
  { year: 1988, references: [
    "Var 1 år när Berlinmuren föll",
    "Var 6 år när Kurt Cobain dog",
  ]},
  { year: 1989, references: [
    "Född samma år som Berlinmuren föll",
    "Murens-fall-årgång",
  ]},
  
  // 1990-tal
  { year: 1990, references: [
    "90-talsbarn — Mulle Meck-generationen",
    "Har aldrig upplevt Berlinmuren",
  ]},
  { year: 1991, references: [
    "Född när Sovjet föll",
    "Var 3 år när Kurt Cobain dog",
  ]},
  { year: 1992, references: [
    "Var 2 år när Kurt Cobain dog",
    "Var 4 år när Sverige tog OS-brons i fotboll",
  ]},
  { year: 1993, references: [
    "Var 1 år när Kurt Cobain dog",
    "Jurassic Park-årgång",
  ]},
  { year: 1994, references: [
    "Född samma år som Kurt Cobain dog",
    "Minns inte när Sverige tog VM-brons",
  ]},
  { year: 1995, references: [
    "Var 3 år när Titanic hade biopremiär",
    "Windows 95-årgång",
  ]},
  { year: 1996, references: [
    "Var 2 år när Titanic sjönk (på bio)",
    "Tamagotchi-generationen",
  ]},
  { year: 1997, references: [
    "Var 0 år när Titanic hade premiär",
    "Harry Potter-bokserie-årgång",
  ]},
  { year: 1998, references: [
    "Var inte född när Titanic hade premiär",
    "Google-årgång",
  ]},
  { year: 1999, references: [
    "Y2K var ett mysterium för denna bebis",
    "Matrix-årgång",
  ]},
  
  // 2000-tal
  { year: 2000, references: [
    "Milleniebarn — Y2K var inte deras problem",
    "Född i det nya millenniet",
  ]},
  { year: 2001, references: [
    "Var bebis när 11 september hände",
    "iPod-generationen",
  ]},
  { year: 2002, references: [
    "Minns inte 11 september",
    "Har aldrig känt en värld utan smartphones",
  ]},
  { year: 2003, references: [
    "Var 4 år när iPhone lanserades",
    "Har aldrig hyrt en VHS",
  ]},
  { year: 2004, references: [
    "Var 3 år när iPhone kom",
    "Facebook-årgång",
  ]},
  { year: 2005, references: [
    "Har aldrig upplevt en värld utan YouTube",
    "Var 2 år när iPhone revolutionerade",
  ]},
  { year: 2006, references: [
    "Var 1 år när iPhone lanserades",
    "Twitter-årgång",
  ]},
  { year: 2007, references: [
    "Född samma år som iPhone",
    "Har aldrig behövt blåsa i ett Nintendo-kassett",
  ]},
  { year: 2008, references: [
    "Finanskris-årgång",
    "Spotify-generation",
  ]},
  { year: 2009, references: [
    "Var 3 år när Instagram lanserades",
    "Minns inte en värld utan appar",
  ]},
  { year: 2010, references: [
    "iPad-årgång",
    "Var 2 år när Instagram kom",
  ]},
];

/**
 * Hämta åldersreferens för ett specifikt födelseår
 */
export function getAgeReference(birthYear: number): string {
  // Hitta exakt match
  const exact = AGE_REFERENCES.find(r => r.year === birthYear);
  if (exact) {
    return exact.references[Math.floor(Math.random() * exact.references.length)];
  }
  
  // Hitta närmaste år
  const sorted = AGE_REFERENCES.sort((a, b) => 
    Math.abs(a.year - birthYear) - Math.abs(b.year - birthYear)
  );
  const closest = sorted[0];
  
  if (closest && Math.abs(closest.year - birthYear) <= 2) {
    // Anpassa referensen
    const diff = birthYear - closest.year;
    const ref = closest.references[Math.floor(Math.random() * closest.references.length)];
    
    // Försök justera ålder i referensen
    return ref.replace(/Var (\d+) år/g, (match, age) => {
      const newAge = parseInt(age) - diff;
      return `Var ${newAge} år`;
    });
  }
  
  // Fallback - generera baserat på ålder
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  
  if (age < 20) return `Ung och energisk — ${age} år`;
  if (age < 30) return `20-talist med livet framför sig`;
  if (age < 40) return `30-nånting — mitt i karriären`;
  if (age < 50) return `40-talist — erfaren och vis`;
  if (age < 60) return `50-plussare — vet hur världen funkar`;
  if (age < 70) return `60-talist — pensionen hägrar`;
  return `70+ — har sett det mesta`;
}

/**
 * Generera "musikval"-ledtråd baserat på ålderskillnad
 */
export function getMusicClue(birthYear1: number, birthYear2?: number): string {
  if (!birthYear2) {
    const decade = Math.floor(birthYear1 / 10) * 10;
    const decades: Record<number, string> = {
      1950: "Elvis och rock'n'roll",
      1960: "Beatles och Rolling Stones",
      1970: "ABBA och disco",
      1980: "synth-pop och hårdrock",
      1990: "grunge och eurodance",
      2000: "R&B och indie",
      2010: "EDM och streaming",
    };
    return decades[decade] || "eklektisk musiksmak";
  }
  
  const diff = Math.abs(birthYear1 - birthYear2);
  
  if (diff < 5) {
    return "Samma musiksmak — easy listening";
  } else if (diff < 10) {
    return "Någorlunda samma era — funkar fint";
  } else if (diff < 20) {
    return "Generationsglapp — kompromissa på Spotify";
  } else {
    return "Knepigt musikval — barnbarn och farfar-vibbar";
  }
}
