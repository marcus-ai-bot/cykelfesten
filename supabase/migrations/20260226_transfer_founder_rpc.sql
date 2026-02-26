-- Atomic founder transfer: swaps founder/co-organizer roles in a single transaction
CREATE OR REPLACE FUNCTION transfer_founder(
  p_event_id UUID,
  p_current_founder_id UUID,
  p_new_founder_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_role TEXT;
  v_new_role TEXT;
BEGIN
  SELECT role INTO v_current_role FROM event_organizers
    WHERE event_id = p_event_id AND organizer_id = p_current_founder_id AND removed_at IS NULL;
  IF v_current_role IS NULL OR v_current_role != 'founder' THEN
    RETURN jsonb_build_object('error', 'Current user is not founder');
  END IF;

  SELECT role INTO v_new_role FROM event_organizers
    WHERE event_id = p_event_id AND organizer_id = p_new_founder_id
    AND removed_at IS NULL AND accepted_at IS NOT NULL;
  IF v_new_role IS NULL THEN
    RETURN jsonb_build_object('error', 'Target is not an accepted co-organizer');
  END IF;
  IF v_new_role = 'founder' THEN
    RETURN jsonb_build_object('error', 'Target is already founder');
  END IF;

  UPDATE event_organizers SET role = 'co-organizer'
    WHERE event_id = p_event_id AND organizer_id = p_current_founder_id AND removed_at IS NULL;
  UPDATE event_organizers SET role = 'founder'
    WHERE event_id = p_event_id AND organizer_id = p_new_founder_id AND removed_at IS NULL;

  RETURN jsonb_build_object('success', true);
END;
$$;
