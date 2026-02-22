# Dashboard UX-redesign — Spec

**Task:** #199 (Kanban-Molt)
**Status:** Inkorg
**Datum:** 2026-02-22

---

## Bakgrund

Nuvarande dashboard har 4 statiska "vanity"-kort (Anmälda, Värdar, Kuvert, Dagar kvar) som inte är actionable. Settings är en dumping ground. Gästhantering finns inte som vy. Ingen cancellation-hantering finns.

## Beslut

### Godkännande-flöde
- Nya anmälningar → status **"väntar"** (kräver godkännande)
- Arrangören godkänner/nekar i gästlistan
- Batch-godkännande tillgängligt

### Registreringsfält (nya)
- **`guest_only`** — "Vi har inte möjlighet att ta emot gäster hemma"
  - Inkluderande formulering, kopplat till fysiska begränsningar
  - Checkbox, ej obligatorisk, neutral ton
- **`accessibility_ok`** — REDAN FINNS — "Vårt hem är tillgängligt (hiss/markplan)"
  - Detta är för GÄSTERNAS behov, inte värdskap
  - Matchningen ska respektera: gäst med accessibility_needs → värd med accessibility_ok=true
- **`accessibility_needs`** — REDAN FINNS — fritext, individnivå
  - Ska visas vackert i UI, inte som en begränsning utan som en feature ❤️

### Reserve-system
- `role='reserve'` redan implementerat ✅
- Reserve API finns (`POST /api/admin/reserve`: set_reserve, activate, list)
- Aktiveras manuellt av arrangör
- Vid aktivering → omatchning ELLER manuell placering

### Cancellation-flöde
- **Före notifiering** → fri omatchning
- **Efter notifiering** → LÅST (default), manuell justering
- **Vid värdavhopp:**
  1. Visa gäster som behöver ny värd
  2. Arrangören väljer: flytta till annan värd / aktivera reserv
  3. Option: skicka meddelande till värdpar på samma rätt ("kan ni ta ett extra par?")
- Manuell omflyttning av gäster mellan värdar (drag-drop eller dropdown)

### Dashboard-struktur
- 4 kort → **BORT**, ersätts av fasmedveten statusrad
- Gästhantering = **Inbjudan-fasen** (ej separat sida)
- Settings → **hamburger-meny**
- **3 fas-tabbar**: Inbjudan, Middag, Efteråt
- Max 100 par, paginering ej nödvändigt

## Ny struktur

### Topbar (mobil)
```
┌──────────────────────────────────┐
│ Berget 2026                  ☰  │
│ 🟢 Matchad · 3 okt · 223 dagar │
└──────────────────────────────────┘
```
Statusraden ändras dynamiskt:
- Pre-event: `🟡 Öppen · 52/57 godkända · 223 dagar`
- Matchad: `🟢 Matchad · 57 par · 223 dagar`
- Eventdagen: `🔴 LIVE · Förrätt pågår`
- Post-event: `🏁 Avslutad · Wraps ej skickade`

### Hamburger (☰)
- 🏠 Alla fester
- ✉️ Inbjudan
- 🍽️ Middag
- 🎬 Efteråt
- ⚙️ Inställningar
- 🔗 Öppna gästsida ↗

### Inbjudan-fasen = Gästhantering
**Statusruta:**
- Progress bar: "52 godkända av 57 anmälda (91%)"
- Badges: "3 väntar · 2 inkompletta"

**Registreringslänk:**
- URL med kopiera/dela/QR
- Öppen/Stängd toggle

**Gästlista med filter:**
- [Alla] [Väntar] [Inkompletta] [Saknar FF]
- Sök
- Per par: status, adress, fun facts, värdpreferens, accessibility
- Batch: Godkänn alla, Skicka påminnelse

### Middag-fasen
- Befintligt: Kuvert & Timing, Kuvertmeddelanden, Live-karta
- **Nytt:** Cancellation-flöde

### Efteråt-fasen
- Wraps + Awards (befintligt, redan bra)

## Kodkartläggning

| Koncept | Status | Detaljer |
|---------|--------|----------|
| `role` (normal/reserve) | ✅ Finns | Reserve API komplett |
| `cancelled`/`cancelled_at` | ✅ Finns | Matchningen filtrerar |
| `confirmed` | ✅ Finns | Magic link-bekräftelse |
| `course_preference` | ✅ Finns | Registreringsfråga |
| `accessibility_ok` | ✅ Finns | "Hemmet tillgängligt" |
| `accessibility_needs` | ✅ Finns | Individens behov |
| `guest_only` | ❌ Saknas | Nytt fält i couples |
| `max_extra_guests` | ❌ Saknas | Behövs för cancellation |
| Manuell omflyttning | ❌ Saknas | Ny UI behövs |

## Byggordning

1. Gästlista i Inbjudan-fasen
2. Statusrad (fasmedveten, ersätter kort)
3. Hamburger-meny (mobil)
4. Kollapsbar event-header
5. guest_only-fält i registrering
6. Godkännandeflöde (väntar-status default)
7. Batch-actions i gästlistan
8. Cancellation-flöde i Middag
9. Manuell omflyttning gäster mellan värdar
10. Tillgänglighetsanpassning synlig och vacker
11. Settings → hamburger
12. Ta bort 4 stat-kort
