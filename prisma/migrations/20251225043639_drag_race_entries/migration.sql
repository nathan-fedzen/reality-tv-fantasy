-- AlterTable
ALTER TABLE "League" ADD COLUMN     "seasonKey" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "submissionDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Queen" (
    "id" TEXT NOT NULL,
    "seasonKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Queen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueEntry" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueEntryPick" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "queenId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "multiplier" DECIMAL(3,1) NOT NULL,

    CONSTRAINT "LeagueEntryPick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Queen_seasonKey_idx" ON "Queen"("seasonKey");

-- CreateIndex
CREATE UNIQUE INDEX "Queen_seasonKey_name_key" ON "Queen"("seasonKey", "name");

-- CreateIndex
CREATE INDEX "LeagueEntry_userId_idx" ON "LeagueEntry"("userId");

-- CreateIndex
CREATE INDEX "LeagueEntry_leagueId_idx" ON "LeagueEntry"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueEntry_leagueId_userId_key" ON "LeagueEntry"("leagueId", "userId");

-- CreateIndex
CREATE INDEX "LeagueEntryPick_queenId_idx" ON "LeagueEntryPick"("queenId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueEntryPick_entryId_slot_key" ON "LeagueEntryPick"("entryId", "slot");

-- CreateIndex
CREATE INDEX "League_seasonKey_idx" ON "League"("seasonKey");

-- AddForeignKey
ALTER TABLE "LeagueEntry" ADD CONSTRAINT "LeagueEntry_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueEntry" ADD CONSTRAINT "LeagueEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueEntryPick" ADD CONSTRAINT "LeagueEntryPick_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LeagueEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueEntryPick" ADD CONSTRAINT "LeagueEntryPick_queenId_fkey" FOREIGN KEY ("queenId") REFERENCES "Queen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
