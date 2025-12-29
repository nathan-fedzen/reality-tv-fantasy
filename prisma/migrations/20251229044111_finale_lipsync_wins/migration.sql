-- CreateEnum
CREATE TYPE "LeagueStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "EpisodeType" AS ENUM ('REGULAR', 'FINALE');

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "episodeType" "EpisodeType" NOT NULL DEFAULT 'REGULAR';

-- AlterTable
ALTER TABLE "League" ADD COLUMN     "status" "LeagueStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "EpisodeFinalePlacement" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "queenId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,

    CONSTRAINT "EpisodeFinalePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpisodeFinaleExtra" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "queenId" TEXT NOT NULL,
    "miniWins" INTEGER NOT NULL DEFAULT 0,
    "mainWins" INTEGER NOT NULL DEFAULT 0,
    "lipsyncWins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "EpisodeFinaleExtra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EpisodeFinalePlacement_queenId_idx" ON "EpisodeFinalePlacement"("queenId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeFinalePlacement_episodeId_place_key" ON "EpisodeFinalePlacement"("episodeId", "place");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeFinalePlacement_episodeId_queenId_key" ON "EpisodeFinalePlacement"("episodeId", "queenId");

-- CreateIndex
CREATE INDEX "EpisodeFinaleExtra_queenId_idx" ON "EpisodeFinaleExtra"("queenId");

-- CreateIndex
CREATE UNIQUE INDEX "EpisodeFinaleExtra_episodeId_queenId_key" ON "EpisodeFinaleExtra"("episodeId", "queenId");

-- AddForeignKey
ALTER TABLE "EpisodeFinalePlacement" ADD CONSTRAINT "EpisodeFinalePlacement_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeFinalePlacement" ADD CONSTRAINT "EpisodeFinalePlacement_queenId_fkey" FOREIGN KEY ("queenId") REFERENCES "Queen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeFinaleExtra" ADD CONSTRAINT "EpisodeFinaleExtra_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpisodeFinaleExtra" ADD CONSTRAINT "EpisodeFinaleExtra_queenId_fkey" FOREIGN KEY ("queenId") REFERENCES "Queen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
