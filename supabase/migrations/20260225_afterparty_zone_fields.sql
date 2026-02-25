-- Afterparty progressive reveal: zone + closing_in positions
-- Each couple gets unique randomized positions for the treasure hunt effect
ALTER TABLE envelopes ADD COLUMN zone_lat DOUBLE PRECISION;
ALTER TABLE envelopes ADD COLUMN zone_lng DOUBLE PRECISION;
ALTER TABLE envelopes ADD COLUMN zone_radius_m INTEGER;
ALTER TABLE envelopes ADD COLUMN closing_lat DOUBLE PRECISION;
ALTER TABLE envelopes ADD COLUMN closing_lng DOUBLE PRECISION;
ALTER TABLE envelopes ADD COLUMN closing_radius_m INTEGER;

COMMENT ON COLUMN envelopes.zone_lat IS 'Randomized lat ~300-500m from afterparty (ZONE step)';
COMMENT ON COLUMN envelopes.zone_lng IS 'Randomized lng ~300-500m from afterparty (ZONE step)';
COMMENT ON COLUMN envelopes.zone_radius_m IS 'Display radius in meters for ZONE step (typically 500)';
COMMENT ON COLUMN envelopes.closing_lat IS 'Randomized lat ~50-150m from afterparty (CLOSING_IN step)';
COMMENT ON COLUMN envelopes.closing_lng IS 'Randomized lng ~50-150m from afterparty (CLOSING_IN step)';
COMMENT ON COLUMN envelopes.closing_radius_m IS 'Display radius in meters for CLOSING_IN step (typically 100)';
