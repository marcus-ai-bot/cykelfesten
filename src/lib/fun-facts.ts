/**
 * Shared Fun Facts types, rendering, and field definitions.
 *
 * The canonical storage format is a JSON object (FunFacts).
 * Legacy data may still be string[] — every consumer MUST handle both
 * via the helpers exported here.
 */

// ── Types ───────────────────────────────────────────────────────────

export type FunFacts = {
  musicDecade?: string;
  pet?: string;
  talent?: string;
  firstJob?: string;
  dreamDestination?: string;
  instruments?: string;
  sport?: string;
  unknownFact?: string;
  importantYear?: string;
};

// ── Field definitions (for UI) ──────────────────────────────────────

export interface FunFactField {
  key: keyof FunFacts;
  label: string;
  placeholder: string;
  type: 'text' | 'select';
  options?: { value: string; label: string }[];
}

export const FUN_FACT_FIELDS: FunFactField[] = [
  {
    key: 'musicDecade',
    label: 'Bästa musikdecenniet',
    placeholder: '',
    type: 'select',
    options: [
      { value: '60', label: '60-talet' },
      { value: '70', label: '70-talet' },
      { value: '80', label: '80-talet' },
      { value: '90', label: '90-talet' },
      { value: '00', label: '00-talet' },
      { value: '10', label: '10-talet' },
      { value: '20', label: '20-talet' },
    ],
  },
  { key: 'pet', label: 'Husdjur', placeholder: 'katt, hund...', type: 'text' },
  { key: 'talent', label: 'Hemligt talent', placeholder: 'jonglera, sjunga...', type: 'text' },
  { key: 'firstJob', label: 'Första jobbet', placeholder: 'tidningsbud, servitör...', type: 'text' },
  { key: 'dreamDestination', label: 'Drömresmål', placeholder: 'Japan, Island...', type: 'text' },
  { key: 'instruments', label: 'Instrument', placeholder: 'gitarr, piano...', type: 'text' },
  { key: 'sport', label: 'Sport/aktivitet', placeholder: 'löpning, yoga...', type: 'text' },
  { key: 'unknownFact', label: 'Något okänt om mig', placeholder: 'Har träffat kungen...', type: 'text' },
  { key: 'importantYear', label: 'Viktigt år', placeholder: '1998', type: 'text' },
];

// ── Rendering ───────────────────────────────────────────────────────

const RENDER_MAP: Record<keyof FunFacts, (v: string) => string> = {
  musicDecade: (v) => `Tycker att ${v}-talets musik var bäst`,
  pet: (v) => `Har husdjur: ${v}`,
  talent: (v) => `Hemligt talent: ${v}`,
  firstJob: (v) => `Första jobbet var ${v}`,
  dreamDestination: (v) => `Drömresmål: ${v}`,
  instruments: (v) => `Spelar ${v}`,
  sport: (v) => `Sportar: ${v}`,
  unknownFact: (v) => v, // already a full sentence
  importantYear: (v) => `Viktigt år: ${v}`,
};

/** Render a single fun fact key+value to a human-readable string. */
export function renderFunFact(key: keyof FunFacts, value: string): string {
  const fn = RENDER_MAP[key];
  return fn ? fn(value) : value;
}

/** Render all non-empty facts to a string array (for clue system etc). */
export function renderAllFunFacts(facts: FunFacts): string[] {
  const result: string[] = [];
  for (const field of FUN_FACT_FIELDS) {
    const val = facts[field.key];
    if (val) result.push(renderFunFact(field.key, val));
  }
  return result;
}

// ── Counting ────────────────────────────────────────────────────────

/** Count how many facts are filled in. Handles both legacy string[] and new object. */
export function countFunFacts(facts: unknown): number {
  if (!facts) return 0;
  if (Array.isArray(facts)) return facts.length;
  if (typeof facts === 'object') {
    return Object.values(facts as Record<string, unknown>).filter(v => v && String(v).trim() !== '').length;
  }
  return 0;
}

// ── Normalisation (both formats → FunFacts) ─────────────────────────

/** Normalise any fun_facts value (string[] | FunFacts | null) to FunFacts. */
export function normaliseFunFacts(raw: unknown): FunFacts {
  if (!raw) return {};
  if (Array.isArray(raw)) return parseLegacyFunFacts(raw as string[]);
  if (typeof raw === 'object') return raw as FunFacts;
  return {};
}

/** Convert fun facts (either format) to a string[] for the clue system. */
export function funFactsToStrings(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((f): f is string => typeof f === 'string');
  if (typeof raw === 'object') return renderAllFunFacts(raw as FunFacts);
  return [];
}

// ── Legacy parsing (string[] → FunFacts) ────────────────────────────

const LEGACY_PATTERNS: { pattern: RegExp; key: keyof FunFacts; extract: (m: RegExpMatchArray) => string }[] = [
  // Music decade — multiple formats
  { pattern: /^Tycker att (\d+)-talets musik var bäst$/i, key: 'musicDecade', extract: (m) => m[1] },
  { pattern: /^Favoriter från (\d+)-talet$/i, key: 'musicDecade', extract: (m) => m[1] },
  { pattern: /^(\d+)-talets musik/i, key: 'musicDecade', extract: (m) => m[1] },
  { pattern: /^Musik.?\s*(\d+)/i, key: 'musicDecade', extract: (m) => m[1] },
  // Other fields
  { pattern: /^Har husdjur:\s*(.+)$/i, key: 'pet', extract: (m) => m[1] },
  { pattern: /^Husdjur:\s*(.+)$/i, key: 'pet', extract: (m) => m[1] },
  { pattern: /^Hemligt talent:\s*(.+)$/i, key: 'talent', extract: (m) => m[1] },
  { pattern: /^Talent:\s*(.+)$/i, key: 'talent', extract: (m) => m[1] },
  { pattern: /^Första jobbet var\s+(.+)$/i, key: 'firstJob', extract: (m) => m[1] },
  { pattern: /^Första jobbet:\s*(.+)$/i, key: 'firstJob', extract: (m) => m[1] },
  { pattern: /^Drömresmål:\s*(.+)$/i, key: 'dreamDestination', extract: (m) => m[1] },
  { pattern: /^Spelar\s+(.+)$/i, key: 'instruments', extract: (m) => m[1] },
  { pattern: /^Instrument:\s*(.+)$/i, key: 'instruments', extract: (m) => m[1] },
  { pattern: /^Sportar:\s*(.+)$/i, key: 'sport', extract: (m) => m[1] },
  { pattern: /^Sport:\s*(.+)$/i, key: 'sport', extract: (m) => m[1] },
  { pattern: /^Viktigt år:\s*(.+)$/i, key: 'importantYear', extract: (m) => m[1] },
];

export function parseLegacyFunFacts(facts: string[]): FunFacts {
  const result: FunFacts = {};
  const unmatched: string[] = [];

  for (const fact of facts) {
    let matched = false;
    for (const { pattern, key, extract } of LEGACY_PATTERNS) {
      const m = fact.match(pattern);
      if (m) {
        result[key] = extract(m);
        matched = true;
        break;
      }
    }
    if (!matched) {
      unmatched.push(fact);
    }
  }

  // Put first unmatched into unknownFact
  if (unmatched.length > 0 && !result.unknownFact) {
    result.unknownFact = unmatched[0];
  }

  return result;
}

// ── Music decade helper (for wrap) ──────────────────────────────────

/** Extract music decade string from fun facts (either format). Returns e.g. "80s" or "default". */
export function getMusicDecade(raw: unknown): string {
  const facts = normaliseFunFacts(raw);
  if (facts.musicDecade) {
    const d = facts.musicDecade;
    if (d === '00') return '2000s';
    if (d === '10') return '2010s';
    if (d === '20') return '2020s';
    return `${d}s`;
  }
  // Fallback: try string search for legacy format
  if (Array.isArray(raw)) {
    const allFacts = (raw as string[]).join(' ').toLowerCase();
    const keywords: Record<string, string[]> = {
      '80s': ['80-tal', '80s', 'eighties', '1980'],
      '90s': ['90-tal', '90s', 'nineties', '1990'],
      '2000s': ['2000-tal', '2000s', 'nollnoll', '00-tal'],
      '2010s': ['2010-tal', '2010s', 'tio-tal'],
      '2020s': ['2020-tal', '2020s', 'tjugo-tal'],
    };
    for (const [decade, kws] of Object.entries(keywords)) {
      if (kws.some(kw => allFacts.includes(kw))) return decade;
    }
  }
  return 'default';
}
