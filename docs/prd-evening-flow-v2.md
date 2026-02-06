# PRD: Kvällsflöde med Levande Kuvert

**Version:** 2.0  
**Datum:** 2026-02-06  
**Status:** Draft  

---

## 1. Sammanfattning

Ett engagerande kvällsflöde där kuvertet "lever" och bygger spänning. Ledtrådar släpps successivt och delas muntligt i sällskapet — en social lek som skapar samtalsämnen. Backend styr all timing, anpassad efter cykelavstånd. Ingen kan fuska.

**Kärninsikt:** Ledtrådarna är samtalsämnen. "Vi ska till någon som kan prata baklänges — vem kan det vara?"

---

## 2. Designprinciper

1. **Backend är sanning** — Servern bestämmer vad som visas, när
2. **Social lek** — Ledtrådar delas muntligt, skapar gissningslek
3. **Ingen spoiler** — Olika ledtrådar per rätt för samma värd
4. **Dynamisk timing** — Anpassas efter cykelavstånd
5. **Lekfull ton** — Animationer, spänning, överraskningar

---

## 3. Privacy-modellen: Separata Ledtråds-set

### Problemet
Erik äter förrätt med Lisa. Lisa ska till Familjen Svensson på huvudrätt. Erik har redan träffat Familjen Svensson på sin förrätt. Om Lisa får samma ledtråd som Erik redan hört → Erik spoilar.

### Lösningen
Varje värd registrerar FLERA fun facts. Systemet delar upp dem per rätt.

```
Familjen Svensson registrerar 6 fun facts:
├─ "Kan prata baklänges"
├─ "Har besökt Japan 5 gånger"
├─ "Spelar banjo"
├─ "Tränade judo som barn"
├─ "Samlar på frimärken"
└─ "Bott i Australien"

Systemet delar ut:
├─ FÖRRÄTT-gäster får: "Prata baklänges" + "Judo"
├─ HUVUDRÄTT-gäster får: "Japan" + "Banjo"  
└─ DESSERT-gäster får: "Frimärken" + "Australien"
```

### Teknisk implementation
```sql
-- Utöka fun_facts till array med minst 6 items
-- Allokera index 0-1 till starter, 2-3 till main, 4-5 till dessert
-- Funktion: get_clues_for_course(registration_id, course_type)
```

---

## 4. Tidsflöde per Kuvert

### 4.1 Grundschema (konfigurerbart)

```
T = Rättens starttid

T - 6h      TEASING      "Nyfiken? 🤫"
T - 2h      CLUE_1       📳 Första ledtråden
T - 30min   CLUE_2       📳 Andra ledtråden  
T - 15min   STREET       📳 Gatunamn + husnummerspann
T - 5min    NUMBER       📳 Exakt husnummer
T           OPEN         🎉 Full info + karta
```

### 4.2 Dynamisk timing baserat på avstånd

Cykelavstånd påverkar när gatunamn/nummer släpps:

| Avstånd | Gatunamn | Nummer |
|---------|----------|--------|
| < 1 km | T - 10min | T - 3min |
| 1-3 km | T - 15min | T - 5min |
| 3-5 km | T - 20min | T - 8min |
| > 5 km | T - 25min | T - 10min |

**Beräkning:** Google Maps Directions API → cycling time → justera tider.

### 4.3 Konkret exempel: Förrätt 18:00

```
Avstånd till värd: 2.3 km (8 min cykel)
→ Gatunamn T-15min, Nummer T-5min

12:00   "Nyfiken? 🤫" (klick ger teaser)
16:00   📳 "Värden har bott i Australien"
17:30   📳 "Värden samlar på frimärken"
17:45   📳 "Storgatan, mellan 10-20"
17:55   📳 "Storgatan 14"
18:00   🎉 Full adress + karta + allergier
```

---

## 5. Interaktioner & Animationer

### 5.1 TEASING — Morgonen (T - 6h)

**Kuvert:** Stillastående, neutral färg

**Vid klick:**
```
┌─────────────────────────────────┐
│                                 │
│      ✉️ [kuvertet vickar]       │
│                                 │
│         Nyfiken? 🤫             │
│                                 │
│    Mer händer kl 16:00...       │
│                                 │
└─────────────────────────────────┘
```

- Kuvertet öppnas INTE
- Bara en liten vickanimation + text
- Bygger nyfikenhet

### 5.2 CLUE_1 — Första ledtråden (T - 2h)

**Kuvert:** Vibrerar, glöder svagt

**Indikation:**
- 📳 Kuvertet skakar 3 gånger
- Glödande kant
- Badge: "Ny ledtråd!"

**Vid klick:**
```
┌─────────────────────────────────┐
│      ✉️ [öppnas långsamt]       │
│    ┌────────────────────┐       │
│    │                    │       │
│    │   🔮 LEDTRÅD       │       │
│    │                    │       │
│    │  "Era värdar har   │       │
│    │   bott i           │       │
│    │   Australien"      │       │
│    │                    │       │
│    └────────────────────┘       │
│         [brevet glider ner]     │
│                                 │
│    Nästa ledtråd 17:30 📳       │
└─────────────────────────────────┘
```

**Animation:**
1. Kuvertfliken öppnas (0.3s)
2. Brev glider upp 40% (0.4s)
3. Visa ledtråd (3s)
4. Brev glider ner (0.3s)
5. Kuvert stängs (0.2s)
6. Visa "Nästa ledtråd kl XX:XX"

### 5.3 CLUE_2 — Andra ledtråden (T - 30min)

**Samma animation, nu med båda ledtrådarna:**
```
┌────────────────────────┐
│   🔮 LEDTRÅDAR         │
│                        │
│   • Bott i Australien  │
│   • Samlar frimärken   │
│                        │
│   📍 Adress om 15 min! │
└────────────────────────┘
```

### 5.4 STREET — Gatunamn (T - 15min, dynamiskt)

**Kuvert:** Vibrerar mer intensivt

```
┌────────────────────────┐
│   🔮 LEDTRÅDAR         │
│                        │
│   • Bott i Australien  │
│   • Samlar frimärken   │
│                        │
│   📍 Storgatan 10-20   │
│      (8 min cykel)     │
│                        │
│   🔢 Nummer om 10 min! │
└────────────────────────┘
```

### 5.5 NUMBER — Husnummer (T - 5min, dynamiskt)

```
┌────────────────────────┐
│   🔮 LEDTRÅDAR         │
│                        │
│   • Bott i Australien  │
│   • Samlar frimärken   │
│                        │
│   📍 Storgatan 14      │
│      (8 min cykel)     │
│                        │
│   🗺️ [Öppna karta]     │
│                        │
│   ⏱️ Förrätt om 5 min! │
└────────────────────────┘
```

### 5.6 OPEN — Full reveal (T)

**Stor animation:**
1. Kuvertet "exploderar" uppåt
2. Kort konfetti-burst
3. Brevet vecklas ut helt

```
┌─────────────────────────────────┐
│                                 │
│   🎉 FÖRRÄTT                    │
│                                 │
│   📍 Storgatan 14, lgh 1102     │
│      Portkod: 4521              │
│                                 │
│   🗺️ [Navigera hit]             │
│                                 │
│   ⚠️ Allergier i ert sällskap:  │
│   • Glutenfritt (1 gäst)        │
│   • Laktos (2 gäster)           │
│                                 │
│   👋 Välkomna!                  │
│                                 │
│   ─────────────────────────     │
│   📧 Huvudrätt öppnar 19:15     │
└─────────────────────────────────┘
```

---

## 6. Under Kvällen — Löpande Ledtrådar

### 6.1 Parallellt flöde

Medan du äter förrätt börjar huvudrätt-kuvertet leva:

```
18:00   FÖRRÄTT börjar
        └─ Huvudrätt-kuvert: "Nyfiken? 🤫"
        
18:15   └─ 📳 Ledtråd 1 för huvudrätt

18:30   └─ 📳 Ledtråd 2 för huvudrätt

18:45   └─ Fortsätter var 15:e min...

19:00   └─ 📳 Gatunamn + spann

19:10   └─ 📳 Husnummer

19:15   HUVUDRÄTT börjar
        └─ Dessert-kuvert vaknar...
```

### 6.2 Samtalsämnen under måltiden

**Förrätt:**
- "Jag fick just en ledtråd för nästa ställe!"
- "Min säger att någon samlar frimärken..."
- "Vi ska till Parkvägen nånstans!"

**Huvudrätt:**
- "Nu vet jag gatan för desserten!"
- "Vem kan det vara som spelat banjo?"

### 6.3 Admin-konfiguration

```
Event Settings:
├─ Ledtrådar under måltid: Var 15 min ☑️
├─ Gatunamn: 15 min innan (auto-justeras för avstånd) ☑️
├─ Husnummer: 5 min innan (auto-justeras för avstånd) ☑️
└─ Avståndsjustering: Aktiverad ☑️
```

---

## 7. Backend-arkitektur

### 7.1 API: `/api/envelope/status`

**Request:**
```
GET /api/envelope/status?eventId=xxx&participantId=yyy
```

**Response:**
```json
{
  "serverTime": "2026-03-15T17:45:00Z",
  "courses": [
    {
      "type": "starter",
      "state": "STREET",
      "clues": [
        { "text": "Bott i Australien", "revealedAt": "16:00" },
        { "text": "Samlar frimärken", "revealedAt": "17:30" }
      ],
      "street": {
        "name": "Storgatan",
        "range": "10-20",
        "cycleMinutes": 8
      },
      "number": null,
      "fullAddress": null,
      "nextReveal": {
        "type": "NUMBER",
        "at": "2026-03-15T17:55:00Z",
        "inSeconds": 600
      },
      "startsAt": "2026-03-15T18:00:00Z"
    },
    {
      "type": "main",
      "state": "TEASING",
      "clues": [],
      "nextReveal": {
        "type": "CLUE_1",
        "at": "2026-03-15T18:15:00Z"
      }
    },
    {
      "type": "dessert",
      "state": "LOCKED",
      "activatesAt": "2026-03-15T19:15:00Z"
    }
  ],
  "afterparty": {
    "state": "LOCKED",
    "revealsAt": "2026-03-15T22:30:00Z",
    "location": null
  }
}
```

### 7.2 Datamodell

```sql
-- Event timing templates
CREATE TABLE event_timing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES events(id),
  
  -- Relative timing (minutes before course start)
  teasing_before INT DEFAULT 360,      -- 6h
  clue_1_before INT DEFAULT 120,       -- 2h
  clue_2_before INT DEFAULT 30,        -- 30min
  street_before INT DEFAULT 15,        -- 15min (base)
  number_before INT DEFAULT 5,         -- 5min (base)
  
  -- During-meal clues
  clue_interval_minutes INT DEFAULT 15,
  
  -- Distance adjustment
  distance_adjustment_enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Clue allocation per course
CREATE TABLE course_clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id),
  course_type TEXT NOT NULL, -- 'starter', 'main', 'dessert'
  clue_indices INT[] NOT NULL, -- Which fun_fact indices to use
  
  UNIQUE(registration_id, course_type)
);

-- Street ranges (for partial reveal)
CREATE TABLE street_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id),
  street_name TEXT,
  street_number INT,
  number_range_low INT,  -- e.g., 10
  number_range_high INT, -- e.g., 20
  
  UNIQUE(registration_id)
);
```

### 7.3 Ledtråds-allokering

```typescript
// Vid matchning, allokera ledtrådar per rätt
function allocateClues(hostRegistration: Registration) {
  const funFacts = hostRegistration.invited_fun_facts || [];
  const partnerFacts = hostRegistration.partner_fun_facts || [];
  const allFacts = [...funFacts, ...partnerFacts];
  
  // Minst 6 facts behövs för unika ledtrådar per rätt
  if (allFacts.length < 6) {
    // Fallback: använd genererade ledtrådar (ålder, avstånd)
  }
  
  // Fördela: 0-1 → starter, 2-3 → main, 4-5 → dessert
  return {
    starter: [allFacts[0], allFacts[1]].filter(Boolean),
    main: [allFacts[2], allFacts[3]].filter(Boolean),
    dessert: [allFacts[4], allFacts[5]].filter(Boolean)
  };
}
```

### 7.4 Avståndsberäkning

```typescript
async function calculateTiming(
  fromAddress: string, 
  toAddress: string,
  baseTiming: EventTiming
): Promise<CourseTiming> {
  
  const cycleMinutes = await getCyclingTime(fromAddress, toAddress);
  
  // Justera gatunamn/nummer-reveal baserat på avstånd
  let streetBefore = baseTiming.street_before;
  let numberBefore = baseTiming.number_before;
  
  if (cycleMinutes > 15) {
    streetBefore = Math.max(streetBefore, cycleMinutes + 10);
    numberBefore = Math.max(numberBefore, cycleMinutes);
  } else if (cycleMinutes > 8) {
    streetBefore = Math.max(streetBefore, cycleMinutes + 5);
    numberBefore = Math.max(numberBefore, cycleMinutes - 3);
  }
  
  return { streetBefore, numberBefore, cycleMinutes };
}
```

---

## 8. Admin-gränssnitt

### 8.1 Timing Editor

```
┌─────────────────────────────────────────────────────┐
│ ⏱️ Timing-inställningar                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Standard-timing (innan rätt startar):               │
│ ├─ "Nyfiken?":        [6] timmar innan             │
│ ├─ Ledtråd 1:         [2] timmar innan             │
│ ├─ Ledtråd 2:         [30] minuter innan           │
│ ├─ Gatunamn:          [15] minuter innan           │
│ └─ Husnummer:         [5] minuter innan            │
│                                                     │
│ Under måltiden:                                     │
│ └─ Ny ledtråd var:    [15] minuter                 │
│                                                     │
│ ☑️ Auto-justera för cykelavstånd                    │
│   (Längre avstånd → tidigare gatunamn/nummer)       │
│                                                     │
│ [💾 Spara]                                          │
└─────────────────────────────────────────────────────┘
```

### 8.2 Live-vy under event

```
┌─────────────────────────────────────────────────────┐
│ 🔴 LIVE — Middag 15 mars                 18:47     │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Nuvarande fas: FÖRRÄTT (startat 18:00)              │
│                                                     │
│ Kuvert-status (12 par):                             │
│ ┌─────────────────────────────────────────────┐     │
│ │ FÖRRÄTT    █████████████████████████ 12/12  │     │
│ │ HUVUDRÄTT  ████████░░░░░░░░░░░░░░░░░  4/12  │     │
│ │ DESSERT    ░░░░░░░░░░░░░░░░░░░░░░░░░  0/12  │     │
│ └─────────────────────────────────────────────┘     │
│                                                     │
│ Nästa release: Huvudrätt ledtråd 2 om 13 min        │
│                                                     │
│ [⚡ Släpp nästa nu]  [📢 Push till alla]            │
└─────────────────────────────────────────────────────┘
```

---

## 9. Animationer — Teknisk spec

### 9.1 Kuvert-states (Framer Motion)

```typescript
const envelopeVariants = {
  // Stillastående
  idle: { 
    scale: 1, 
    rotate: 0,
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
  },
  
  // Nyfiken-vick
  curious: {
    rotate: [-3, 3, -2, 2, 0],
    transition: { duration: 0.5 }
  },
  
  // Vibration vid ny ledtråd
  vibrate: {
    x: [-2, 2, -2, 2, -1, 1, 0],
    boxShadow: [
      "0 0 0 rgba(255,200,0,0)",
      "0 0 20px rgba(255,200,0,0.5)",
      "0 0 0 rgba(255,200,0,0)"
    ],
    transition: { duration: 0.6 }
  },
  
  // Öppning
  opening: {
    scale: 1.02,
    transition: { duration: 0.3 }
  }
};

const flapVariants = {
  closed: { rotateX: 0 },
  open: { 
    rotateX: -170,
    transition: { duration: 0.4, ease: "easeOut" }
  }
};

const letterVariants = {
  hidden: { y: 0 },
  peek: { 
    y: -60,
    transition: { duration: 0.4, ease: "easeOut" }
  },
  full: {
    y: -120,
    scale: 1.1,
    transition: { duration: 0.5 }
  },
  retract: {
    y: 0,
    transition: { duration: 0.3 }
  }
};
```

### 9.2 Konfetti vid full reveal

```typescript
import confetti from 'canvas-confetti';

function celebrateReveal() {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.7 },
    colors: ['#FFD700', '#FF6B6B', '#4ECDC4']
  });
}
```

---

## 10. Krav för Fun Facts

### 10.1 Minst 6 per värdpar

För att garantera unika ledtrådar per rätt behöver varje värdpar registrera minst 6 fun facts (tillsammans).

**Registrerings-UI:**
```
┌─────────────────────────────────────────────┐
│ 🎭 Roliga fakta om er (minst 6)             │
│                                             │
│ Dessa används som ledtrådar för gästerna!   │
│ De får gissa vem ni är under kvällen.       │
│                                             │
│ 1. [Har bott i Australien_________] ✓      │
│ 2. [Samlar på frimärken___________] ✓      │
│ 3. [Spelar banjo_________________] ✓      │
│ 4. [Kan 50 landskapsvapen________] ✓      │
│ 5. [Tränade judo som barn________] ✓      │
│ 6. [Åkt Vasaloppet 3 gånger______] ✓      │
│ 7. [____________________________]          │
│                                             │
│ Tips: Blanda lätt + svårt, seriöst + kul   │
│                                             │
│ ✅ 6/6 minimum uppfyllt!                    │
└─────────────────────────────────────────────┘
```

### 10.2 Fallback-ledtrådar

Om någon registrerat färre än 6:
- Åldersbaserade ("Värden minns när ABBA vann Eurovision")
- Avståndsbaserade ("12 min cykel härifrån")
- Generiska ("Värden älskar god mat")

---

## 11. Säkerhet

### 11.1 Ingen klient-tid
- All state beräknas server-side med `NOW()`
- Klienten får bara det den ska se
- Ändrar användaren telefonklockan → ingen effekt

### 11.2 Participant-isolation
- Kan bara se egna kuvert
- Signerad URL eller JWT med participant-ID
- Rate limiting: 1 req/sek

### 11.3 Spoiler-skydd
- Olika ledtrådar per rätt → ingen kan spoila
- Ledtrådar genereras vid matchning, inte vid reveal

---

## 12. Milstolpar

### M1: Datamodell & API (1 dag)
- [ ] Utöka fun_facts till minst 6
- [ ] `event_timing` tabell
- [ ] `course_clues` tabell
- [ ] `/api/envelope/status` endpoint

### M2: Ledtråds-allokering (0.5 dag)
- [ ] Allokera ledtrådar vid matchning
- [ ] Fallback för < 6 fun facts

### M3: Kuvert-animationer (2 dagar)
- [ ] Nyfiken-vick
- [ ] Vibration vid ny ledtråd
- [ ] Öppning med letter-peek
- [ ] Full reveal med konfetti

### M4: State-maskinen (1 dag)
- [ ] TEASING → CLUE_1 → CLUE_2 → STREET → NUMBER → OPEN
- [ ] Polling med server-sync
- [ ] Avståndsbaserad timing

### M5: Admin-timing (0.5 dag)
- [ ] Timing editor UI
- [ ] Live-vy under event

### M6: Test & polish (1 dag)
- [ ] End-to-end test hela kvällen
- [ ] Edge cases
- [ ] Performance

**Total: ~6 dagar**

---

## 13. Öppna frågor

1. **Hur många fun facts minst?** Förslag: 6 (2 per rätt)
2. **Vad händer om par hoppar av?** Ny allokering av ledtrådar?
3. **Push-notiser vid vibration?** Eller bara i-app?
4. **Hur lång peek-tid?** 3 sek? Konfigurerbart?

---

## 14. Framtida utökningar

- **Gissningslek:** "Vem tror du det är?" → poäng om rätt
- **Foto-delning:** Ladda upp selfie vid varje stopp
- **Social feed:** Se allas kvällar efteråt
- **Achievements:** "Gissade rätt värd 3/3 gånger!"

---

*Dokument skapat av Molt, 2026-02-06 02:35*
