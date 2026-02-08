# PRD: Personal Wraps v2 - Individual Person-Based Experience

**Version:** 2.0  
**Created:** 2026-02-08  
**Status:** Ready for Implementation  
**Estimated Work:** 8-12 hours

## Executive Summary

Transform wraps from couple-based to **individual person-based** experiences. Each person (invited + partner separately) gets their own personalized Spotify Wrapped-style story with:
- Their name everywhere
- Their individual statistics with % of total
- Fun comparisons ("som från Piteå till Luleå")
- Always show shortest ride (even <200m) for storytelling
- Enhanced award reveal with explanation, badge, and social sharing
- Strong CTA for sharing with hashtag

## Current State (Couple-Based)

### URL Structure
```
/e/[slug]/wrap?coupleId=xxx          → Shows couple data
/e/[slug]/award?coupleId=xxx         → Shows couple award
```

### Data Structure
- `WrapData.couple_name` (e.g., "Marcus & Ingela")
- Single stats per couple
- Generic "you" in text

## Target State (Person-Based)

### URL Structure
```
/e/[slug]/wrap?coupleId=xxx&person=invited    → Marcus's wrap
/e/[slug]/wrap?coupleId=xxx&person=partner    → Ingela's wrap
/e/[slug]/award?coupleId=xxx&person=invited   → Marcus's award
/e/[slug]/award?coupleId=xxx&person=partner   → Ingela's award
```

### Data Structure
```typescript
interface WrapData {
  person_name: string;              // "Marcus" (not "Marcus & Ingela")
  event_name: string;
  event_date: string;
  distance_km: number;              // Individual distance
  distance_percent: number;         // % of total event distance
  people_met: number;               // Individual count
  music_decade: string;             // From individual fun_facts
  wrap_stats: WrapStats | null;     // Event-level aggregate
  has_award: boolean;
  is_longest_rider: boolean;        // Did THIS person cycle most?
}

interface AwardData {
  person_name: string;              // "Marcus" (not couple)
  event_name: string;
  award: Award;
  value: string | null;
  explanation: string;              // Personalized explanation
  badge_url: string;                // Shareable badge image
}
```

---

## Wrap 1: Enhanced 10-Slide Story

### Slide-by-Slide Changes

#### 1. Intro (Enhanced ✨)
**Before:** "Din kväll"  
**After:** "**Marcus**, din kväll"

```tsx
<h1 className="text-6xl font-bold">
  {data.person_name}, din kväll
</h1>
```

#### 2. Collective Distance (Unchanged)
"Tillsammans cyklade ni 47 km"

#### 3. Your Distance (Enhanced 🎯)
**Before:** "Du cyklade 4.2 km"  
**After:** 
- Show individual distance + % of total
- Add fun comparison

```tsx
<div>
  <p className="text-5xl font-bold">{data.distance_km} km</p>
  <p className="text-2xl mt-4">
    Du stod för {data.distance_percent}% av totalen!
  </p>
  <p className="text-xl mt-2 text-gray-300">
    {getDistanceComparison(data.distance_km)}
  </p>
</div>

function getDistanceComparison(km: number): string {
  if (km < 0.2) return `${Math.round(km * 1000)} meter — nästan en kvällspromenad!`;
  if (km < 1) return `${Math.round(km * 1000)} meter — perfekt distans för en middag!`;
  if (km < 2) return `${km.toFixed(1)} km — som en tur runt kvarteret!`;
  if (km < 5) return `${km.toFixed(1)} km — som från centrum till Norrstrand!`;
  if (km < 10) return `${km.toFixed(1)} km — som från Piteå till Hortlax!`;
  if (km < 20) return `${km.toFixed(1)} km — som från Piteå till Rosvik!`;
  return `${km.toFixed(1)} km — du är en sann cyklist! 🚴`;
}
```

#### 4. People Met (Enhanced 📊)
**Before:** "Du träffade 23 personer"  
**After:** Add storytelling

```tsx
<div>
  <p className="text-5xl font-bold">{data.people_met}</p>
  <p className="text-2xl mt-4">nya ansikten, nya historier</p>
  {data.people_met >= 20 && (
    <p className="text-xl mt-2">Det är som ett helt klassrum!</p>
  )}
  {data.people_met >= 30 && (
    <p className="text-xl mt-2">Du är en social superstjärna! 🌟</p>
  )}
</div>
```

#### 5. Shortest Ride (Enhanced 😂)
**Before:** Only show if >200m  
**After:** ALWAYS show, even if tiny (storytelling!)

```tsx
{wrap_stats && (
  <div>
    <p className="text-2xl">Kortaste cykelturen:</p>
    <p className="text-5xl font-bold mt-4">
      {wrap_stats.shortest_ride_meters < 1000 
        ? `${wrap_stats.shortest_ride_meters}m`
        : `${(wrap_stats.shortest_ride_meters / 1000).toFixed(1)} km`
      }
    </p>
    <p className="text-xl mt-4">{wrap_stats.shortest_ride_couple}</p>
    {wrap_stats.shortest_ride_meters < 200 && (
      <p className="text-lg mt-2 text-yellow-400">
        Turligt placerade! 🍀
      </p>
    )}
    {wrap_stats.shortest_ride_meters < 50 && (
      <p className="text-lg mt-2">
        Praktiskt taget grannbesök! 😄
      </p>
    )}
  </div>
)}
```

#### 6. Longest Ride (Enhanced)
```tsx
{wrap_stats && (
  <div>
    <p className="text-2xl">Längsta cykelturen:</p>
    <p className="text-5xl font-bold mt-4">
      {(wrap_stats.longest_ride_meters / 1000).toFixed(1)} km
    </p>
    <p className="text-xl mt-4">{wrap_stats.longest_ride_couple}</p>
    {data.is_longest_rider && (
      <p className="text-lg mt-2 text-green-400">
        Det var du! 💪
      </p>
    )}
  </div>
)}
```

#### 7. Dishes Served (Enhanced 🎁)
**Before:** "108 portioner serverades"  
**After:** Add fun comparison

```tsx
<div>
  <p className="text-5xl font-bold">{wrap_stats.total_portions}</p>
  <p className="text-2xl mt-4">portioner serverades</p>
  {wrap_stats.total_portions > 100 && (
    <p className="text-xl mt-2">
      Det är som en liten restaurang! 🍽️
    </p>
  )}
</div>
```

#### 8. Last Guest Departed (Unchanged)
"Sista gästen gick: 02:30"

#### 9. Award Teaser (Enhanced)
```tsx
<div>
  <p className="text-2xl">Du har fått en utmärkelse...</p>
  <p className="text-xl mt-4 text-gray-300">
    Klicka för att se vad du vann! 🏆
  </p>
</div>
```

#### 10. Thank You + Share CTA (Enhanced 🎁)
**Before:** Generic thanks  
**After:** Strong social CTA

```tsx
<div className="text-center">
  <h2 className="text-4xl font-bold mb-8">Tack för en magisk kväll!</h2>
  
  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 mb-8">
    <p className="text-2xl mb-4">Dela din wrap!</p>
    <p className="text-lg text-gray-300 mb-6">
      Berätta för världen om din kväll
    </p>
    
    <button
      onClick={shareWrap}
      className="bg-gradient-to-r from-pink-500 to-purple-500 
                 text-white px-8 py-4 rounded-full text-xl font-bold
                 hover:scale-105 transition-transform"
    >
      📱 Dela med #Cykelfesten
    </button>
  </div>
  
  <button
    onClick={() => router.push(`/e/${slug}/award?coupleId=${coupleId}&person=${personType}`)}
    className="text-xl underline"
  >
    Se din utmärkelse →
  </button>
</div>

async function shareWrap() {
  const shareData = {
    title: `${data.person_name}s Cykelfest 2026`,
    text: `Jag cyklade ${data.distance_km} km, träffade ${data.people_met} personer och fick en utmärkelse! 🚴✨`,
    url: window.location.href,
    hashtags: ['Cykelfesten', 'DinnerSafari', 'Piteå2026']
  };
  
  if (navigator.share) {
    await navigator.share(shareData);
  } else {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(
      `${shareData.text}\n${shareData.url}\n#${shareData.hashtags.join(' #')}`
    );
    toast.success('Kopierat till urklipp!');
  }
}
```

---

## Wrap 2: Enhanced Award Reveal

### Problems to Fix (from feedback)
🔴 Saknar förklaring av vad utmärkelsen betyder  
🔴 Saknar badge/diplom att spara  
🔴 Saknar musik vid reveal  
🟡 Social trigger: "Vilken utmärkelse fick DU?"

### New Flow (6 Steps)

#### Step 1: Intro
```tsx
<motion.div>
  <h1 className="text-4xl font-bold mb-8">
    {data.person_name}, du har fått en utmärkelse!
  </h1>
  <p className="text-xl">Klicka för att se...</p>
</motion.div>
```

#### Step 2: Drumroll
```tsx
// Play drumroll sound
<audio ref={audioRef} src="/sounds/drumroll.mp3" autoPlay />

<motion.div
  animate={{ scale: [1, 1.2, 1] }}
  transition={{ repeat: Infinity, duration: 1 }}
>
  <p className="text-6xl">🥁</p>
</motion.div>
```

#### Step 3: Reveal (with confetti)
```tsx
<motion.div
  initial={{ scale: 0, rotate: -180 }}
  animate={{ scale: 1, rotate: 0 }}
  transition={{ type: "spring", duration: 1 }}
>
  <div className="text-8xl mb-8">{data.award.emoji}</div>
  <h2 className="text-5xl font-bold mb-4">{data.award.title}</h2>
</motion.div>

// Trigger confetti
useEffect(() => {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
  // Play celebration sound
  new Audio('/sounds/celebration.mp3').play();
}, []);
```

#### Step 4: Context (NEW! 🔴)
**This is what was missing!**

```tsx
<motion.div className="bg-white/10 backdrop-blur-sm rounded-lg p-8">
  <h3 className="text-3xl font-bold mb-4">Vad betyder det?</h3>
  <p className="text-xl leading-relaxed">
    {data.explanation}
  </p>
  
  {data.value && (
    <div className="mt-6 p-4 bg-black/30 rounded-lg">
      <p className="text-2xl font-bold">{data.value}</p>
    </div>
  )}
</motion.div>

function getExplanation(award: Award, value: string | null, name: string | null): string {
  const displayName = name || 'Du';
  
  switch (award.id) {
    case 'longest_distance':
      return `${displayName} cyklade längst av alla deltagare! ${value ? `Hela ${value} — det är en sann prestation!` : 'Imponerande!'}`;
    
    case 'shortest_distance':
      return `${displayName} hade tur med placeringen och fick njuta av en kort cykeltur. ${value ? `Bara ${value}!` : 'Praktiskt!'}`;
    
    case 'oldest':
      return `${displayName} representerar erfarenhet och visdom på festen. Ålder är bara en siffra, men din energi är tidlös!`;
    
    case 'youngest':
      return `${displayName} är kvällens nya stjärna! Frisk energi och nya perspektiv är alltid välkomna.`;
    
    case 'first_signup':
      return `${displayName} var först att anmäla sig — det visar verklig entusiasm!`;
    
    case 'last_signup':
      return `${displayName} väntade in det rätta ögonblicket. Fashionably late till anmälan, men på plats när det gäller!`;
    
    case 'most_fun_facts':
      return `${displayName} delade flest fun facts — en riktig berättare som gör kvällen levande!`;
    
    case 'least_fun_facts':
      return `${displayName} behöll mystiken. Ibland säger tystnaden mer än tusen ord...`;
    
    case 'only_vegetarian':
      return `${displayName} representerar det gröna på bordet! Tack för att du visar att god mat kan vara hållbar.`;
    
    case 'wildcard':
      return `${displayName} drog wildcarden! Slumpen valde dig till något alldeles speciellt.`;
    
    default:
      return `Grattis ${displayName}! Du har gjort kvällen minnesvärd.`;
  }
}
```

#### Step 5: Badge (NEW! 🔴)
**Downloadable diploma/badge**

```tsx
<motion.div className="text-center">
  <h3 className="text-3xl font-bold mb-6">Ditt diplom</h3>
  
  <div 
    ref={badgeRef}
    className="bg-gradient-to-br from-purple-900 to-pink-900 
               p-12 rounded-lg border-4 border-yellow-400 max-w-lg mx-auto"
  >
    <div className="text-6xl mb-4">{data.award.emoji}</div>
    <h4 className="text-4xl font-bold mb-2">{data.award.title}</h4>
    <p className="text-2xl mb-6">{data.person_name}</p>
    <p className="text-lg">{data.event_name}</p>
    <p className="text-sm mt-4">{data.event_date}</p>
  </div>
  
  <button
    onClick={downloadBadge}
    className="mt-8 bg-yellow-400 text-black px-8 py-4 rounded-full 
               text-xl font-bold hover:scale-105 transition-transform"
  >
    💾 Ladda ner diplom
  </button>
</motion.div>

async function downloadBadge() {
  const badge = badgeRef.current;
  if (!badge) return;
  
  const canvas = await html2canvas(badge);
  const url = canvas.toDataURL('image/png');
  
  const link = document.createElement('a');
  link.download = `cykelfesten-${data.award.id}-${data.person_name}.png`;
  link.href = url;
  link.click();
  
  toast.success('Diplom nedladdat!');
}
```

#### Step 6: Share (NEW! 🟡)
**Social trigger: "Vilken utmärkelse fick DU?"**

```tsx
<motion.div className="text-center">
  <h3 className="text-3xl font-bold mb-6">Dela din utmärkelse!</h3>
  
  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-8 max-w-lg mx-auto">
    <p className="text-xl mb-6">
      Visa dina vänner vad du fick! 🏆
    </p>
    
    <div className="space-y-4">
      <button
        onClick={() => shareAward('instagram')}
        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 
                   text-white px-6 py-4 rounded-full text-lg font-bold
                   hover:scale-105 transition-transform"
      >
        📸 Dela till Instagram Story
      </button>
      
      <button
        onClick={() => shareAward('generic')}
        className="w-full bg-blue-500 text-white px-6 py-4 rounded-full 
                   text-lg font-bold hover:scale-105 transition-transform"
      >
        📱 Dela överallt
      </button>
      
      <button
        onClick={copyShareText}
        className="w-full bg-gray-700 text-white px-6 py-4 rounded-full 
                   text-lg hover:scale-105 transition-transform"
      >
        📋 Kopiera text
      </button>
    </div>
  </div>
  
  <p className="text-sm text-gray-400 mt-8">
    #Cykelfesten #DinnerSafari #Piteå2026
  </p>
</motion.div>

async function shareAward(platform: 'instagram' | 'generic') {
  const shareText = `Jag fick utmärkelsen "${data.award.title}" ${data.award.emoji} på Cykelfesten! Vilken utmärkelse fick DU? 🚴✨`;
  
  const shareData = {
    title: `${data.person_name}s utmärkelse`,
    text: shareText,
    url: window.location.href,
  };
  
  if (platform === 'instagram') {
    // Download badge first, then prompt user to upload to IG
    await downloadBadge();
    toast.info('Öppna Instagram och ladda upp bilden till din story!');
  } else if (navigator.share) {
    await navigator.share(shareData);
  } else {
    await copyShareText();
  }
}

async function copyShareText() {
  const text = `Jag fick utmärkelsen "${data.award.title}" ${data.award.emoji} på Cykelfesten! Vilken utmärkelse fick DU? 🚴✨\n\n${window.location.href}\n\n#Cykelfesten #DinnerSafari #Piteå2026`;
  await navigator.clipboard.writeText(text);
  toast.success('Text kopierad! Klistra in i din story 📱');
}
```

---

## Technical Implementation

### 1. Database Migration

```sql
-- Already created: supabase/migrations/20260208_add_wrap_stats.sql
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS wrap_stats JSONB;

COMMENT ON COLUMN events.wrap_stats IS 'Aggregate stats for wrap generation';

-- Example wrap_stats structure:
-- {
--   "total_distance_km": 47.2,
--   "total_couples": 12,
--   "total_people": 24,
--   "total_portions": 108,
--   "shortest_ride_meters": 47,
--   "shortest_ride_couple": "Anna",
--   "longest_ride_meters": 4200,
--   "longest_ride_couple": "Marcus",
--   "districts_count": 8,
--   "fun_facts_count": 72,
--   "last_guest_departure": "02:30"
-- }
```

### 2. Award Assignment Per Person

```sql
-- Update award_assignments to support person-level
ALTER TABLE award_assignments
ADD COLUMN IF NOT EXISTS person_type VARCHAR(10) CHECK (person_type IN ('invited', 'partner'));

-- Create unique index (one award per person)
CREATE UNIQUE INDEX idx_award_per_person 
ON award_assignments(couple_id, person_type);

-- Migration: duplicate existing couple awards for both persons
INSERT INTO award_assignments (couple_id, person_type, award_id, value, assigned_at)
SELECT couple_id, 'invited', award_id, value, assigned_at
FROM award_assignments
WHERE person_type IS NULL;

INSERT INTO award_assignments (couple_id, person_type, award_id, value, assigned_at)
SELECT couple_id, 'partner', award_id, value, assigned_at
FROM award_assignments
WHERE person_type IS NULL
  AND EXISTS (SELECT 1 FROM couples WHERE id = couple_id AND partner_name IS NOT NULL);

-- Remove old couple-level assignments
DELETE FROM award_assignments WHERE person_type IS NULL;

-- Make person_type required
ALTER TABLE award_assignments ALTER COLUMN person_type SET NOT NULL;
```

### 3. Admin: Calculate Wrap Stats

Add button in `/admin/[eventId]`:

```tsx
async function calculateWrapStats(eventId: string) {
  // Calculate aggregate stats from all couples/envelopes
  const stats = {
    total_distance_km: 0,
    total_couples: 0,
    total_people: 0,
    total_portions: 0,
    shortest_ride_meters: Infinity,
    shortest_ride_couple: '',
    longest_ride_meters: 0,
    longest_ride_couple: '',
    districts_count: 0,
    fun_facts_count: 0,
    last_guest_departure: null,
  };
  
  // Query all envelopes, calculate distances, find min/max
  // ...
  
  // Save to events.wrap_stats
  await supabase
    .from('events')
    .update({ wrap_stats: stats })
    .eq('id', eventId);
    
  toast.success('Wrap stats beräknade!');
}
```

### 4. Update Routing

**Wrap page:**
```tsx
// /e/[slug]/wrap/page.tsx
const personType = searchParams.get('person') || 'invited';

// Load data for specific person
const isPartner = personType === 'partner';
const personName = isPartner ? couple.partner_name : couple.invited_name;
const personFunFacts = isPartner ? couple.partner_fun_facts : couple.invited_fun_facts;

// Calculate individual stats
const distance_km = calculatePersonDistance(couple, personType);
const distance_percent = (distance_km / wrap_stats.total_distance_km) * 100;
const is_longest_rider = checkIfLongestRider(couple, personType, wrap_stats);
```

**Award page:**
```tsx
// /e/[slug]/award/page.tsx
const personType = searchParams.get('person') || 'invited';

// Load person-specific award
const { data: assignment } = await supabase
  .from('award_assignments')
  .select('*')
  .eq('couple_id', coupleId)
  .eq('person_type', personType)
  .single();
```

### 5. Update Links

**From memories page:**
```tsx
// Update button to ask which person
<button onClick={() => {
  // If single: go directly
  // If couple: show modal "Vems wrap vill du se?"
  if (!couple.partner_name) {
    router.push(`/e/${slug}/wrap?coupleId=${couple.id}&person=invited`);
  } else {
    showPersonSelector(couple.id);
  }
}}>
  Se din wrap
</button>

function showPersonSelector(coupleId: string) {
  // Modal with two buttons
  <div>
    <h3>Vems wrap vill du se?</h3>
    <button onClick={() => router.push(`/e/${slug}/wrap?coupleId=${coupleId}&person=invited`)}>
      {couple.invited_name}
    </button>
    <button onClick={() => router.push(`/e/${slug}/wrap?coupleId=${coupleId}&person=partner`)}>
      {couple.partner_name}
    </button>
  </div>
}
```

---

## Dependencies

### New Packages
```bash
npm install html2canvas     # For badge download
npm install sonner          # For toasts (already installed?)
```

### Sound Files
Create `/public/sounds/`:
- `drumroll.mp3` (3-5 seconds)
- `celebration.mp3` (short, joyful)

**Free sources:**
- Freesound.org
- Pixabay Sounds
- YouTube Audio Library

---

## Testing Checklist

### Wrap Page
- [ ] ?person=invited shows correct name
- [ ] ?person=partner shows partner name (or fallback)
- [ ] Distance % calculated correctly
- [ ] Distance comparison shows for all ranges (<200m, 1km, 5km, etc.)
- [ ] Shortest ride always shows (even tiny distances)
- [ ] is_longest_rider flag works
- [ ] Share button works (native + fallback)
- [ ] Music plays based on individual fun_facts

### Award Page
- [ ] Correct award loaded per person
- [ ] Drumroll sound plays
- [ ] Confetti triggers on reveal
- [ ] Celebration sound plays
- [ ] Explanation text shows correctly
- [ ] Badge renders with correct data
- [ ] Badge downloads as PNG
- [ ] Share buttons work (Instagram flow + generic)
- [ ] Copy text includes hashtags

### Admin
- [ ] Calculate wrap stats button works
- [ ] Stats saved to events.wrap_stats
- [ ] Award re-assignment per person works

---

## Success Metrics

### User Engagement
- **+50% wrap completion rate** (vs couple-based)
- **+30% social shares** (with hashtag #Cykelfesten)
- **Higher time-on-page** (6 steps vs 3)

### Social Proof
- Instagram stories with #Cykelfesten
- "Vilken utmärkelse fick DU?" comments
- Badge screenshots in group chats

---

## Future Enhancements (Not in Scope)

- [ ] Wrap video generation (Remotion.js)
- [ ] Custom badge templates per event
- [ ] Leaderboard integration ("Top 10 longest riders")
- [ ] AR badge filter (Spark AR / Instagram effects)

---

## Timeline

**Day 1 (4h):** Database migration + routing + data loading  
**Day 2 (4h):** Wrap enhancements (slides 1-10)  
**Day 3 (4h):** Award enhancements (steps 1-6)  
**Day 4 (2h):** Testing + polish

**Total: 14 hours**

---

**Ready to implement?** 🚀
