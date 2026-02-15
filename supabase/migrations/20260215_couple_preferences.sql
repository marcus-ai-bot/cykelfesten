CREATE TABLE IF NOT EXISTS couple_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  target_couple_id UUID NOT NULL REFERENCES couples(id) ON DELETE CASCADE,
  preference TEXT NOT NULL DEFAULT 'neutral' CHECK (preference IN ('avoid', 'low', 'neutral', 'preferred', 'known')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(couple_id, target_couple_id)
);
CREATE INDEX IF NOT EXISTS idx_couple_prefs_couple ON couple_preferences(couple_id);
CREATE INDEX IF NOT EXISTS idx_couple_prefs_event ON couple_preferences(event_id);
