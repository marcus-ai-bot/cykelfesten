-- Dashboard UX redesign: role preferences, reserves, confirmation
ALTER TABLE couples ADD COLUMN IF NOT EXISTS role_preference TEXT DEFAULT 'any' CHECK (role_preference IN ('any', 'guest_only', 'host_only'));
ALTER TABLE couples ADD COLUMN IF NOT EXISTS is_reserve BOOLEAN DEFAULT false;
ALTER TABLE couples ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT false;
