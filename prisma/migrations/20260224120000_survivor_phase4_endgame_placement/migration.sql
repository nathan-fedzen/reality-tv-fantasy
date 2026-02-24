-- Additive Phase 4 column for persisted endgame placement scoring input
ALTER TABLE "SurvivorEpisodeCastawayResult"
ADD COLUMN "endgamePlacement" INTEGER;
