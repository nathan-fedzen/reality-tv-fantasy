ALTER TABLE "SurvivorWeeklyPrediction"
ADD COLUMN "secondaryBootCastawayId" TEXT;

CREATE INDEX "SurvivorWeeklyPrediction_secondaryBootCastawayId_idx"
ON "SurvivorWeeklyPrediction"("secondaryBootCastawayId");

ALTER TABLE "SurvivorWeeklyPrediction"
ADD CONSTRAINT "SurvivorWeeklyPrediction_secondaryBootCastawayId_fkey"
FOREIGN KEY ("secondaryBootCastawayId") REFERENCES "SurvivorCastaway"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
