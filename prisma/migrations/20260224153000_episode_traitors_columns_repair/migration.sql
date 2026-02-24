-- Repair migration: Episode traitors columns were present in schema but missing from migration history.
-- Add them idempotently so existing databases can catch up safely.
ALTER TABLE "Episode"
ADD COLUMN IF NOT EXISTS "hasMurder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "hasBanishment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "banishmentVoteOpensAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "banishmentVoteClosesAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "murderVoteOpensAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "murderVoteClosesAt" TIMESTAMP(3);
