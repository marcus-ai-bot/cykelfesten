# ADR-002: Matching Invariants & Reveal Policy

**Date:** 2026-02-24

## Status
Accepted

## Context
Several organizer actions (reassign, split, dropout, address change) have caused inconsistencies between `course_pairings` and `envelopes`. This ADR defines the invariants that must hold at all times and formalizes the reveal policy for address changes after envelopes are activated.

## Decision
### Invariant 1 — Active pairing must have exactly one active envelope
For every active `course_pairings` row (match_plan_id + guest_couple_id + course), there must be **exactly one** active (non-cancelled) envelope with the same match_plan_id + couple_id + course.

### Invariant 2 — Destination address equals host address at activation
When an envelope becomes active (activation time), the envelope’s `destination_address` must equal the **current** `couples.address` of the host couple for that course.

### Invariant 3 — Pairing host and envelope host never diverge
For any active pairing/envelope pair, `pairing.host_couple_id` **must always** equal `envelope.host_couple_id`.

### Reveal Policy — Soft freeze (B)
Address updates **after reveal** are allowed but must trigger an explicit organizer acknowledgment and a warning that guests may have already seen the old address.

## Consequences
- All organizer endpoints must use a single cascade consistency function to enforce these invariants.
- Repair tooling must detect and optionally fix deviations.
- Address changes will surface a warning if any envelopes have already been activated.

## References
- CASCADE-FIX-PROPOSAL.md
- EDGE-CASE-REPORT.md
- BROWSER-TEST-REPORT.md
