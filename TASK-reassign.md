# Task: Reassign Guest + Per-Course Unplaced

## Context
During a LIVE event, a couple splits (separation). No automatic rematch allowed.
The organizer needs to manually move guests between hosts and see who's missing placement per course.

## 1. New API: POST /api/organizer/events/[eventId]/reassign

Move a guest from their current host to a different host for a specific course.

**Input:**
```json
{
  "guest_couple_id": "uuid",
  "course": "starter" | "main" | "dessert",
  "new_host_couple_id": "uuid"
}
```

**Logic:**
1. Validate auth (requireEventAccess)
2. Get event + active_match_plan_id
3. Find existing pairing: `course_pairings WHERE guest_couple_id + course + match_plan_id`
4. If exists: delete old pairing + cancel old envelope
5. Validate new host is actually a host for that course (check assignments)
6. Create new pairing (course_pairings)
7. Create new envelope with correct timing (use calculateEnvelopeTimes from lib/envelope/timing)
8. Log to event_log action='reassign_guest'
9. Return success + old host name + new host name

**Edge cases:**
- Guest has no existing pairing for that course (just place them — same as /place but single)
- New host is at capacity → allow but warn (return `over_capacity: true`)
- Guest is cancelled → reject
- New host couple is cancelled → reject

**Reference implementation:** Look at `/api/organizer/events/[eventId]/place/route.ts` for how to create pairings + envelopes with timing.

## 2. Upgrade: GET /api/organizer/events/[eventId]/unplaced

Currently returns couples with NO pairings at all. Needs to ALSO return per-course gaps.

**Add to response:**
```json
{
  "unplaced": [...],           // existing: completely unplaced
  "missingByCourse": {         // NEW: per-course gaps
    "starter": [
      { "id": "uuid", "name": "Astrid", "person_count": 1, "current_host": null }
    ],
    "main": [...],
    "dessert": [...]
  },
  "hostsByCourse": {...},      // existing
  "potentialHosts": {...}      // existing
}
```

**Logic for missingByCourse:**
- For each active (non-cancelled) couple
- For each course (starter, main, dessert)
- Check if they appear as guest_couple_id OR host_couple_id in course_pairings for that course
- If not → they're missing placement for that course
- Include their current host (if any) for other courses (helps avoid conflicts)

**Important:** The existing `unplaced` array should remain for backwards compat. `missingByCourse` is additive.

## 3. Update UnplacedCouplesPanel UI

In `src/components/organizer/PhaseContent.tsx` (~line 719):

Currently shows only fully unplaced couples. Update to:
- Show per-course sections: "Saknar placering på förrätt (2 st)"
- Each couple in a course section gets a host dropdown (existing hosts with capacity)
- "Spara" calls /reassign for couples that already have a host, /place for new placements

## Files to create/modify:
- CREATE: `src/app/api/organizer/events/[eventId]/reassign/route.ts`
- MODIFY: `src/app/api/organizer/events/[eventId]/unplaced/route.ts`
- MODIFY: `src/components/organizer/PhaseContent.tsx` (UnplacedCouplesPanel)

## DO NOT:
- Touch the matching algorithm
- Trigger any automatic rematch
- Modify the split endpoint
- Change any other existing endpoints
