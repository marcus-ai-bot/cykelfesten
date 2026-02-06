# PRD: Kvällsflöde med Levande Kuvert

**Version:** 1.0  
**Datum:** 2026-02-06  
**Status:** Draft  

---

## 1. Sammanfattning

Skapa ett engagerande kvällsflöde där kuvertet "lever" och bygger spänning genom dagen. Backend styr all information — ingen klient-tid, ingen fusk. Ledtrådar släpps successivt tills adressen avslöjas.

---

## 2. Designprinciper

1. **Backend är sanning** — Servern bestämmer vad som visas, när
2. **Aldrig namn** — Bara ledtrådar tills reveal
3. **Spänning över tid** — Kuvertet utvecklas genom dagen
4. **Omöjligt att fuska** — Ingen klient-logik för timing
5. **Lekfull ton** — Animationer, humor, överraskningar

---

## 3. Kuvertets Livscykel

### 3.1 Tillstånd (States)

```
SEALED      → Kuvertet är stängt, ingen info tillgänglig
TEASING     → Kan klickas, visar kort ledtråd, stängs igen  
HINTS       → Vibrerar vid nya ledtrådar, fler avslöjas
REVEALING   → Countdown till reveal, sista ledtrådarna
OPEN        → Full info synlig (adress, karta, allergier)
TRANSITIONING → Mellan rätter, visar nästa kuvert
COMPLETED   → Rätten är avklarad
```

### 3.2 Tidsexempel (konfigurerbart per event)

```
Event: Middag 2026-03-15

FÖRRÄTT:
├─ 08:00  TEASING    — "Klicka för en ledtråd..."
├─ 12:00  HINTS      — Kuvert vibrerar, ny ledtråd
├─ 15:00  HINTS      — Vibrerar igen, ännu en ledtråd  
├─ 17:00  REVEALING  — Countdown synlig, sista ledtråden
├─ 17:30  OPEN       — Adress avslöjas!
└─ 19:15  COMPLETED  — Grön bock, nästa kuvert aktiveras

HUVUDRÄTT:
├─ 17:30  TEASING    — Andra kuvertet vaknar
├─ 18:30  HINTS      — Ledtrådar börjar
├─ 19:00  REVEALING  — Countdown
├─ 19:15  OPEN       — Adress för huvudrätt
└─ 21:00  COMPLETED  

DESSERT:
├─ 19:15  TEASING    
├─ 20:00  HINTS      
├─ 20:45  REVEALING  
├─ 21:00  OPEN       
└─ 22:30  COMPLETED  

EFTERFEST:
├─ 21:00  TEASING    
├─ 22:00  REVEALING  
└─ 22:30  OPEN       — Alla samlas!
```

---

## 4. Interaktioner & Animationer

### 4.1 SEALED — Stängt kuvert
```
┌─────────────────────────────┐
│                             │
│      📧 (grått kuvert)      │
│                             │
│   "Kvällen har inte        │
│    börjat ännu..."          │
│                             │
└─────────────────────────────┘
```
- Kuvertet är grått/dämpat
- Klick ger ingen respons (eller liten skakning "inte än!")

### 4.2 TEASING — Första interaktion

**Vid klick:**
1. Kuvertet vickar lite (excitement)
2. Fliken öppnas långsamt (0.5s)
3. Ett brev glider upp ~20% (peek)
4. Visar EN ledtråd med rolig text
5. Brevet glider ner igen
6. Kuvertet stängs
7. Text: "Mer avslöjas kl 12:00..."

**Ledtråd-exempel (förrätt):**
```
┌─────────────────────────────┐
│     ✉️ (kuvert öppnas)      │
│    ┌──────────────┐         │
│    │ 🏠 Ledtråd:  │         │
│    │              │         │
│    │ "De har en   │         │
│    │  röd dörr"   │         │
│    └──────────────┘         │
│                             │
│   Mer kl 12:00... 🕐        │
└─────────────────────────────┘
```

### 4.3 HINTS — Nya ledtrådar släpps

**Vibration vid ny ledtråd:**
- Kuvertet skakar lätt (CSS animation, 2-3 pulser)
- Glöd-effekt runt kanten
- Badge: "Ny ledtråd!"

**Vid klick (nu med flera ledtrådar):**
```
┌─────────────────────────────┐
│    ┌──────────────────┐     │
│    │ 🏠 Ledtrådar:    │     │
│    │                  │     │
│    │ • Röd dörr       │     │
│    │ • 5 min promenad │     │
│    │ • Nära parken    │     │
│    │                  │     │
│    │ 📍 Reveal 17:30  │     │
│    └──────────────────┘     │
│                             │
│   Nästa ledtråd kl 15:00    │
└─────────────────────────────┘
```

### 4.4 REVEALING — Countdown

**Sista minuter innan reveal:**
```
┌─────────────────────────────┐
│                             │
│   ✉️ KUVERTET ÖPPNAS OM     │
│                             │
│        ⏱️ 04:32             │
│                             │
│   Ledtrådar:                │
│   • Röd dörr                │
│   • 5 min promenad          │
│   • Nära parken             │
│   • Hund som skäller        │
│                             │
│   🎉 Snart avslöjas allt!   │
└─────────────────────────────┘
```

- Countdown tickar (syncar med server var 30:e sek)
- Kuvertet "andas" (subtil scale animation)
- Vid 60 sek: kuvertet börjar glöda

### 4.5 OPEN — Full reveal

**Automatisk animation vid rätt tid:**
1. Kuvertet exploderar upp (festlig animation)
2. Konfetti (subtle, kort)
3. Brevet vecklas ut
4. Full info visas

```
┌─────────────────────────────┐
│   🎉 FÖRRÄTT                │
│                             │
│   📍 Storgatan 5            │
│      Lägenhet 3B            │
│                             │
│   👋 Era värdar väntar!     │
│                             │
│   🗺️ [Öppna i kartan]       │
│                             │
│   ⚠️ Allergier att tänka på:│
│   • Glutenfritt (1 gäst)    │
│   • Nötter (1 gäst)         │
│                             │
│   ⏱️ Huvudrätt öppnas 19:15 │
└─────────────────────────────┘
```

**Notera:** 
- Fortfarande INGA NAMN på värdar
- Allergier aggregerade (inte "Lisa är glutenfri")
- Nästa kuvert teasas

### 4.6 TRANSITIONING — Mellan rätter

**Efter förrätt, innan huvudrätt öppnas:**
```
┌─────────────────────────────┐
│   ✅ Förrätt — Avklarat!    │
│                             │
│   📧 Huvudrätt              │
│   [Kuvert med ledtrådar]    │
│                             │
│   📧 Dessert                │
│   [Låst kuvert]             │
│                             │
│   🎉 Efterfest 22:30        │
│   [Låst]                    │
└─────────────────────────────┘
```

---

## 5. Ledtrådar — Typer & Generering

### 5.1 Ledtrådstyper

| Typ | Exempel | Källa |
|-----|---------|-------|
| **Avstånd** | "8 minuters promenad" | Google Maps API |
| **Riktning** | "Nordväst om dig" | Koordinater |
| **Närmiljö** | "Nära ICA Maxi" | Manuell eller API |
| **Bostad** | "Röd dörr", "3:e våningen" | Värdens input |
| **Ålder** | "Värden minns Berlinmurens fall" | Födelseår |
| **Fun facts** | "Värden har mass-ätit pizza i Milano" | Mystery profile |
| **Husdjur** | "En vänlig hund bor här" | Registrering |

### 5.2 Ledtrådssekvens (exempel)

```
08:00 — TEASING (1 ledtråd)
        "Era värdar har rest till fler än 10 länder"

12:00 — HINTS (2 ledtrådar)  
        + "Ungefär 7 minuters promenad från torget"

15:00 — HINTS (3 ledtrådar)
        + "De bor i närheten av en park"

17:00 — REVEALING (4 ledtrådar)
        + "Leta efter en blå port"

17:30 — OPEN
        Full adress avslöjas!
```

### 5.3 Konfiguration per event

Admin kan sätta:
- Antal ledtrådar per fas
- Vilka typer av ledtrådar som används
- Anpassade ledtrådar per värd
- Timing för varje fas

---

## 6. Backend-arkitektur

### 6.1 API: `/api/envelope/[eventId]/[participantId]`

**Request:**
```
GET /api/envelope/abc123/user456
```

**Response:**
```json
{
  "courses": [
    {
      "type": "starter",
      "state": "HINTS",
      "clues": [
        "Era värdar har rest till 10+ länder",
        "7 min promenad från torget"
      ],
      "nextClueAt": "2026-03-15T15:00:00Z",
      "revealsAt": "2026-03-15T17:30:00Z",
      "vibrating": true
    },
    {
      "type": "main",
      "state": "SEALED",
      "clues": [],
      "activatesAt": "2026-03-15T17:30:00Z"
    },
    {
      "type": "dessert", 
      "state": "SEALED",
      "clues": [],
      "activatesAt": "2026-03-15T19:15:00Z"
    }
  ],
  "afterparty": {
    "state": "SEALED",
    "revealsAt": "2026-03-15T22:30:00Z"
  },
  "serverTime": "2026-03-15T14:23:45Z"
}
```

### 6.2 Datamodell (tillägg)

```sql
-- Event timing configuration
CREATE TABLE event_schedule (
  id UUID PRIMARY KEY,
  event_id UUID REFERENCES events(id),
  course_type TEXT, -- 'starter', 'main', 'dessert', 'afterparty'
  teasing_at TIMESTAMPTZ,
  hints_at TIMESTAMPTZ[], -- Array of times for each hint
  revealing_at TIMESTAMPTZ,
  opens_at TIMESTAMPTZ,
  completes_at TIMESTAMPTZ
);

-- Custom clues per host
CREATE TABLE host_clues (
  id UUID PRIMARY KEY,
  registration_id UUID REFERENCES registrations(id),
  clue_type TEXT, -- 'custom', 'home', 'neighborhood'
  clue_text TEXT,
  reveal_order INT -- Which hint phase to show this
);
```

### 6.3 Säkerhet

- **Ingen klient-tid** — Server bestämmer state baserat på `NOW()`
- **Participant-specifik** — Kan bara se egna kuvert
- **Rate limiting** — Max 1 request/sekund per användare
- **Signerade tokens** — Participant ID i JWT eller signerad URL

---

## 7. Admin-gränssnitt

### 7.1 Event Schedule Editor

```
┌─────────────────────────────────────────────┐
│ 📅 Kvällsschema — Middag 15 mars            │
├─────────────────────────────────────────────┤
│                                             │
│ FÖRRÄTT                                     │
│ ├─ Teasing börjar:  08:00  [redigera]      │
│ ├─ Ledtråd 2:       12:00  [redigera]      │
│ ├─ Ledtråd 3:       15:00  [redigera]      │
│ ├─ Ledtråd 4:       17:00  [redigera]      │
│ ├─ Reveal:          17:30  [redigera]      │
│ └─ Avslut:          19:15  [redigera]      │
│                                             │
│ [+ Lägg till ledtrådstid]                   │
│                                             │
│ HUVUDRÄTT                                   │
│ ├─ Teasing börjar:  17:30  (auto)          │
│ └─ ...                                      │
│                                             │
│ [💾 Spara schema]                           │
└─────────────────────────────────────────────┘
```

### 7.2 Live Dashboard (under event)

```
┌─────────────────────────────────────────────┐
│ 🔴 LIVE — Middag 15 mars                    │
├─────────────────────────────────────────────┤
│                                             │
│ Klockan: 18:45                              │
│ Fas: FÖRRÄTT (pågår)                        │
│                                             │
│ Kuvert-status:                              │
│ ├─ 12/12 har öppnat förrätt ✅              │
│ ├─ 8/12 har tittat på huvudrätt-ledtrådar  │
│ └─ 0/12 har sett dessert (låst)            │
│                                             │
│ [⚡ Tvinga nästa fas]  [📢 Skicka notis]    │
└─────────────────────────────────────────────┘
```

---

## 8. Animationer — Teknisk spec

### 8.1 CSS Keyframes

```css
/* Kuvert vibration vid ny ledtråd */
@keyframes envelope-vibrate {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-2deg); }
  75% { transform: rotate(2deg); }
}

/* Kuvert "andning" under revealing */
@keyframes envelope-breathe {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.02); }
}

/* Glöd-effekt */
@keyframes envelope-glow {
  0%, 100% { box-shadow: 0 0 5px rgba(255,200,0,0.3); }
  50% { box-shadow: 0 0 20px rgba(255,200,0,0.6); }
}

/* Öppning animation */
@keyframes envelope-open {
  0% { transform: rotateX(0deg); }
  100% { transform: rotateX(-180deg); }
}

/* Brev peek */
@keyframes letter-peek {
  0% { transform: translateY(0); }
  50% { transform: translateY(-30%); }
  100% { transform: translateY(0); }
}
```

### 8.2 Framer Motion Variants

```typescript
const envelopeVariants = {
  sealed: { scale: 1, rotate: 0 },
  teasing: { scale: 1.02, rotate: [-1, 1, 0] },
  vibrating: { 
    rotate: [-2, 2, -2, 2, 0],
    transition: { duration: 0.5 }
  },
  revealing: {
    scale: [1, 1.02, 1],
    transition: { repeat: Infinity, duration: 2 }
  },
  opening: {
    rotateX: -180,
    transition: { duration: 0.8, ease: "easeOut" }
  }
};
```

---

## 9. Tekniska krav

### 9.1 Performance
- API-svar < 200ms
- Animationer 60fps
- Offline-tolerant (visa senast kända state)

### 9.2 Sync
- Polling var 30:e sekund under REVEALING
- Server-sent events (SSE) som uppgradering senare
- Klient visar serverTime, inte lokal tid

### 9.3 Tillgänglighet
- Animationer respekterar `prefers-reduced-motion`
- Skärmläsarvänlig state-beskrivning
- Fungerar utan JavaScript (visar statisk info)

---

## 10. Milstolpar

### M1: Backend API (2 dagar)
- [ ] `/api/envelope` endpoint
- [ ] State-beräkning baserat på server-tid
- [ ] Event schedule datamodell
- [ ] Ledtråds-generator

### M2: Kuvert-animationer (2 dagar)
- [ ] SEALED → TEASING animation
- [ ] Letter peek med ledtråd
- [ ] Vibration vid ny ledtråd
- [ ] REVEALING countdown

### M3: Full reveal (1 dag)
- [ ] OPEN animation med konfetti
- [ ] Adress + karta + allergier
- [ ] Transition mellan rätter

### M4: Admin schedule editor (1 dag)
- [ ] UI för att sätta tider
- [ ] Live preview

### M5: Polish & test (1 dag)
- [ ] Testa hela flödet
- [ ] Edge cases (sen ankomst, etc)
- [ ] Performance-optimering

**Total: ~7 dagar**

---

## 11. Öppna frågor

1. **Ska värdar se samma countdown?** Eller får de full info direkt?
2. **Vad händer om någon missar en reveal?** Visa "du missade öppningen, här är info"?
3. **Push-notiser?** Vid nya ledtrådar? Vid reveal?
4. **Hur lång peek-tid?** 3 sekunder? Eller tills användaren stänger?

---

## 12. Framtida utökningar

- **Achievements:** "Du gissade rätt värd!" 🏆
- **Gissningslek:** Gissa vem värden är baserat på ledtrådar
- **Foto-delning:** Ladda upp bild från varje rätt
- **Social feed:** Se andras kvällar (efter event)

---

*Dokument skapat av Molt, 2026-02-06 02:15*
