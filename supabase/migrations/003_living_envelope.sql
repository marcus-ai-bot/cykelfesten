-- Living Envelope: Datamodell för successiv reveal
-- Migration 003

-- ============================================
-- 1. EVENT TIMING - Konfigurerbar timing per event
-- ============================================

CREATE TABLE IF NOT EXISTS event_timing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  
  -- Relativ timing (minuter innan rätt startar)
  teasing_minutes_before INT NOT NULL DEFAULT 360,    -- 6h: "Nyfiken? 🤫"
  clue_1_minutes_before INT NOT NULL DEFAULT 120,     -- 2h: Första ledtråden
  clue_2_minutes_before INT NOT NULL DEFAULT 30,      -- 30min: Andra ledtråden
  street_minutes_before INT NOT NULL DEFAULT 15,      -- 15min: Gatunamn + spann
  number_minutes_before INT NOT NULL DEFAULT 5,       -- 5min: Exakt husnummer
  
  -- Ledtrådar under måltid (för nästa rätt)
  during_meal_clue_interval_minutes INT NOT NULL DEFAULT 15,
  
  -- Avståndsanpassning
  distance_adjustment_enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(event_id)
);

-- Index för snabb lookup
CREATE INDEX IF NOT EXISTS idx_event_timing_event_id ON event_timing(event_id);

-- ============================================
-- 2. COURSE CLUES - Vilka ledtrådar per rätt
-- ============================================

CREATE TABLE IF NOT EXISTS course_clues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vilket par (värd) detta gäller
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  
  -- Vilken rätt
  course_type TEXT NOT NULL CHECK (course_type IN ('starter', 'main', 'dessert')),
  
  -- Vilka fun_fact-index som används för denna rätt
  -- Ex: [0, 1] = första och andra fun fact
  clue_indices INT[] NOT NULL DEFAULT '{}',
  
  -- Allokerad vid matchning
  allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(couple_id, course_type)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_course_clues_couple_id ON course_clues(couple_id);

-- ============================================
-- 3. STREET INFO - Partiell adressinfo
-- ============================================

CREATE TABLE IF NOT EXISTS street_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  
  -- Parsad adressinformation
  street_name TEXT,           -- "Storgatan"
  street_number INT,          -- 14
  apartment TEXT,             -- "lgh 1102"
  postal_code TEXT,           -- "94133"
  city TEXT,                  -- "Piteå"
  
  -- Spann för partiell reveal (beräknas automatiskt)
  number_range_low INT,       -- 10
  number_range_high INT,      -- 20
  
  -- Portkod (visas vid full reveal)
  door_code TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(couple_id)
);

CREATE INDEX IF NOT EXISTS idx_street_info_couple_id ON street_info(couple_id);

-- ============================================
-- 4. ENVELOPE STATE - Kuvert-status per deltagare
-- ============================================

-- Utöka envelopes med state-maskin
ALTER TABLE envelopes 
  ADD COLUMN IF NOT EXISTS current_state TEXT NOT NULL DEFAULT 'LOCKED'
    CHECK (current_state IN ('LOCKED', 'TEASING', 'CLUE_1', 'CLUE_2', 'STREET', 'NUMBER', 'OPEN')),
  ADD COLUMN IF NOT EXISTS teasing_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clue_1_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clue_2_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS street_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS number_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cycling_minutes INT;

-- ============================================
-- 5. UTÖKA FUN FACTS TILL ARRAY
-- ============================================

-- Ändra fun_facts från JSONB {} till JSONB array []
-- Behåller bakåtkompatibilitet genom att hantera båda format i kod

COMMENT ON COLUMN couples.invited_fun_facts IS 'Array of fun facts, minimum 6 for unique clues per course. Format: ["fact1", "fact2", ...]';
COMMENT ON COLUMN couples.partner_fun_facts IS 'Array of fun facts, minimum 6 for unique clues per course. Format: ["fact1", "fact2", ...]';

-- ============================================
-- 6. HELPER FUNCTIONS
-- ============================================

-- Funktion: Hämta ledtrådar för en rätt
CREATE OR REPLACE FUNCTION get_clues_for_course(
  p_host_couple_id UUID,
  p_course_type TEXT
)
RETURNS TEXT[] AS $$
DECLARE
  v_clue_indices INT[];
  v_all_facts TEXT[];
  v_result TEXT[];
  v_invited_facts JSONB;
  v_partner_facts JSONB;
  i INT;
BEGIN
  -- Hämta allokerade index
  SELECT clue_indices INTO v_clue_indices
  FROM course_clues
  WHERE couple_id = p_host_couple_id AND course_type = p_course_type;
  
  -- Om inga allokerade, returnera tom array
  IF v_clue_indices IS NULL OR array_length(v_clue_indices, 1) IS NULL THEN
    RETURN '{}';
  END IF;
  
  -- Hämta alla fun facts från värden
  SELECT 
    COALESCE(invited_fun_facts, '[]'::jsonb),
    COALESCE(partner_fun_facts, '[]'::jsonb)
  INTO v_invited_facts, v_partner_facts
  FROM couples
  WHERE id = p_host_couple_id;
  
  -- Kombinera till en array
  -- Konvertera JSONB arrays till TEXT[]
  SELECT array_agg(elem)
  INTO v_all_facts
  FROM (
    SELECT jsonb_array_elements_text(v_invited_facts) AS elem
    UNION ALL
    SELECT jsonb_array_elements_text(v_partner_facts) AS elem
  ) combined;
  
  -- Plocka ut de allokerade indexen
  v_result := '{}';
  FOREACH i IN ARRAY v_clue_indices LOOP
    IF i >= 0 AND i < array_length(v_all_facts, 1) THEN
      v_result := array_append(v_result, v_all_facts[i + 1]); -- PostgreSQL är 1-indexerad
    END IF;
  END LOOP;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Funktion: Beräkna kuvert-state baserat på tid
CREATE OR REPLACE FUNCTION calculate_envelope_state(
  p_envelope_id UUID,
  p_current_time TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT AS $$
DECLARE
  v_envelope RECORD;
BEGIN
  SELECT * INTO v_envelope FROM envelopes WHERE id = p_envelope_id;
  
  IF v_envelope IS NULL THEN
    RETURN 'LOCKED';
  END IF;
  
  -- Kontrollera states i ordning (senaste först)
  IF v_envelope.opened_at IS NOT NULL AND p_current_time >= v_envelope.opened_at THEN
    RETURN 'OPEN';
  ELSIF v_envelope.number_at IS NOT NULL AND p_current_time >= v_envelope.number_at THEN
    RETURN 'NUMBER';
  ELSIF v_envelope.street_at IS NOT NULL AND p_current_time >= v_envelope.street_at THEN
    RETURN 'STREET';
  ELSIF v_envelope.clue_2_at IS NOT NULL AND p_current_time >= v_envelope.clue_2_at THEN
    RETURN 'CLUE_2';
  ELSIF v_envelope.clue_1_at IS NOT NULL AND p_current_time >= v_envelope.clue_1_at THEN
    RETURN 'CLUE_1';
  ELSIF v_envelope.teasing_at IS NOT NULL AND p_current_time >= v_envelope.teasing_at THEN
    RETURN 'TEASING';
  ELSE
    RETURN 'LOCKED';
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================
-- 7. TRIGGERS
-- ============================================

-- Auto-update updated_at för event_timing
CREATE OR REPLACE FUNCTION update_event_timing_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_timing_updated_at ON event_timing;
CREATE TRIGGER event_timing_updated_at
  BEFORE UPDATE ON event_timing
  FOR EACH ROW
  EXECUTE FUNCTION update_event_timing_timestamp();

-- ============================================
-- 8. DEFAULT TIMING FÖR BEFINTLIGA EVENTS
-- ============================================

-- Skapa default timing för events som saknar det
INSERT INTO event_timing (event_id)
SELECT id FROM events
WHERE id NOT IN (SELECT event_id FROM event_timing)
ON CONFLICT (event_id) DO NOTHING;
