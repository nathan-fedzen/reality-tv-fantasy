DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'MessageChannel'
  ) THEN
    CREATE TYPE "MessageChannel" AS ENUM ('GENERAL', 'TRAITORS');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "LeagueMessage" (
  "id" TEXT NOT NULL,
  "leagueId" TEXT NOT NULL,
  "episodeId" TEXT,
  "authorMemberId" TEXT NOT NULL,
  "channel" "MessageChannel" NOT NULL DEFAULT 'GENERAL',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeagueMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeagueMessage_leagueId_fkey"
    FOREIGN KEY ("leagueId") REFERENCES "League"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LeagueMessage_authorMemberId_fkey"
    FOREIGN KEY ("authorMemberId") REFERENCES "LeagueMember"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "LeagueMessage_leagueId_channel_idx"
  ON "LeagueMessage"("leagueId", "channel");

CREATE INDEX IF NOT EXISTS "LeagueMessage_episodeId_idx"
  ON "LeagueMessage"("episodeId");
