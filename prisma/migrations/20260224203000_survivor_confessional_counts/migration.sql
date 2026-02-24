ALTER TABLE "SurvivorEpisodeCastawayResult"
ADD COLUMN "confessionalCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SurvivorCastaway"
ADD COLUMN "totalConfessionals" INTEGER NOT NULL DEFAULT 0;
