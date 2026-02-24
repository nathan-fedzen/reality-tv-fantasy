-- Repair migration: LeagueEntryScore.breakdown exists in schema but was missing in early DBs.
ALTER TABLE "LeagueEntryScore"
ADD COLUMN IF NOT EXISTS "breakdown" JSONB;
