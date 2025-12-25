// src/app/leagues/[id]/picks/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PicksClient from "./picks-client";

export default async function PicksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      createdById: true,
      seasonKey: true,
      startsAt: true,
      submissionDeadline: true,
      startedAt: true,
    },
  });

  if (!league) {
    return <main className="p-6">League not found.</main>;
  }

  // Your schema allows these to be null, so guard.
  if (!league.seasonKey || !league.startsAt || !league.submissionDeadline) {
    return (
      <main className="p-6 space-y-3">
        <h1 className="text-2xl font-bold">Picks — {league.name}</h1>
        <p className="text-sm text-muted-foreground">
          This league is missing season configuration (seasonKey/startsAt/submissionDeadline).
        </p>
      </main>
    );
  }

  const now = new Date();

  // Reveal: premiere reached OR commissioner started early (startedAt set)
  const revealAllowed = !!league.startedAt || now >= league.startsAt;

  // Edit: before submissionDeadline AND not started early AND before premiere
  const canEdit =
    now < league.submissionDeadline && !league.startedAt && now < league.startsAt;

  const isCommissioner = user.id === league.createdById;

  const queens = await prisma.queen.findMany({
    where: { seasonKey: league.seasonKey },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const myEntry = await prisma.leagueEntry.upsert({
    where: { leagueId_userId: { leagueId, userId: user.id } },
    create: { leagueId, userId: user.id },
    update: {},
    select: {
      id: true,
      userId: true,
      user: { select: { name: true, email: true } },
      picks: { select: { slot: true, queenId: true } },
    },
  });

  let entries: Array<{
    userId: string;
    user: { name: string | null; email: string | null };
    picks: Array<{ slot: number; queenId: string }>;
  }> = [];

  if (isCommissioner || revealAllowed) {
    entries = await prisma.leagueEntry.findMany({
      where: { leagueId },
      select: {
        userId: true,
        user: { select: { name: true, email: true } },
        picks: { select: { slot: true, queenId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  return (
    <main className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Picks — {league.name}</h1>
        <p className="text-sm text-muted-foreground">
          Deadline: {league.submissionDeadline.toLocaleString()} • Premiere:{" "}
          {league.startsAt.toLocaleString()}
        </p>
      </div>

      <PicksClient
        leagueId={league.id}
        queens={queens}
        myPicks={myEntry.picks}
        canEdit={canEdit}
        revealAllowed={revealAllowed}
        isCommissioner={isCommissioner}
        entries={entries}
      />
    </main>
  );
}
