-- Personal Wraps v2: Individual person-based experience
-- Part 1: Add wrap_stats to events

ALTER TABLE events 
ADD COLUMN IF NOT EXISTS wrap_stats JSONB;

COMMENT ON COLUMN events.wrap_stats IS 'Aggregate stats for wrap generation: total_distance_km, total_couples, total_people, total_portions, shortest_ride_meters, shortest_ride_couple, longest_ride_meters, longest_ride_couple, districts_count, fun_facts_count, last_guest_departure';

-- Example structure:
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

-- Part 2: Update award_assignments to support per-person awards

-- Add person_type column
ALTER TABLE award_assignments
ADD COLUMN IF NOT EXISTS person_type VARCHAR(10);

-- Add check constraint
ALTER TABLE award_assignments
ADD CONSTRAINT check_person_type 
CHECK (person_type IN ('invited', 'partner'));

-- Migrate existing couple-level awards to person-level
-- First: Create invited person awards from existing assignments
INSERT INTO award_assignments (couple_id, person_type, award_id, value, assigned_at)
SELECT couple_id, 'invited', award_id, value, assigned_at
FROM award_assignments
WHERE person_type IS NULL
ON CONFLICT DO NOTHING;

-- Second: Create partner person awards (only if partner exists)
INSERT INTO award_assignments (couple_id, person_type, award_id, value, assigned_at)
SELECT aa.couple_id, 'partner', aa.award_id, aa.value, aa.assigned_at
FROM award_assignments aa
JOIN couples c ON c.id = aa.couple_id
WHERE aa.person_type IS NULL
  AND c.partner_name IS NOT NULL
ON CONFLICT DO NOTHING;

-- Third: Remove old couple-level assignments (without person_type)
DELETE FROM award_assignments WHERE person_type IS NULL;

-- Make person_type required
ALTER TABLE award_assignments 
ALTER COLUMN person_type SET NOT NULL;

-- Create unique index (one award per person)
CREATE UNIQUE INDEX IF NOT EXISTS idx_award_per_person 
ON award_assignments(couple_id, person_type);

-- Add helpful comment
COMMENT ON COLUMN award_assignments.person_type IS 'Which person in the couple: invited or partner';
