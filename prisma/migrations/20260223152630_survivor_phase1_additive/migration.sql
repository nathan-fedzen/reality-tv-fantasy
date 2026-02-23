-- CreateEnum
CREATE TYPE "SurvivorDraftStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "SurvivorAuctionType" AS ENUM ('HIDDEN_BID', 'LIVE');

-- CreateEnum
CREATE TYPE "SurvivorAuctionStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SurvivorAdvantageType" AS ENUM ('DOUBLE_EPISODE', 'PREDICTION_SHIELD', 'IDOL_INSURANCE', 'VOTE_STEAL', 'REVIVAL_TOKEN', 'BOOT_BLOCK', 'EXTRA_PREDICTION');

-- CreateEnum
CREATE TYPE "SurvivorAdvantageStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SurvivorPointSource" AS ENUM ('PERFORMANCE', 'PREDICTION', 'BOOT_ORDER', 'AUCTION_SPEND', 'AUCTION_REFUND', 'ADVANTAGE_AWARD', 'ADVANTAGE_EFFECT', 'LAST_SURVIVOR_STANDING', 'ADMIN_ADJUSTMENT');

-- CreateTable
CREATE TABLE "SurvivorCastaway" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tribe" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorCastaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorDraft" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "status" "SurvivorDraftStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "picksPerEntry" INTEGER,
    "totalRounds" INTEGER,
    "totalPicks" INTEGER,
    "currentOverallPick" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorDraftSeat" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivorDraftSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorDraftPick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "castawayId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "overallPick" INTEGER NOT NULL,
    "pickInRound" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivorDraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorEpisodeMeta" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "isMerge" BOOLEAN NOT NULL DEFAULT false,
    "isNonElimination" BOOLEAN NOT NULL DEFAULT false,
    "wasIdolPlayed" BOOLEAN NOT NULL DEFAULT false,
    "shotInTheDarkPlayed" BOOLEAN NOT NULL DEFAULT false,
    "hadTribeSwap" BOOLEAN NOT NULL DEFAULT false,
    "bootCastawayId" TEXT,
    "bootVoteCount" INTEGER,
    "immunityWinnerCastawayId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorEpisodeMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorEpisodeCastawayResult" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "castawayId" TEXT NOT NULL,
    "survived" BOOLEAN NOT NULL DEFAULT true,
    "eliminated" BOOLEAN NOT NULL DEFAULT false,
    "individualImmunityWins" INTEGER NOT NULL DEFAULT 0,
    "individualRewardWins" INTEGER NOT NULL DEFAULT 0,
    "advantagesFound" INTEGER NOT NULL DEFAULT 0,
    "idolsPlayedSuccessfully" INTEGER NOT NULL DEFAULT 0,
    "votesReceived" INTEGER NOT NULL DEFAULT 0,
    "confessionalLeader" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorEpisodeCastawayResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorWeeklyPrediction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "bootCastawayId" TEXT,
    "bootVoteCount" INTEGER,
    "immunityWinnerCastawayId" TEXT,
    "idolPlayed" BOOLEAN,
    "safePickCastawayId" TEXT,
    "shotInTheDarkPlayed" BOOLEAN,
    "tribeSwapHappens" BOOLEAN,
    "nonEliminationEpisode" BOOLEAN,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scoredAt" TIMESTAMP(3),
    "points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB,

    CONSTRAINT "SurvivorWeeklyPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorBootOrderSubmission" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "mergeEpisodeId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "scoredAt" TIMESTAMP(3),
    "points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorBootOrderSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorBootOrderItem" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "castawayId" TEXT NOT NULL,
    "predictedPosition" INTEGER NOT NULL,

    CONSTRAINT "SurvivorBootOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorAuction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SurvivorAuctionType" NOT NULL DEFAULT 'HIDDEN_BID',
    "status" "SurvivorAuctionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "opensAt" TIMESTAMP(3),
    "closesAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurvivorAuction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorAuctionLot" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "advantageType" "SurvivorAdvantageType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "startingBid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivorAuctionLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorAuctionBid" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "isWinning" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivorAuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorOwnedAdvantage" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "lotId" TEXT,
    "advantageType" "SurvivorAdvantageType" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "SurvivorAdvantageStatus" NOT NULL DEFAULT 'ACTIVE',
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "expiresEpisodeId" TEXT,
    "lastAppliedEpisodeId" TEXT,
    "effectConfig" JSONB,

    CONSTRAINT "SurvivorOwnedAdvantage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurvivorPointTransaction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueEntryId" TEXT NOT NULL,
    "episodeId" TEXT,
    "ownedAdvantageId" TEXT,
    "source" "SurvivorPointSource" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurvivorPointTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurvivorCastaway_leagueId_idx" ON "SurvivorCastaway"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorCastaway_leagueId_name_key" ON "SurvivorCastaway"("leagueId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorDraft_leagueId_key" ON "SurvivorDraft"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorDraftSeat_leagueEntryId_idx" ON "SurvivorDraftSeat"("leagueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorDraftSeat_draftId_seat_key" ON "SurvivorDraftSeat"("draftId", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorDraftSeat_draftId_leagueEntryId_key" ON "SurvivorDraftSeat"("draftId", "leagueEntryId");

-- CreateIndex
CREATE INDEX "SurvivorDraftPick_leagueEntryId_idx" ON "SurvivorDraftPick"("leagueEntryId");

-- CreateIndex
CREATE INDEX "SurvivorDraftPick_castawayId_idx" ON "SurvivorDraftPick"("castawayId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorDraftPick_draftId_overallPick_key" ON "SurvivorDraftPick"("draftId", "overallPick");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorDraftPick_draftId_castawayId_key" ON "SurvivorDraftPick"("draftId", "castawayId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorDraftPick_draftId_leagueEntryId_round_key" ON "SurvivorDraftPick"("draftId", "leagueEntryId", "round");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorEpisodeMeta_episodeId_key" ON "SurvivorEpisodeMeta"("episodeId");

-- CreateIndex
CREATE INDEX "SurvivorEpisodeMeta_leagueId_idx" ON "SurvivorEpisodeMeta"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorEpisodeMeta_bootCastawayId_idx" ON "SurvivorEpisodeMeta"("bootCastawayId");

-- CreateIndex
CREATE INDEX "SurvivorEpisodeMeta_immunityWinnerCastawayId_idx" ON "SurvivorEpisodeMeta"("immunityWinnerCastawayId");

-- CreateIndex
CREATE INDEX "SurvivorEpisodeCastawayResult_leagueId_idx" ON "SurvivorEpisodeCastawayResult"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorEpisodeCastawayResult_castawayId_idx" ON "SurvivorEpisodeCastawayResult"("castawayId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorEpisodeCastawayResult_episodeId_castawayId_key" ON "SurvivorEpisodeCastawayResult"("episodeId", "castawayId");

-- CreateIndex
CREATE INDEX "SurvivorWeeklyPrediction_leagueId_idx" ON "SurvivorWeeklyPrediction"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorWeeklyPrediction_leagueEntryId_idx" ON "SurvivorWeeklyPrediction"("leagueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorWeeklyPrediction_episodeId_leagueEntryId_key" ON "SurvivorWeeklyPrediction"("episodeId", "leagueEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorBootOrderSubmission_leagueEntryId_key" ON "SurvivorBootOrderSubmission"("leagueEntryId");

-- CreateIndex
CREATE INDEX "SurvivorBootOrderSubmission_leagueId_idx" ON "SurvivorBootOrderSubmission"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorBootOrderSubmission_mergeEpisodeId_idx" ON "SurvivorBootOrderSubmission"("mergeEpisodeId");

-- CreateIndex
CREATE INDEX "SurvivorBootOrderItem_castawayId_idx" ON "SurvivorBootOrderItem"("castawayId");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorBootOrderItem_submissionId_predictedPosition_key" ON "SurvivorBootOrderItem"("submissionId", "predictedPosition");

-- CreateIndex
CREATE UNIQUE INDEX "SurvivorBootOrderItem_submissionId_castawayId_key" ON "SurvivorBootOrderItem"("submissionId", "castawayId");

-- CreateIndex
CREATE INDEX "SurvivorAuction_leagueId_idx" ON "SurvivorAuction"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorAuctionLot_auctionId_idx" ON "SurvivorAuctionLot"("auctionId");

-- CreateIndex
CREATE INDEX "SurvivorAuctionBid_auctionId_idx" ON "SurvivorAuctionBid"("auctionId");

-- CreateIndex
CREATE INDEX "SurvivorAuctionBid_lotId_idx" ON "SurvivorAuctionBid"("lotId");

-- CreateIndex
CREATE INDEX "SurvivorAuctionBid_leagueEntryId_idx" ON "SurvivorAuctionBid"("leagueEntryId");

-- CreateIndex
CREATE INDEX "SurvivorAuctionBid_auctionId_lotId_idx" ON "SurvivorAuctionBid"("auctionId", "lotId");

-- CreateIndex
CREATE INDEX "SurvivorOwnedAdvantage_leagueId_idx" ON "SurvivorOwnedAdvantage"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorOwnedAdvantage_leagueEntryId_idx" ON "SurvivorOwnedAdvantage"("leagueEntryId");

-- CreateIndex
CREATE INDEX "SurvivorOwnedAdvantage_expiresEpisodeId_idx" ON "SurvivorOwnedAdvantage"("expiresEpisodeId");

-- CreateIndex
CREATE INDEX "SurvivorOwnedAdvantage_lastAppliedEpisodeId_idx" ON "SurvivorOwnedAdvantage"("lastAppliedEpisodeId");

-- CreateIndex
CREATE INDEX "SurvivorPointTransaction_leagueId_idx" ON "SurvivorPointTransaction"("leagueId");

-- CreateIndex
CREATE INDEX "SurvivorPointTransaction_leagueEntryId_idx" ON "SurvivorPointTransaction"("leagueEntryId");

-- CreateIndex
CREATE INDEX "SurvivorPointTransaction_episodeId_idx" ON "SurvivorPointTransaction"("episodeId");

-- CreateIndex
CREATE INDEX "SurvivorPointTransaction_source_idx" ON "SurvivorPointTransaction"("source");

-- AddForeignKey
ALTER TABLE "SurvivorCastaway" ADD CONSTRAINT "SurvivorCastaway_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorDraft" ADD CONSTRAINT "SurvivorDraft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorDraftSeat" ADD CONSTRAINT "SurvivorDraftSeat_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SurvivorDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorDraftSeat" ADD CONSTRAINT "SurvivorDraftSeat_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorDraftPick" ADD CONSTRAINT "SurvivorDraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "SurvivorDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorDraftPick" ADD CONSTRAINT "SurvivorDraftPick_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorDraftPick" ADD CONSTRAINT "SurvivorDraftPick_castawayId_fkey" FOREIGN KEY ("castawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeMeta" ADD CONSTRAINT "SurvivorEpisodeMeta_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeMeta" ADD CONSTRAINT "SurvivorEpisodeMeta_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeMeta" ADD CONSTRAINT "SurvivorEpisodeMeta_bootCastawayId_fkey" FOREIGN KEY ("bootCastawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeMeta" ADD CONSTRAINT "SurvivorEpisodeMeta_immunityWinnerCastawayId_fkey" FOREIGN KEY ("immunityWinnerCastawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeCastawayResult" ADD CONSTRAINT "SurvivorEpisodeCastawayResult_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeCastawayResult" ADD CONSTRAINT "SurvivorEpisodeCastawayResult_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorEpisodeCastawayResult" ADD CONSTRAINT "SurvivorEpisodeCastawayResult_castawayId_fkey" FOREIGN KEY ("castawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorWeeklyPrediction" ADD CONSTRAINT "SurvivorWeeklyPrediction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorWeeklyPrediction" ADD CONSTRAINT "SurvivorWeeklyPrediction_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorWeeklyPrediction" ADD CONSTRAINT "SurvivorWeeklyPrediction_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorWeeklyPrediction" ADD CONSTRAINT "SurvivorWeeklyPrediction_bootCastawayId_fkey" FOREIGN KEY ("bootCastawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorWeeklyPrediction" ADD CONSTRAINT "SurvivorWeeklyPrediction_immunityWinnerCastawayId_fkey" FOREIGN KEY ("immunityWinnerCastawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorWeeklyPrediction" ADD CONSTRAINT "SurvivorWeeklyPrediction_safePickCastawayId_fkey" FOREIGN KEY ("safePickCastawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorBootOrderSubmission" ADD CONSTRAINT "SurvivorBootOrderSubmission_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorBootOrderSubmission" ADD CONSTRAINT "SurvivorBootOrderSubmission_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorBootOrderSubmission" ADD CONSTRAINT "SurvivorBootOrderSubmission_mergeEpisodeId_fkey" FOREIGN KEY ("mergeEpisodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorBootOrderItem" ADD CONSTRAINT "SurvivorBootOrderItem_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "SurvivorBootOrderSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorBootOrderItem" ADD CONSTRAINT "SurvivorBootOrderItem_castawayId_fkey" FOREIGN KEY ("castawayId") REFERENCES "SurvivorCastaway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorAuction" ADD CONSTRAINT "SurvivorAuction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorAuctionLot" ADD CONSTRAINT "SurvivorAuctionLot_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "SurvivorAuction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorAuctionBid" ADD CONSTRAINT "SurvivorAuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "SurvivorAuction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorAuctionBid" ADD CONSTRAINT "SurvivorAuctionBid_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "SurvivorAuctionLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorAuctionBid" ADD CONSTRAINT "SurvivorAuctionBid_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorOwnedAdvantage" ADD CONSTRAINT "SurvivorOwnedAdvantage_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorOwnedAdvantage" ADD CONSTRAINT "SurvivorOwnedAdvantage_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorOwnedAdvantage" ADD CONSTRAINT "SurvivorOwnedAdvantage_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "SurvivorAuctionLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorOwnedAdvantage" ADD CONSTRAINT "SurvivorOwnedAdvantage_expiresEpisodeId_fkey" FOREIGN KEY ("expiresEpisodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorOwnedAdvantage" ADD CONSTRAINT "SurvivorOwnedAdvantage_lastAppliedEpisodeId_fkey" FOREIGN KEY ("lastAppliedEpisodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorPointTransaction" ADD CONSTRAINT "SurvivorPointTransaction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorPointTransaction" ADD CONSTRAINT "SurvivorPointTransaction_leagueEntryId_fkey" FOREIGN KEY ("leagueEntryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorPointTransaction" ADD CONSTRAINT "SurvivorPointTransaction_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "Episode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurvivorPointTransaction" ADD CONSTRAINT "SurvivorPointTransaction_ownedAdvantageId_fkey" FOREIGN KEY ("ownedAdvantageId") REFERENCES "SurvivorOwnedAdvantage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

