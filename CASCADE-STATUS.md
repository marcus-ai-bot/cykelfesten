# Cascade Engine — Statusrapport

**Datum:** 2026-02-24  
**Projekt:** Cykelfesten / Berget 2026  
**Författare:** Molt

---

## 1. Bakgrund

Cykelfesten har 7 organizer-endpoints som ändrar par-data (reassign, place, split, transfer-host, resign-host, promote-host, dropout). Varje endpoint hade egen copy-pastad logik för att hantera pairings och kuvert — med olika buggar.

**Huvudproblemet:** Kuvert och pairings hamnade ur synk, t.ex. envelope pekar på värd A men pairing pekar på värd B. Rickard Fredrikssons live-data var ett konkret exempel.

---

## 2. Vad som testats

### 2.1 Kodanalys (8 endpoints)
Gick igenom varje endpoint rad för rad och dokumenterade hur de hanterar pairings/kuvert:

| Endpoint | Fil | Status |
|----------|-----|--------|
| `reassign` | `events/[eventId]/reassign/route.ts` | 🔴 Bugg: envelope-cancel filtrar på `host_couple_id` |
| `place` | `events/[eventId]/place/route.ts` | 🔴 Bugg: blind insert utan duplikat-check |
| `couple PATCH` | `couples/[coupleId]/route.ts` | 🔴 Bugg: adressändring propageras inte till kuvert |
| `couple DELETE` | `couples/[coupleId]/route.ts` | 🔴 Bugg: `cancelled=true` men pairings/kuvert rensas inte |
| `split` | `couples/[coupleId]/split/route.ts` | ⚠️ Ny person får inga kuvert/pairings |
| `transfer-host` | `events/[eventId]/transfer-host/route.ts` | ⚠️ Samma ur-synk-risk som reassign |
| `resign-host` | Endpoint finns | ⚠️ Gästers kuvert rensas inte |
| `dropout` | `dropout/route.ts` | ⚠️ Host dropout rensar inte gäst-kuvert |

### 2.2 Live-testning (browser + API)
Testade mot Berget 2026 (58 par) via browser:
- Bekräftade Rickard-buggen live (envelope/pairing mismatch)
- Testade reassign → duplicate key constraint error
- Testade XSS i textfält (sparas utan sanitering, men React escaper output)
- Testade DELETE av par med foreign keys (blockeras korrekt)
- Dokumenterat i `BROWSER-TEST-REPORT.md`

### 2.3 Edge cases (20 st, 17 testade)
Rankade 20 edge cases efter allvarlighet och testade 17. Dokumenterat i `EDGE-CASE-REPORT.md`:

| Allvarlighet | Antal | Exempel |
|-------------|-------|---------|
| 🔴 Kritisk | 4 | Duplicate envelope, adress-propagering, Rickard live data |
| 🟡 Medel | 4 | Split saknar kuvert, host dropout, XSS |
| 🟢 Låg | 1 | Inga längdbegränsningar |
| ✅ OK | 8 | Dubbel-registrering, FK-skydd, SQL injection, auth |

### 2.4 Data-fix
Rickards live-data fixades manuellt: envelope `be7295b6` uppdaterades till korrekt host `13470c18`. Hela eventet rengjordes och Marcus körde om matchningen.

---

## 3. Vad som byggts

### 3.1 Cascade Engine (`src/lib/matching/cascade.ts` — 535 rader)
En gemensam `cascadeChanges()` funktion som alla endpoints anropar. Hanterar 8 scenarion:

```
guest_dropout | host_dropout | address_change | reassign
resign_host   | split        | transfer_host  | promote_host
```

**Nyckel-fix:** Envelope-cancel filtrerar nu på `couple_id + course + match_plan_id` (UTAN `host_couple_id`), vilket eliminerar root cause för duplicate-buggen.

### 3.2 Policy-modul (`src/lib/matching/policy.ts` — 135 rader)
Reveal-policy (soft freeze B): adressändringar efter kuvert-aktivering tillåts men genererar varning om att gäster kan ha sett gamla adressen.

### 3.3 ADR-002: Matching Invariants (`docs/adr/ADR-002-matching-invariants.md`)
Tre formella invarianter:
1. **Aktiv pairing ↔ exakt 1 aktivt kuvert** (same match_plan + couple + course)
2. **Kuvert-destination = värdens adress** vid aktivering
3. **Pairing host = envelope host** — får aldrig divergera

### 3.4 Repair Script (`scripts/repair-matching.ts`)
Detekterar och (med `--fix`) reparerar:
- Pairings utan kuvert
- Kuvert utan pairing
- Host mismatch (pairing.host ≠ envelope.host)
- Duplicate kuvert

### 3.5 Tester (`__tests__/cascade.test.ts` — 305 rader)
18 test cases med MockSupabase. **11 passerar, 7 failar** pga att MockSupabase saknar `single()` och kedjad `.select().eq()` — testerna behöver mock-fix, inte cascade-fix.

### 3.6 Endpoint-integration
Cascade är inkopplad i 5 av 7 endpoints:

| Endpoint | Cascade inkopplad | Commit |
|----------|-------------------|--------|
| `reassign` | ✅ | `83ed008` |
| `place` | ✅ | `f557088` |
| `couple PATCH` | ✅ | `f557088` |
| `couple DELETE` (dropout) | ✅ | `f557088` |
| `transfer-host` | ✅ | `f557088` |
| `resign-host` | ❌ Kvar att göra | — |
| `promote-host` | ❌ Kvar att göra | — |

### 3.7 Git-historik (relevanta commits)
```
83ed008 fix: delete old envelopes on reassign instead of cancel (unique constraint)
4c16a56 test: cover matching cascade scenarios
0949d57 feat: add repair-matching script
f557088 refactor: route handlers use matching cascade
4cb587e feat: add matching policy warnings
8c81f00 feat: add matching cascade engine
467e342 docs: add ADR-002 matching invariants
c2b31b9 feat: add team/co-organizer link to hamburger menu
```

---

## 4. Utestående

### 4.1 Måste fixas innan Berget 2026

| # | Uppgift | Prio | Estimat |
|---|---------|------|---------|
| 1 | **Fixa 7 failande tester** — MockSupabase saknar `single()` och kedjad query-stöd | 🔴 | 1h |
| 2 | **Koppla cascade till resign-host** | 🔴 | 30min |
| 3 | **Koppla cascade till promote-host** | 🔴 | 30min |
| 4 | **E2E-test mot test-event** — kör alla scenarion mot `14df2533` (6 testpar) | 🔴 | 2h |
| 5 | **UI: "Avsäg värdskap"-knapp** — API finns men knapp saknas | 🟡 | 1h |
| 6 | **UI: Ändra max_guests** — ny endpoint + UI-komponent | 🟡 | 2h |

### 4.2 Bra att ha (ej kritiskt)

| # | Uppgift | Prio |
|---|---------|------|
| 7 | **UI: Varning dubbel-adress** — flagga om 2+ par har samma adress | 🟢 |
| 8 | **HTML-sanitering** — textfält (XSS-risk, men React escaper redan) | 🟢 |
| 9 | **Längdbegränsningar** — max-length på input | 🟢 |
| 10 | **Notis vid allergi-ändring** — flagga i matchningsvyn | 🟢 |
| 11 | **Notis vid blocked pair** — varna att rematch behövs | 🟢 |

### 4.3 Beslut som väntar
- **Berget 2026 setup** — Marcus sa "vänta" med datum/detaljer
- **Repair-scriptet** — ska det köras som cron eller manuellt?

---

## 5. Sammanfattning

**Före:** 7 endpoints med copy-pastad rensningslogik, 4 kritiska buggar, live data ur synk.

**Nu:** 1 gemensam cascade-funktion (535 rader) + policy + ADR + repair-script + tester. Inkopplad i 5/7 endpoints. Duplicate-buggen (root cause) fixad.

**Kvar:** 2 endpoints att koppla, 7 tester att fixa (mock-problem), E2E-verifiering, 2 UI-features.

**Estimat kvar:** ~7 timmar.

---

*Genererad av Molt, 2026-02-24*
