import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PicksClient from "./picks-client";
import Link from "next/link";

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

  if (!league.seasonKey || !league.startsAt || !league.submissionDeadline) {
    return (
      <main className="p-6 space-y-3">
        <h1 className="text-2xl font-semibold">Picks — {league.name}</h1>
        <p className="text-sm text-muted-foreground">
          This league is missing season configuration.
        </p>
      </main>
    );
  }

  const now = new Date();
  const revealAllowed = !!league.startedAt || now >= league.startsAt;
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
      user: { select: { displayName: true, name: true, email: true } },
      picks: { select: { slot: true, queenId: true } },
    },
  });

  let entries: Array<{
    userId: string;
    user: { displayName: string | null; name: string | null; email: string | null };
    picks: Array<{ slot: number; queenId: string }>;
  }> = [];

  if (isCommissioner || revealAllowed) {
    entries = await prisma.leagueEntry.findMany({
      where: { leagueId },
      select: {
        userId: true,
        user: { select: { displayName: true, name: true, email: true } },
        picks: { select: { slot: true, queenId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  return (
    <main className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 pb-12 space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-6 shadow-sm">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                🎬 Draft Night
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-semibold truncate">
                Picks — {league.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Deadline: {league.submissionDeadline.toLocaleString()} • Premiere:{" "}
                {league.startsAt.toLocaleString()}
              </p>
            </div>

            <Link
              href={`/leagues/${league.id}`}
              className="relative z-10 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent transition"
            >
              ← Back
            </Link>
          </div>
        </div>

        {/* Client */}
        <PicksClient
          leagueId={league.id}
          queens={queens}
          myPicks={myEntry.picks}
          canEdit={canEdit}
          revealAllowed={revealAllowed}
          isCommissioner={isCommissioner}
          entries={entries}
        />
      </div>
    </main>
  );
}
