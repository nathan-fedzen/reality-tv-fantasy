import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

function formatDisplayName(user: { name: string | null; email: string | null }, fallback: string) {
  return user.name || user.email || fallback;
}

function toNumber(d: Prisma.Decimal | null | undefined) {
  if (d == null) return 0;
  // Prisma Decimal supports toString safely
  return Number(d.toString());
}

export default async function LeaderboardPage({
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
      startsAt: true,
      startedAt: true,
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  // Optional: You can choose to show leaderboard even before start.
  // We'll allow viewing anytime (it'll just be 0s).
  const entries = await prisma.leagueEntry.findMany({
    where: { leagueId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      picks: {
        select: {
          slot: true,
          multiplier: true,
          queen: { select: { id: true, name: true } },
          queenId: true,
        },
      },
    },
  });

  // Total points per entry across all weeks entered so far
  const grouped = await prisma.leagueEntryScore.groupBy({
    by: ["leagueEntryId"],
    where: { leagueEntry: { leagueId } },
    _sum: { points: true },
  });

  const totalsByEntryId = new Map<string, number>(
    grouped.map((g) => [g.leagueEntryId, toNumber(g._sum.points)])
  );

  // Eliminated queens across the season so far (any week)
  const eliminations = await prisma.episodeResult.findMany({
    where: {
      type: "elimination",
      queenId: { not: null },
      episode: { leagueId },
    },
    select: { queenId: true },
  });

  const eliminatedQueenIds = new Set<string>(
    eliminations.map((e) => e.queenId!).filter(Boolean)
  );

  // Build leaderboard rows
  const rows = entries
    .map((e) => {
      const total = totalsByEntryId.get(e.id) ?? 0;
      return {
        entryId: e.id,
        userId: e.userId,
        createdAt: e.createdAt,
        displayName: formatDisplayName(e.user, e.userId),
        email: e.user.email,
        totalPoints: total,
        picks: e.picks
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((p) => ({
            slot: p.slot,
            multiplier: toNumber(p.multiplier as unknown as Prisma.Decimal) || Number(p.multiplier),
            queenId: p.queenId,
            queenName: p.queen?.name ?? "—",
            eliminated: p.queenId ? eliminatedQueenIds.has(p.queenId) : false,
          })),
      };
    })
    .sort((a, b) => {
      // Desc by points; stable-ish by createdAt
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  // Rank assignment with ties (1,1,3)
  let currentRank = 0;
  let lastPoints: number | null = null;
  const ranked = rows.map((r, idx) => {
    if (lastPoints === null || r.totalPoints !== lastPoints) {
      currentRank = idx + 1;
      lastPoints = r.totalPoints;
    }
    return { ...r, rank: currentRank };
  });

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">{league.name}</p>
        </div>

        <Link href={`/leagues/${league.id}`} className="text-sm underline">
          Back
        </Link>
      </div>

      {ranked.length === 0 ? (
        <div className="rounded-lg border p-4 text-sm text-muted-foreground">
          No entries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {ranked.map((r) => (
            <div
              key={r.entryId}
              className="rounded-2xl border p-4 shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black text-white text-sm font-semibold">
                      {r.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {r.displayName}
                      </div>
                      {r.email && (
                        <div className="truncate text-xs text-muted-foreground">
                          {r.email}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="text-2xl font-bold">{r.totalPoints.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {r.picks.map((p) => (
                  <div
                    key={p.slot}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      p.eliminated ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Slot {p.slot}
                      </span>
                      <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">
                        {p.multiplier}x
                      </span>
                    </div>

                    <div
                      className={`font-medium ${
                        p.eliminated ? "line-through" : ""
                      }`}
                      title={p.queenName}
                    >
                      {p.queenName}
                    </div>
                  </div>
                ))}
              </div>

              {r.picks.some((p) => p.eliminated) && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Struck-through queens have been eliminated and can no longer earn points.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
