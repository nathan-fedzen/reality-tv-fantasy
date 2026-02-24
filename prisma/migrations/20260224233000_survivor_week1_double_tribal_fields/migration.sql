ALTER TABLE "SurvivorEpisodeMeta"
ADD COLUMN "secondaryBootCastawayId" TEXT,
ADD COLUMN "secondaryBootVoteCount" INTEGER,
ADD COLUMN "secondaryImmunityWinnerCastawayId" TEXT;

CREATE INDEX "SurvivorEpisodeMeta_secondaryBootCastawayId_idx"
ON "SurvivorEpisodeMeta"("secondaryBootCastawayId");

CREATE INDEX "SurvivorEpisodeMeta_secondaryImmunityWinnerCastawayId_idx"
ON "SurvivorEpisodeMeta"("secondaryImmunityWinnerCastawayId");

ALTER TABLE "SurvivorEpisodeMeta"
ADD CONSTRAINT "SurvivorEpisodeMeta_secondaryBootCastawayId_fkey"
FOREIGN KEY ("secondaryBootCastawayId") REFERENCES "SurvivorCastaway"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SurvivorEpisodeMeta"
ADD CONSTRAINT "SurvivorEpisodeMeta_secondaryImmunityWinnerCastawayId_fkey"
FOREIGN KEY ("secondaryImmunityWinnerCastawayId") REFERENCES "SurvivorCastaway"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SurvivorWeeklyPrediction"
ADD COLUMN "secondaryBootVoteCount" INTEGER,
ADD COLUMN "secondaryImmunityWinnerCastawayId" TEXT,
ADD COLUMN "secondarySafePickCastawayId" TEXT;

CREATE INDEX "SurvivorWeeklyPrediction_secondaryImmunityWinnerCastawayId_idx"
ON "SurvivorWeeklyPrediction"("secondaryImmunityWinnerCastawayId");

CREATE INDEX "SurvivorWeeklyPrediction_secondarySafePickCastawayId_idx"
ON "SurvivorWeeklyPrediction"("secondarySafePickCastawayId");

ALTER TABLE "SurvivorWeeklyPrediction"
ADD CONSTRAINT "SurvivorWeeklyPrediction_secondaryImmunityWinnerCastawayId_fkey"
FOREIGN KEY ("secondaryImmunityWinnerCastawayId") REFERENCES "SurvivorCastaway"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SurvivorWeeklyPrediction"
ADD CONSTRAINT "SurvivorWeeklyPrediction_secondarySafePickCastawayId_fkey"
FOREIGN KEY ("secondarySafePickCastawayId") REFERENCES "SurvivorCastaway"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
