# Edge Case Report — Cykelfesten
**Datum:** 2026-02-24  
**Testat på:** Berget 2026 (ab2e1b31, 58 par, locked)  
**Testat av:** Molt (live browser + API + kodanalys)

---

## Sammanfattning

| # | Edge Case | Status | Allvarlighet |
|---|-----------|--------|-------------|
| 1 | Duplicate envelope vid reassign | ❌ **BUG** | 🔴 Kritisk |
| 2 | Place skapar kuvert utan duplikat-check | ❌ **BUG** | 🔴 Kritisk |
| 3 | Reassign: envelope cancel missar vid ur-synk data | ❌ **BUG** | 🔴 Kritisk |
| 4 | Split: ny person saknar matchning/kuvert | ⚠️ **RISK** | 🟡 Medel |
| 5 | Adressändring uppdaterar inte kuvert | ❌ **BUG** | 🔴 Kritisk |
| 6 | Rickard Fredriksson: envelope/pairing mismatch | ❌ **BUG** | 🔴 Kritisk (live data!) |
| 7 | Transfer-host: samma ur-synk-risk som reassign | ⚠️ **RISK** | 🟡 Medel |
| 8 | Dropout: gamla kuvert canclas inte vid host dropout | ⚠️ **RISK** | 🟡 Medel |
| 9 | Dubbel-registrering (samma email) | ✅ **OK** | — |
| 10 | XSS i textfält | ⚠️ **RISK** | 🟡 Medel |
| 11 | Inga längdbegränsningar | ⚠️ **RISK** | 🟢 Låg |

---

## 🔴 Kritiska buggar

### 1. Duplicate Envelope vid Reassign (BEKRÄFTAD LIVE)

**Steg att reproducera:**
1. Par X har pairing till värd A men envelope till värd B (ur synk)
2. Kör reassign av par X till värd C
3. Reassign försöker cancla envelope med `host_couple_id = A` (från pairing)
4. Men envelope har `host_couple_id = B` → **ingen match → inget canclas**
5. Ny pairing skapas ✅
6. Nytt envelope kraschar: `duplicate key value violates unique constraint "envelopes_match_plan_id_couple_id_course_key"`

**Live-test (Rickard Fredriksson):**
```
fetch('/api/organizer/events/.../reassign', {
  method: 'POST',
  body: JSON.stringify({
    guest_couple_id: '7b746cd6...',    // Rickard
    course: 'main',
    new_host_couple_id: '8084cb7b...'  // Ny värd
  })
})

→ { error: "duplicate key value violates unique constraint..." }
```

**Konsekvens:** Pairingen SKAPADES men kuvertet inte → **inkonsistent state**. Rickard har nu pairing till ny värd men kuvert till gammal värd.

**Grundorsak:** `reassign/route.ts` rad ~143:
```typescript
// Cancel old envelope - BUGGY: filtrerar på pairing's host, inte envelope's host
await supabase
  .from('envelopes')
  .update({ cancelled: true })
  .eq('host_couple_id', oldPairing.host_couple_id); // ← Borde filtrera utan host_couple_id
```

**Fix:** Cancla envelope baserat på `couple_id + course + match_plan_id` (utan `host_couple_id`):
```typescript
await supabase
  .from('envelopes')
  .update({ cancelled: true })
  .eq('match_plan_id', matchPlanId)
  .eq('couple_id', guest_couple_id)
  .eq('course', course)
  .eq('cancelled', false);  // Bara aktiva
```

---

### 2. Place: Ingen duplikat-check

**Fil:** `src/app/api/organizer/events/[eventId]/place/route.ts`

Place-endpointen insertar kuvert och pairings blint utan att kontrollera om paret redan har matchning/kuvert för den rätten.

**Konsekvens:** Om ett "oplacerat" par redan har en pairing (t.ex. från en misslyckad reassign), skapas duplicate.

**Fix:** Lägg till `ON CONFLICT` eller explicit kontroll innan insert.

---

### 3. Rickard Fredriksson — Live Data Ur Synk

**Status:** Rickards `main` data i produktion:
- **Pairing:** host `13470c18` (Mikael Sandberg)
- **Envelope:** host `8a18fc18` (Mattias Hedlund), destination "Kolmilavägen 17"

Rickard skulle cykla till **Kolmilavägen 17** (Mattias) men hans middag tillagas på **annan adress** (Mikael). 

**Åtgärd krävs:** Antingen uppdatera envelopet eller pairingen så de matchar.

---

### 5. Adressändring Uppdaterar Inte Kuvert

**Fil:** `src/app/api/organizer/couples/[coupleId]/route.ts` (PATCH)

Ändrar en värd sin adress sparas det i `couples.address` men alla envelopes som pekar på denna värd behåller `destination_address` från matchningstillfället.

**Konsekvens:** Gäster cyklar till gamla adressen.

**Fix:** Vid adressändring av värd, uppdatera alla envelopes:
```typescript
if (filtered.address && couple.is_host_somewhere) {
  await supabase
    .from('envelopes')
    .update({ destination_address: filtered.address })
    .eq('host_couple_id', coupleId)
    .eq('cancelled', false);
}
```

---

## 🟡 Risker

### 4. Split: Ny Person Saknar Matchning

**Fil:** `src/app/api/organizer/couples/[coupleId]/split/route.ts`

Split skapar en ny couple-rad för partnern men:
- ❌ Inget assignment (vilken rätt lagar de?)
- ❌ Inga pairings (var äter de?)
- ❌ Inga kuvert

Den nya personen hamnar som "oplacerad" och måste manuellt placeras via place/reassign.

**Inte nödvändigtvis en bugg** — men UX:en borde tydligt visa att manuell omplacering krävs efter split.

---

### 7. Transfer-host: Samma Ur-synk-risk

**Fil:** `src/app/api/organizer/events/[eventId]/transfer-host/route.ts`

Filtrerar envelope-uppdatering på `host_couple_id = from_couple_id`. Om kuvertet redan är ur synk (pekar på annan host) uppdateras det inte.

**Samma fix som reassign:** Filtrera på `couple_id + course` istället.

---

### 8. Dropout: Envelopes vid Host Dropout

**Fil:** `src/app/api/dropout/route.ts`

Vid **gäst-dropout:** Envelopes canclas korrekt ✅  
Vid **värd-dropout:** Envelopes för de drabbade gästerna canclas INTE explicit. Ny match plan skapas med nya kuvert, men gamla kuvert i gamla planen lever kvar.

**Risk:** Om `active_match_plan_id` uppdateras korrekt är det OK (gamla planen ignoreras). Men om något läser kuvert utan att filtrera på aktiv plan → dubbla kuvert visas.

---

### 10. XSS i Textfält

`<script>alert("XSS")</script>` sparas rakt av i `address_notes`, `invited_allergy_notes` etc. Ingen sanitering på väg in.

**Risk:** Beror på om React escaper output (det gör React default via JSX). Men om `dangerouslySetInnerHTML` används nånstans → XSS.

---

## ✅ Fungerar bra

- **Dubbel-registrering:** Blockeras av unique constraint `idx_couples_unique_email_per_event` ✅
- **Foreign key protection:** Kan inte radera par med kuvert ✅
- **SQL injection:** Supabase parametriserade queries skyddar ✅
- **Unicode/emoji:** Full support ✅
- **Auth på endpoints:** Alla kräver organizer-session ✅
- **Rematch-lås:** Concurrent rematch blockeras med `rematch_lock_until` ✅

---

## Prioriterad åtgärdslista

1. **🔴 FIX REASSIGN** — Ändra envelope-cancel till `couple_id + course` utan `host_couple_id`
2. **🔴 FIX RICKARD** — Synka hans envelope med pairingen (live data!)
3. **🔴 FIX PLACE** — Lägg till duplikat-check innan insert
4. **🔴 FIX ADRESSÄNDRING** — Propagera adressändringar till kuvert
5. **🟡 FIX TRANSFER-HOST** — Samma envelope-filter-fix
6. **🟡 FÖRTYDLIGA SPLIT** — Visa tydligt att omplacering krävs
7. **🟡 SANITERA INPUT** — HTML-sanitering på textfält
8. **🟢 LÄNGDBEGRÄNSNING** — Max-length på textfält

---

*Rapport genererad 2026-02-24 av Molt*
