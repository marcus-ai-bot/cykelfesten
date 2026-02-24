# Cascade Fix — Förslag till lösning
**Datum:** 2026-02-24  
**Författare:** Molt  
**Kontext:** Edge case-testning av Berget 2026 avslöjade att operationer på par (avhopp, split, adressändring, reassign) inte uppdaterar matchning och kuvert konsekvent.

---

## Problemet

Varje endpoint som ändrar par-data (7 st) har sin egen logik för att uppdatera pairings och kuvert. Det leder till:

1. **Inkonsistens** — vissa endpoints rensar kuvert, andra inte
2. **Duplicering** — samma "cancla kuvert"-logik copy-pasteas med olika buggar
3. **Ur-synk-data** — envelope pekar på annan värd än pairing (Rickard-buggen)

### Grundorsak: envelope-cancel filtrerar på `host_couple_id`

```typescript
// NUVARANDE KOD (reassign/route.ts rad ~155)
await supabase
  .from('envelopes')
  .update({ cancelled: true })
  .eq('match_plan_id', matchPlanId)
  .eq('couple_id', guest_couple_id)
  .eq('course', course)
  .eq('host_couple_id', oldPairing.host_couple_id); // ← BUG: kan vara ur synk
```

Om envelopet redan pekar på en annan host (t.ex. efter en tidigare misslyckad reassign), matchar inte filtret → kuvertet canclas aldrig → nytt kuvert kraschar på unique constraint.

---

## Lösning: `cascadeChanges()` — en gemensam funktion

### Varför en gemensam funktion?

| Utan cascade | Med cascade |
|---|---|
| 7 endpoints med egen rensningslogik | 7 endpoints anropar 1 funktion |
| Bugg i en endpoint = lappa den, testa den | Bugg fixas en gång, alla drar nytta |
| Ny operation = copy-paste + glöm nåt | Ny operation = definiera triggers, cascade gör resten |
| Svårt att testa alla kombinationer | En funktion = en testsuite |

### Arkitektur

```
[Endpoint]  →  gör sin ändring  →  cascadeChanges()  →  konsistent state
   │                                      │
   │                                      ├── cancla/skapa kuvert
   │                                      ├── uppdatera pairings
   │                                      ├── flagga oplacerade
   │                                      └── logga i event_log
```

---

## Implementering

### Fil: `src/lib/matching/cascade.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import {
  calculateEnvelopeTimes,
  parseCourseSchedules,
  type CourseTimingOffsets,
} from '@/lib/envelope/timing';
import type { Course } from '@/types/database';

type CascadeType =
  | 'guest_dropout'      // Gäst-par avbokar
  | 'host_dropout'       // Värd-par avbokar
  | 'split'              // Par separerar
  | 'address_change'     // Värd byter adress
  | 'reassign'           // Gäst flyttas till annan värd
  | 'resign_host'        // Värd avsäger sig
  | 'promote_host'       // Gäst blir värd
  | 'add_partner'        // Singel får partner
  | 'transfer_host';     // Värdskap överförs

interface CascadeInput {
  supabase: SupabaseClient;
  eventId: string;
  matchPlanId: string;
  type: CascadeType;
  coupleId: string;
  details?: {
    newAddress?: string;
    newAddressNotes?: string;
    newHostCoupleId?: string;
    course?: Course;
    toCoupleId?: string;
    courses?: Course[];
  };
}

interface CascadeResult {
  success: boolean;
  envelopesCancelled: number;
  envelopesCreated: number;
  pairingsRemoved: number;
  pairingsCreated: number;
  unplacedGuests: string[];  // couple_ids som behöver ny värd
  warnings: string[];
}

/**
 * cascadeChanges — uppdatera matchning och kuvert efter en ändring
 * 
 * Anropas av alla endpoints som ändrar par-data.
 * Garanterar konsistent state mellan couples, pairings, och envelopes.
 */
export async function cascadeChanges(input: CascadeInput): Promise<CascadeResult> {
  const { supabase, eventId, matchPlanId, type, coupleId, details } = input;
  
  const result: CascadeResult = {
    success: true,
    envelopesCancelled: 0,
    envelopesCreated: 0,
    pairingsRemoved: 0,
    pairingsCreated: 0,
    unplacedGuests: [],
    warnings: [],
  };

  switch (type) {
    case 'guest_dropout':
      return await handleGuestDropout(supabase, matchPlanId, coupleId, result);

    case 'host_dropout':
      return await handleHostDropout(supabase, eventId, matchPlanId, coupleId, result);

    case 'address_change':
      return await handleAddressChange(
        supabase, matchPlanId, coupleId,
        details?.newAddress ?? '',
        details?.newAddressNotes ?? null,
        result
      );

    case 'reassign':
      return await handleReassign(
        supabase, matchPlanId, coupleId,
        details?.course!,
        details?.newHostCoupleId!,
        result
      );

    case 'resign_host':
      return await handleResignHost(supabase, eventId, matchPlanId, coupleId, result);

    case 'split':
      return await handleSplit(supabase, matchPlanId, coupleId, result);

    case 'transfer_host':
      return await handleTransferHost(
        supabase, eventId, matchPlanId, coupleId,
        details?.toCoupleId!,
        details?.courses ?? [],
        result
      );

    default:
      result.warnings.push(`Okänd cascade-typ: ${type}`);
      return result;
  }
}

// ============================================================
// GÄST-AVHOPP: Cancla kuvert + ta bort pairings
// ============================================================
async function handleGuestDropout(
  supabase: SupabaseClient,
  matchPlanId: string,
  coupleId: string,
  result: CascadeResult
): Promise<CascadeResult> {
  
  // 1. Cancla ALLA aktiva kuvert för detta par (oavsett host_couple_id)
  const { data: cancelled } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCancelled = cancelled?.length ?? 0;

  // 2. Ta bort alla gäst-pairings
  const { data: removed } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .select('id');

  result.pairingsRemoved = removed?.length ?? 0;

  return result;
}

// ============================================================
// VÄRD-AVHOPP: Cancla kuvert + ta bort pairings + flagga gäster
// ============================================================
async function handleHostDropout(
  supabase: SupabaseClient,
  eventId: string,
  matchPlanId: string,
  coupleId: string,
  result: CascadeResult
): Promise<CascadeResult> {

  // 1. Hitta alla gäster som var matchade till denna värd
  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('id, course, guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId);

  const affectedGuestIds = new Set<string>();
  for (const p of hostPairings ?? []) {
    if (p.guest_couple_id !== coupleId) {
      affectedGuestIds.add(p.guest_couple_id);
    }
  }

  // 2. Cancla kuvert för ALLA drabbade gäster (för de rätter denna värd hade)
  for (const pairing of hostPairings ?? []) {
    if (pairing.guest_couple_id === coupleId) continue;
    
    await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', matchPlanId)
      .eq('couple_id', pairing.guest_couple_id)
      .eq('course', pairing.course)
      .eq('cancelled', false);

    result.envelopesCancelled++;
  }

  // 3. Cancla värdens egna kuvert (som gäst hos andra)
  const { data: ownCancelled } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');
  
  result.envelopesCancelled += ownCancelled?.length ?? 0;

  // 4. Ta bort ALLA pairings där detta par är värd
  const { data: removedHost } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .select('id');

  // 5. Ta bort parets egna gäst-pairings
  const { data: removedGuest } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .select('id');

  result.pairingsRemoved = (removedHost?.length ?? 0) + (removedGuest?.length ?? 0);

  // 6. Ta bort assignment
  await supabase
    .from('assignments')
    .delete()
    .eq('event_id', eventId)
    .eq('couple_id', coupleId);

  // 7. Returnera lista på oplacerade gäster
  result.unplacedGuests = [...affectedGuestIds];

  if (result.unplacedGuests.length > 0) {
    result.warnings.push(
      `${result.unplacedGuests.length} gäster blev oplacerade och behöver ny värd`
    );
  }

  return result;
}

// ============================================================
// ADRESSÄNDRING: Uppdatera alla kuvert där paret är värd
// ============================================================
async function handleAddressChange(
  supabase: SupabaseClient,
  matchPlanId: string,
  coupleId: string,
  newAddress: string,
  newAddressNotes: string | null,
  result: CascadeResult
): Promise<CascadeResult> {

  // Uppdatera destination_address på ALLA aktiva kuvert där detta par är värd
  const { data: updated } = await supabase
    .from('envelopes')
    .update({
      destination_address: newAddress,
      destination_notes: newAddressNotes,
    })
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCreated = updated?.length ?? 0; // "updated" i detta fall

  // Kolla om kuvert redan aktiverats — varna i så fall
  const { data: activated } = await supabase
    .from('envelopes')
    .select('id, couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .not('activated_at', 'is', null);

  if (activated && activated.length > 0) {
    result.warnings.push(
      `⚠️ ${activated.length} kuvert har redan aktiverats — gäster kan ha sett gamla adressen`
    );
  }

  return result;
}

// ============================================================
// REASSIGN: Cancla gammalt kuvert + skapa nytt (FIX FÖR DUPLICATE BUG)
// ============================================================
async function handleReassign(
  supabase: SupabaseClient,
  matchPlanId: string,
  coupleId: string,
  course: Course,
  newHostCoupleId: string,
  result: CascadeResult
): Promise<CascadeResult> {

  // 1. Ta bort gammal pairing
  const { data: oldPairings } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('guest_couple_id', coupleId)
    .eq('course', course)
    .select('id, host_couple_id');

  result.pairingsRemoved = oldPairings?.length ?? 0;

  // 2. Cancla gammal envelope — NYCKEL-FIX: filtrera UTAN host_couple_id
  //    Detta löser buggen där envelope och pairing pekar på olika hosts
  const { data: cancelledEnvs } = await supabase
    .from('envelopes')
    .update({ cancelled: true })
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .eq('course', course)
    .eq('cancelled', false)
    .select('id');

  result.envelopesCancelled = cancelledEnvs?.length ?? 0;

  // 3. Skapa ny pairing
  const { error: pairingError } = await supabase
    .from('course_pairings')
    .insert({
      match_plan_id: matchPlanId,
      course,
      host_couple_id: newHostCoupleId,
      guest_couple_id: coupleId,
    });

  if (pairingError) {
    result.success = false;
    result.warnings.push(`Pairing-fel: ${pairingError.message}`);
    return result;
  }

  result.pairingsCreated = 1;

  // 4. Nytt kuvert skapas av anropande endpoint (som har event-timing-context)
  //    Cascade returnerar bara att gamla är rensat.

  return result;
}

// ============================================================
// RESIGN HOST: Ta bort värdskap, cancla gästers kuvert
// ============================================================
async function handleResignHost(
  supabase: SupabaseClient,
  eventId: string,
  matchPlanId: string,
  coupleId: string,
  result: CascadeResult
): Promise<CascadeResult> {

  // 1. Hitta alla gäst-pairings där detta par är värd
  const { data: hostPairings } = await supabase
    .from('course_pairings')
    .select('id, course, guest_couple_id')
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId);

  // 2. Cancla gästers kuvert
  for (const p of hostPairings ?? []) {
    if (p.guest_couple_id === coupleId) continue;
    
    await supabase
      .from('envelopes')
      .update({ cancelled: true })
      .eq('match_plan_id', matchPlanId)
      .eq('couple_id', p.guest_couple_id)
      .eq('course', p.course)
      .eq('cancelled', false);

    result.envelopesCancelled++;
    result.unplacedGuests.push(p.guest_couple_id);
  }

  // 3. Ta bort alla host-pairings
  const { data: removed } = await supabase
    .from('course_pairings')
    .delete()
    .eq('match_plan_id', matchPlanId)
    .eq('host_couple_id', coupleId)
    .select('id');

  result.pairingsRemoved = removed?.length ?? 0;

  // 4. Ta bort host assignment
  await supabase
    .from('assignments')
    .delete()
    .eq('event_id', eventId)
    .eq('couple_id', coupleId)
    .eq('is_host', true);

  return result;
}

// ============================================================
// SPLIT: Flagga att omplacering behövs
// ============================================================
async function handleSplit(
  supabase: SupabaseClient,
  matchPlanId: string,
  coupleId: string,
  result: CascadeResult
): Promise<CascadeResult> {

  // Kolla om kuvert redan aktiverats
  const { data: activated } = await supabase
    .from('envelopes')
    .select('id')
    .eq('match_plan_id', matchPlanId)
    .eq('couple_id', coupleId)
    .not('activated_at', 'is', null);

  if (activated && activated.length > 0) {
    result.warnings.push(
      `⚠️ Paret har ${activated.length} aktiverade kuvert — split kan skapa förvirring`
    );
  }

  // Splitten själv hanteras av split-endpointen.
  // Cascade flaggar bara att den nya personen behöver placeras.
  result.warnings.push('Ny person skapad — behöver placeras manuellt via matchningsvyn');

  return result;
}

// ============================================================
// TRANSFER HOST: Flytta värdskap inkl kuvert
// ============================================================
async function handleTransferHost(
  supabase: SupabaseClient,
  eventId: string,
  matchPlanId: string,
  fromCoupleId: string,
  toCoupleId: string,
  courses: Course[],
  result: CascadeResult
): Promise<CascadeResult> {

  // Hämta nya värdens adress
  const { data: toCouple } = await supabase
    .from('couples')
    .select('address, address_notes')
    .eq('id', toCoupleId)
    .single();

  for (const course of courses) {
    // 1. Flytta assignment
    const { data: assignment } = await supabase
      .from('assignments')
      .select('id, max_guests, is_flex_host, flex_extra_capacity, is_emergency_host')
      .eq('event_id', eventId)
      .eq('couple_id', fromCoupleId)
      .eq('course', course)
      .eq('is_host', true)
      .single();

    if (!assignment) {
      result.warnings.push(`${course}: Ingen värd-assignment att flytta`);
      continue;
    }

    await supabase.from('assignments').delete().eq('id', assignment.id);
    await supabase.from('assignments').insert({
      event_id: eventId,
      couple_id: toCoupleId,
      course,
      is_host: true,
      max_guests: assignment.max_guests,
      is_flex_host: assignment.is_flex_host,
      flex_extra_capacity: assignment.flex_extra_capacity,
      is_emergency_host: assignment.is_emergency_host,
    });

    // 2. Uppdatera pairings — FIX: uppdatera ALLA pairings för denna rätt
    //    (inte bara de som matchar host_couple_id, ifall data är ur synk)
    await supabase
      .from('course_pairings')
      .update({ host_couple_id: toCoupleId })
      .eq('match_plan_id', matchPlanId)
      .eq('host_couple_id', fromCoupleId)
      .eq('course', course);

    // 3. Uppdatera kuvert — FIX: uppdatera baserat på couple_id + course
    //    för alla gäster som har kuvert med denna värd
    const { data: updated } = await supabase
      .from('envelopes')
      .update({
        host_couple_id: toCoupleId,
        destination_address: toCouple?.address ?? null,
        destination_notes: toCouple?.address_notes ?? null,
      })
      .eq('match_plan_id', matchPlanId)
      .eq('host_couple_id', fromCoupleId)
      .eq('course', course)
      .eq('cancelled', false)
      .select('id');

    result.envelopesCreated += updated?.length ?? 0;
  }

  return result;
}
```

---

## Hur endpoints ändras

### Före (reassign/route.ts — 289 rader):
```typescript
// Lång endpoint med inline-logik för att cancla kuvert, skapa pairings etc.
// BUG: filtrerar envelope-cancel på host_couple_id
await supabase
  .from('envelopes')
  .update({ cancelled: true })
  .eq('host_couple_id', oldPairing.host_couple_id); // ← Kan vara ur synk
```

### Efter (reassign/route.ts — ~100 rader):
```typescript
import { cascadeChanges } from '@/lib/matching/cascade';

// ... validering som innan ...

// En rad: cascade sköter rensning
const cascade = await cascadeChanges({
  supabase, eventId, matchPlanId,
  type: 'reassign',
  coupleId: guest_couple_id,
  details: { course, newHostCoupleId: new_host_couple_id },
});

if (!cascade.success) {
  return NextResponse.json({ error: cascade.warnings.join(', ') }, { status: 500 });
}

// Skapa nytt kuvert (endpoint har timing-context)
const { error: envError } = await supabase.from('envelopes').insert({ ... });
```

### couple PATCH (adressändring):
```typescript
// Efter att adressen sparats:
if (filtered.address) {
  const event = await getEventForCouple(supabase, coupleId);
  if (event?.active_match_plan_id) {
    await cascadeChanges({
      supabase,
      eventId: event.id,
      matchPlanId: event.active_match_plan_id,
      type: 'address_change',
      coupleId,
      details: { newAddress: filtered.address, newAddressNotes: filtered.address_notes },
    });
  }
}
```

### couple DELETE (avhopp):
```typescript
// Istället för bara cancelled=true:
const event = await getEventForCouple(supabase, coupleId);
if (event?.active_match_plan_id) {
  const isHost = await checkIfHost(supabase, eventId, coupleId);
  await cascadeChanges({
    supabase,
    eventId: event.id,
    matchPlanId: event.active_match_plan_id,
    type: isHost ? 'host_dropout' : 'guest_dropout',
    coupleId,
  });
}
// Sen cancelled=true som innan
```

---

## Vad fixas per scenario

| # | Scenario | Fix i cascade | Endpoint-ändring |
|---|----------|--------------|-----------------|
| 1 | Gäst avbokar | `guest_dropout` rensar pairings+kuvert | DELETE anropar cascade |
| 2 | Värd avbokar | `host_dropout` rensar + flaggar oplacerade | DELETE anropar cascade |
| 3 | En person försvinner | — | PATCH hanterar person_count (redan auto) |
| 4 | Split | `split` varnar om aktiverade kuvert | Split anropar cascade |
| 5 | Split + avhopp | Kombination av split + dropout | Redan löst av ovan |
| 6 | Resign host | `resign_host` (redan bra, konsolideras) | Anropar cascade |
| 7 | Adressändring | `address_change` propagerar till kuvert | PATCH anropar cascade |
| 8 | Singel får partner | — | Kapacitet uppdateras auto (generated column) |
| 10 | Sent avhopp | `host_dropout` med varning | Dropout anropar cascade |
| 11 | Under kvällen | Varning om aktiverade kuvert | Cascade kollar activated_at |
| 12 | Reassign | `reassign` — **FIXAR DUPLICATE BUG** | Reassign anropar cascade |
| 13 | Blocked pair | — | Kräver rematch (separat) |
| 14 | Allergi | — | Framtida: notis-system |
| 15 | Dubbel-adress | — | Framtida: varning i UI |
| 17 | Ändra kapacitet | — | Ny endpoint behövs |
| 18 | Nytt par efter matchning | Duplikat-check i place | Place anropar cascade |
| 20 | Transfer host | `transfer_host` — fixar ur-synk-risk | Transfer anropar cascade |

---

## Saknas fortfarande (efter cascade)

Dessa löses INTE av cascade men bör hanteras separat:

1. **UI: "Avsäg värdskap"-knapp** — finns som API men saknar knapp i gästdetalj
2. **UI: Ändra max_guests** — ny endpoint + knapp på värdkort i matchningsvyn
3. **UI: Varning dubbel-adress** — jämför adresser i gästlistan
4. **Notis vid allergiändring** — flagga i matchningsvyn
5. **Notis vid blocked pair** — varna att rematch behövs

---

## Implementeringsordning

| Steg | Vad | Tid | Löser |
|------|-----|-----|-------|
| 1 | `cascade.ts` — grundfunktionen | 2h | Infrastruktur |
| 2 | Koppla in i reassign + place | 1h | #12, #18 (kritiska buggar) |
| 3 | Koppla in i couple PATCH + DELETE | 1h | #1, #2, #7 |
| 4 | Koppla in i split, transfer, resign, promote | 1h | #4, #6, #20 |
| 5 | Tester — kör alla 17 scenarios igen | 2h | Verifikation |
| 6 | UI-knappar (resign, max_guests) | 2h | #6, #17 |
| **Totalt** | | **~9h** | **14 av 17 scenarios** |

---

*Förslag av Molt, 2026-02-24*
