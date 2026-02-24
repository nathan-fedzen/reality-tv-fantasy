CREATE UNIQUE INDEX IF NOT EXISTS "SurvivorAuctionBid_auctionId_lotId_leagueEntryId_key"
ON "SurvivorAuctionBid" ("auctionId", "lotId", "leagueEntryId");
