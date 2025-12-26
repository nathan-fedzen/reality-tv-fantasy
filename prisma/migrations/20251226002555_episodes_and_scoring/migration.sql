-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeResult" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "queenId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EpisodeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueEntryScore" (
    "id" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "points" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "LeagueEntryScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Episode_leagueId_idx" ON "Episode"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_leagueId_week_key" ON "Episode"("leagueId", "week");

-- CreateIndex
CREATE INDEX "EpisodeResult_episodeId_idx" ON "EpisodeResult"("episodeId");

-- CreateIndex
CREATE INDEX "EpisodeResult_type_idx" ON "EpisodeResult"("type");

-- CreateIndex
CREATE INDEX "EpisodeResult_queenId_idx" ON "EpisodeResult"("queenId");

-- CreateIndex
CREATE INDEX "LeagueEntryScore_episodeId_idx" ON "LeagueEntryScore"("episodeId");

-- CreateIndex
CREATE INDEX "LeagueEntryScore_leagueEntryId_idx" ON "LeagueEntryScore"("leagueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueEntryScore_leagueEntryId_episodeId_key" ON "LeagueEntryScore"("leagueEntryId", "episodeId");

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeResult" ADD CONSTRAINT "EpisodeResult_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeResult" ADD CONSTRAINT "EpisodeResult_queenId_fkey" FOREIGN KEY ("queenId") REFERENCES "Queen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueEntryScore" ADD CONSTRAINT "LeagueEntryScore_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueEntryScore" ADD CONSTRAINT "LeagueEntryScore_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
