-- Fun Facts & Mystery Profile
-- Auto-deleted day after event for privacy

-- Add columns to couples
ALTER TABLE couples ADD COLUMN IF NOT EXISTS invited_birth_year INTEGER;
ALTER TABLE couples ADD COLUMN IF NOT EXISTS invited_fun_facts JSONB DEFAULT '{}';
ALTER TABLE couples ADD COLUMN IF NOT EXISTS partner_birth_year INTEGER;
ALTER TABLE couples ADD COLUMN IF NOT EXISTS partner_fun_facts JSONB DEFAULT '{}';

-- Function to clear fun facts after event
CREATE OR REPLACE FUNCTION clear_fun_facts_after_event()
RETURNS INTEGER AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE couples c
  SET 
    invited_birth_year = NULL,
    invited_fun_facts = '{}',
    partner_birth_year = NULL,
    partner_fun_facts = '{}'
  FROM events e
  WHERE c.event_id = e.id
    AND e.event_date < CURRENT_DATE
    AND (
      c.invited_birth_year IS NOT NULL 
      OR c.invited_fun_facts != '{}'
      OR c.partner_birth_year IS NOT NULL
      OR c.partner_fun_facts != '{}'
    );
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule daily cleanup (call via cron or edge function)
-- SELECT clear_fun_facts_after_event();

COMMENT ON COLUMN couples.invited_birth_year IS 'Auto-deleted day after event for privacy';
COMMENT ON COLUMN couples.invited_fun_facts IS 'Auto-deleted day after event for privacy';
COMMENT ON COLUMN couples.partner_birth_year IS 'Auto-deleted day after event for privacy';
COMMENT ON COLUMN couples.partner_fun_facts IS 'Auto-deleted day after event for privacy';
