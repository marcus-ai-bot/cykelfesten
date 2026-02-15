# Cykelfesten Wrap-system — Design & Filosofi v2.0

**Datum:** 2026-02-08  
**Status:** Person-baserad refactor  
**Estimat:** ~7h implementation  

---

## 🎯 Designfilosofi

### Varför individuella wraps?
Tidigare: Ett wrap per **par** (couple-based)  
Nu: Ett wrap per **person** (invited + partner separat)

**Skäl:**
1. **Viralt delningspotential** — Folk delar sina egna achievements, inte parets
2. **Personlig stolthet** — "JAG cyklade X km" > "Vi cyklade X km"
3. **Jämförelser** — "Du stod för 65% av totalen!" skapar humor & storytelling
4. **Awards blir roligare** — Båda i paret kan få olika utmärkelser

### Spotify Wrapped-principen
- ✅ **Personifiering** — Namn, stats, DIN story
- ✅ **Storytelling** — Roliga jämförelser ("som från Piteå till Luleå!")
- ✅ **Social trigger** — Dela + "Vilken utmärkelse fick DU?"
- ✅ **Mystery** — Teaser för Wrap 2, drumroll vid reveal
- ✅ **Musik** — Baserat på årtionde, triumfmusik vid award

---

## 📊 Wrap 1 — Kvällssammanfattning

### Nuvarande design (Optimalt)

| Slide | Innehåll | Storytelling-trick |
|-------|----------|-------------------|
| 1 | **"Din kväll"** + namn + datum | Personifiering från start |
| 2 | 🌍 **"Tillsammans cyklade ni X km"** + jämförelse | "Som från Piteå till Luleå!" |
| 3 | 🚴 **"DU cyklade X km"** + procent av total | "Det är 65% av totalen!" |
| 4 | 👥 **"Du träffade X nya människor"** + kontext | "Fler än de flesta får på ett helt år!" |
| 5 | ⚡ **Kortaste cyklingen** (alltid visa!) | "Över tomtgränsen! 😂" |
| 6 | 🏆 **Längsta äventyret** (om >1km) | "[Namn] tog dig på en X km-resa" |
| 7 | 🍽️ **Portioner lagades** + absurd jämförelse | "Det är Y skumtomtar i mat!" |
| 8 | 🌙 **Festen slutade [tid]** | "Ni visste hur man firar!" |
| 9 | 🎁 **Award teaser** | "Du har en UTMÄRKELSE... kl 14:00 🏆" |
| 10 | ✨ **Tack + Dela** | Tydlig CTA + #Cykelfesten |

### Teknisk implementation

```typescript
interface PersonWrapStats {
  name: string;
  totalDistanceKm: number;
  percentOfCouple: number;
  newPeopleMet: number;
  shortestRideM: number;
  longestRideKm: number;
  portionsCooked: number;
  eventEndTime: string;
  awardTitle?: string; // För teaser
  awardEmojiSequence?: string;
}

// Beräkning
const invitedStats = calculatePersonStats(event, couple, 'invited');
const partnerStats = calculatePersonStats(event, couple, 'partner');

// Spara i events.wrap_stats
await updateEventWrapStats(eventId, {
  [coupleId]: {
    invited: invitedStats,
    partner: partnerStats
  }
});
```

### Roliga jämförelser-bibliotek

**Distans:**
- "Som från Piteå till Luleå!" (75 km)
- "Nästan till Luleå!" (60-74 km)
- "Som två varv runt Piteå centrum!" (5-10 km)
- "Nästan över tomtgränsen!" (0.05-0.2 km)

**Nya människor:**
- 6+ personer: "Fler än de flesta får på ett helt år!"
- 4-5 personer: "Det är som en hel festmiddag!"
- 2-3 personer: "Det är minst två nya vänner!"

**Mat:**
- "Det är X skumtomtar i mat!" (1 portion ≈ 1 skumtomt)
- "Det är en hel pizzeria-kväll!" (8+ portioner)

---

## 🏆 Wrap 2 — Award Reveal

### Nuvarande design (Optimalt)

| Slide | Innehåll | Effekt |
|-------|----------|--------|
| 1 | **"🎁 [Namn], du har en utmärkelse!"** | Personlig hälsning |
| 2 | **🥁 Drumroll** | Spänningsmusik (3-5s) |
| 3 | **🏆 "DU ÄR [TITEL]!"** + konfetti | Reveal med explosion |
| 4 | **📊 "Vad det betyder"** + förklaring | Konkret kontext |
| 5 | **🎖️ Badge/diplom** att spara | Shareable graphic |
| 6 | **✨ Dela + CTA** | "Vilken utmärkelse fick DU?" |

### Award-kategorier

**Exempel:**
- 🚴 **"Långfärdsåkaren"** — Längst total distans
- ⚡ **"Express-cyklisten"** — Kortast cykling (<100m)
- 🌍 **"Äventyraren"** — Mest varierande distanser
- 👨‍🍳 **"Masterchef"** — Flest portioner lagade
- 🌙 **"Nattugglan"** — Sist att gå hem
- 🎉 **"Socialitetn"** — Träffade flest nya människor

### Badge-design

```
┌─────────────────────────┐
│    🏆 UTMÄRKELSE 🏆    │
├─────────────────────────┤
│                         │
│   Långfärdsåkaren      │
│                         │
│   Marcus Isaksson      │
│   15.8 km              │
│                         │
│   Cykelfesten 2026     │
│                         │
└─────────────────────────┘
```

**Format:**
- PNG 1080x1920 (Instagram Stories)
- Cykelfesten brand colors
- Delbar som bild

---

## 🎵 Musik-strategi

### Wrap 1 (Kvällssammanfattning)
**Baserat på årtionde:**
- 1970-1979: "September" (Earth, Wind & Fire)
- 1980-1989: "Take On Me" (a-ha)
- 1990-1999: "Wannabe" (Spice Girls)
- 2000-2009: "Yeah!" (Usher)
- 2010-2019: "Happy" (Pharrell)
- 2020+: "Levitating" (Dua Lipa)

**Kriterium:** Genomsnitt av alla gästers födelseår → årtionde

### Wrap 2 (Award Reveal)
**Triumfmusik:**
- Slide 2 (Drumroll): "Drumroll SFX" (3s)
- Slide 3 (Reveal): "Victory Fanfare" eller liknande

---

## 📐 Teknisk arkitektur

### Dataflöde

```
1. Event skapas → wrap_stats = null
2. Matching körs → distanser beräknas
3. Kväll genomförs → värdar loggar tider
4. Event ends → wrap_stats beräknas (batch)
5. /e/[slug]/wrap?person=invited → Hämtar stats
6. /e/[slug]/award?person=partner → Hämtar award
```

### Database schema

```sql
-- events.wrap_stats (JSONB)
{
  "[coupleId]": {
    "invited": {
      "name": "Marcus Isaksson",
      "totalDistanceKm": 15.8,
      "percentOfCouple": 65,
      "newPeopleMet": 6,
      "shortestRideM": 450,
      "longestRideKm": 3.2,
      "portionsCooked": 3,
      "eventEndTime": "23:45",
      "awardTitle": "Långfärdsåkaren",
      "awardEmojiSequence": "🚴🏆"
    },
    "partner": { ... }
  }
}
```

### API Routes

**Befintliga (uppdatera):**
- `GET /api/events/[eventId]/wrap` → Lägg till `?person=invited|partner`
- `GET /api/events/[eventId]/award` → Lägg till `?person=invited|partner`

**Nya (om behövs):**
- `POST /api/events/[eventId]/calculate-wraps` → Batch-beräkning

---

## 🚀 Implementation Plan

### Fas 1: Individuell data (3h)
- [x] Lägg till `wrap_stats` JSONB i `events`
- [ ] Skriv `calculatePersonStats()` function
- [ ] Uppdatera `/wrap` route med `?person=` parameter
- [ ] Uppdatera `/award` route med `?person=` parameter
- [ ] Testa med befintlig testdata

### Fas 2: Storytelling (2h)
- [ ] Skapa jämförelse-bibliotek (distans, mat, folk)
- [ ] Uppdatera Wrap1 slides med roliga kommentarer
- [ ] Lägg till procent-visning ("Du stod för X%")
- [ ] Alltid visa kortaste cykling (även <200m)

### Fas 3: Wrap 2 extra slides (2h)
- [ ] Slide 4: "Vad det betyder"-förklaring
- [ ] Slide 5: Badge/diplom-generator (PNG 1080x1920)
- [ ] Slide 6: Uppdatera CTA ("Vilken utmärkelse fick DU?")
- [ ] Lägg till triumfmusik vid reveal

**Total tid:** ~7h

---

## 🎨 Design-principer

1. **Storytelling > Fakta** — "Som från Piteå till Luleå" > "15.8 km"
2. **Personifiering** — Använd namn överallt
3. **Humor** — "Över tomtgränsen! 😂" > bara siffror
4. **Social proof** — "Fler än de flesta får på ett helt år!"
5. **Shareable** — Tydlig CTA + #Cykelfesten
6. **Mystery** — Teaser → Drumroll → Reveal

---

## 📚 Framtida utveckling

### Potentiella features
- **Jämför med andra** — "Du cyklade mer än 78% av gästerna!"
- **Achievements** — Badges för olika milstolpar
- **Year-over-year** — "Du cyklade 2.3 km mer än förra året!"
- **Livestreaming** — Push-notis vid wrap-release (kl 14:00)

### A/B-testning (framtid)
- Musik: Årtionde vs Genre vs Ingen musik
- Jämförelser: Konkreta (Piteå-Luleå) vs Abstrakta (skumtomtar)
- CTA: "Dela nu!" vs "Vilken utmärkelse fick DU?"

---

## ✅ Success Metrics

**KPI:er:**
- Dela-rate: % som delar Wrap 1 eller 2
- Engagement: Tid på wrap-sidan
- Viral reach: Nya registreringar från delningar
- Award curiosity: % som öppnar Wrap 2

**Mål (första event):**
- 60%+ öppnar Wrap 1
- 40%+ öppnar Wrap 2
- 20%+ delar någon wrap

---

*Dokumentet uppdateras kontinuerligt baserat på user feedback och A/B-tester.*
