# Smoke Test Results — Cascade Engine

Event ID: `14df2533-ab0d-4d42-ae4f-2f8aad375b17`
Date: 2026-02-24

## Precheck
- Event: `Edge Case Test`
- Status: `draft`
- active_match_plan_id: `null`

## Cascade Scenarios
Skipped live cascade API tests — event has no active match plan / pairings.

## repair-matching.ts
Command:
```
SUPABASE_SERVICE_ROLE_KEY=*** NEXT_PUBLIC_SUPABASE_ANON_KEY=*** npx tsx scripts/repair-matching.ts --event-id=14df2533-ab0d-4d42-ae4f-2f8aad375b17
```
Result:
- `No match plans found.`

## Unit Tests
- `npx vitest run src/lib/matching/__tests__/cascade.test.ts` → ✅ 8 tests passed
