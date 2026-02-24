ALTER TABLE "SurvivorEpisodeMeta"
ADD COLUMN "tribalCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "tribals" JSONB;

ALTER TABLE "SurvivorWeeklyPrediction"
ADD COLUMN "tribals" JSONB;
