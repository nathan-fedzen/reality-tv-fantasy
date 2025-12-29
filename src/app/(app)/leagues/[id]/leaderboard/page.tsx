import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import ConfettiBurst from "@/components/confetti-burst";

function formatDisplayName(
  user: { name: string | null; email: string | null },
  fallback: string
) {
  return user.name || user.email || fallback;
}

function toNumber(d: Prisma.Decimal | null | undefined) {
  if (d == null) return 0;
  return Number(d.toString());
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Row = {
  entryId: string;
  createdAt: Date;
  displayName: string;
  email: string | null;
  totalPoints: number;
  picks: {
    slot: number;
    multiplier: number;
    queenId: string | null;
    queenName: string;
    eliminated: boolean;
  }[];
  rank: number;
  lastWeekRank: number | null;
  deltaRank: number | null; // + means moved up
};

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
    select: { id: true, name: true },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  // ✅ IMPORTANT: route group / (app) typically maps to /app in the URL
  const leagueHref = `/leagues/${league.id}`;

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
    orderBy: { createdAt: "asc" },
  });

  const grouped = await prisma.leagueEntryScore.groupBy({
    by: ["leagueEntryId"],
    where: { leagueEntry: { leagueId } },
    _sum: { points: true },
  });

  const totalsByEntryId = new Map<string, number>(
    grouped.map((g) => [g.leagueEntryId, toNumber(g._sum.points)])
  );

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

  const rowsBase = entries.map((e) => {
    const total = totalsByEntryId.get(e.id) ?? 0;
    const display = formatDisplayName(e.user, e.userId);

    return {
      entryId: e.id,
      createdAt: e.createdAt,
      displayName: display,
      email: e.user.email,
      totalPoints: total,
      picks: e.picks
        .slice()
        .sort((a, b) => a.slot - b.slot)
        .map((p) => ({
          slot: p.slot,
          multiplier:
            toNumber(p.multiplier as unknown as Prisma.Decimal) ||
            Number(p.multiplier),
          queenId: p.queenId,
          queenName: p.queen?.name ?? "—",
          eliminated: p.queenId ? eliminatedQueenIds.has(p.queenId) : false,
        })),
    };
  });

  rowsBase.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let currentRank = 0;
  let lastPoints: number | null = null;
  const rankedNow = rowsBase.map((r, idx) => {
    if (lastPoints === null || r.totalPoints !== lastPoints) {
      currentRank = idx + 1;
      lastPoints = r.totalPoints;
    }
    return { ...r, rank: currentRank };
  });

  let movementByEntryId = new Map<
    string,
    { lastWeekRank: number | null; deltaRank: number | null }
  >();

  try {
    const recentWeeks = await prisma.episode.findMany({
      where: {
        leagueId,
        scores: { some: {} },
      },
      orderBy: { week: "desc" },
      take: 2,
      select: { week: true },
    });

    const latestWeek = recentWeeks?.[0]?.week ?? null;
    const prevWeek = recentWeeks?.[1]?.week ?? null;

    if (typeof latestWeek === "number" && typeof prevWeek === "number") {
      const cumulativeTotalsThrough = async (week: number) => {
        const sums = await prisma.leagueEntryScore.groupBy({
          by: ["leagueEntryId"],
          where: {
            leagueEntry: { leagueId },
            episode: { leagueId, week: { lte: week } },
          },
          _sum: { points: true },
        });

        return new Map(
          sums.map((s) => [s.leagueEntryId, toNumber(s._sum.points)])
        );
      };

      const latestTotals = await cumulativeTotalsThrough(latestWeek);
      const prevTotals = await cumulativeTotalsThrough(prevWeek);

      const makeRanks = (totals: Map<string, number>) => {
        const arr = rankedNow.map((r) => ({
          entryId: r.entryId,
          createdAt: r.createdAt,
          points: totals.get(r.entryId) ?? 0,
        }));

        arr.sort((a, b) =>
          b.points !== a.points
            ? b.points - a.points
            : a.createdAt.getTime() - b.createdAt.getTime()
        );

        let rank = 0;
        let last = null as number | null;
        const out = new Map<string, number>();

        arr.forEach((it, idx) => {
          if (last === null || it.points !== last) {
            rank = idx + 1;
            last = it.points;
          }
          out.set(it.entryId, rank);
        });

        return out;
      };

      const latestRanks = makeRanks(latestTotals);
      const prevRanks = makeRanks(prevTotals);

      movementByEntryId = new Map(
        rankedNow.map((r) => {
          const lastWeekRank = prevRanks.get(r.entryId) ?? null;
          const thisWeekRank = latestRanks.get(r.entryId) ?? null;
          const delta =
            lastWeekRank != null && thisWeekRank != null
              ? lastWeekRank - thisWeekRank
              : null;

          return [r.entryId, { lastWeekRank, deltaRank: delta }];
        })
      );
    }
  } catch {
    // movement stays unknown
  }

  const ranked: Row[] = rankedNow.map((r) => {
    const m = movementByEntryId.get(r.entryId);
    return {
      ...r,
      lastWeekRank: m?.lastWeekRank ?? null,
      deltaRank: m?.deltaRank ?? null,
    };
  });

  const top3 = ranked.slice(0, 3);
  const winnerKey = top3[0]?.entryId ?? "none";

  return (
    <main className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 pb-12 space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-6 shadow-sm">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />


          <div className="relative z-10 flex items-start justify-between gap-4">
            <div className="space-y-2 min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                🏆 Scoreboard
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold truncate">
                Leaderboard
              </h1>
              <p className="text-sm text-muted-foreground truncate">
                {league.name}
              </p>
            </div>

            {/* ✅ FIXED */}
            <Link
              href={leagueHref}
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent transition"
            >
              ← Back to league
            </Link>
          </div>
        </div>

        {/* Podium */}
        {ranked.length > 0 && (
          <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            <ConfettiBurst triggerKey={winnerKey} />

           <div className="relative z-10 p-5">
              <h2 className="text-base font-semibold flex items-center gap-2">
                🏅 Podium
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Top 3 at a glance.
              </p>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {top3.map((p, idx) => {
                  const place = idx + 1;
                  const placeLabel =
                    place === 1 ? "👑 1st" : place === 2 ? "🥈 2nd" : "🥉 3rd";

                  const tint =
                    place === 1
                      ? "from-primary/20 to-secondary/10"
                      : place === 2
                        ? "from-secondary/20 to-primary/10"
                        : "from-muted to-background";

                  return (
                    <div
                      key={p.entryId}
                      className={[
                        "rounded-2xl border border-border bg-gradient-to-br p-4 shadow-sm",
                        tint,
                        place === 1 ? "sm:scale-[1.02]" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold">
                            {placeLabel}
                          </div>
                          <div className="mt-1 font-semibold truncate">
                            {p.displayName}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {p.totalPoints.toFixed(2)} pts
                          </div>
                        </div>

                        <div className="h-10 w-10 rounded-2xl bg-background/70 ring-1 ring-border flex items-center justify-center font-bold">
                          {initials(p.displayName)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Standings */}
        {ranked.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
            No entries yet.
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  🎭 Standings
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Picks are shown below each player. Eliminated queens are struck
                  through.
                </p>
              </div>

              <span className="rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs font-semibold ring-1 ring-primary/25">
                Live
              </span>
            </div>

            <div className="border-t border-border">
              {ranked.map((r) => {
                const topStyle =
                  r.rank === 1
                    ? "bg-gradient-to-r from-primary/15 to-transparent"
                    : r.rank === 2
                      ? "bg-gradient-to-r from-secondary/15 to-transparent"
                      : r.rank === 3
                        ? "bg-gradient-to-r from-muted to-transparent"
                        : "";

                const delta = r.deltaRank;
                const movement =
                  delta == null
                    ? { text: "—", cls: "text-muted-foreground" }
                    : delta > 0
                      ? { text: `▲ ${delta}`, cls: "text-success font-semibold" }
                      : delta < 0
                        ? {
                          text: `▼ ${Math.abs(delta)}`,
                          cls: "text-destructive font-semibold",
                        }
                        : { text: "• 0", cls: "text-muted-foreground font-semibold" };

                return (
                  <div
                    key={r.entryId}
                    className={[
                      "px-5 py-4 transition",
                      "hover:bg-accent/60",
                      topStyle,
                      "border-b border-border last:border-b-0",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="w-10 shrink-0 text-center">
                          <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-background/70 ring-1 ring-border font-extrabold tabular-nums">
                            {r.rank}
                          </div>
                        </div>

                        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 ring-1 ring-border flex items-center justify-center font-bold">
                          {initials(r.displayName)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="truncate text-sm font-semibold">
                              {r.displayName}
                            </div>
                            {r.rank === 1 && (
                              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold">
                                👑 front-runner
                              </span>
                            )}
                          </div>

                          {r.email && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.email}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="text-2xl font-extrabold tabular-nums">
                          {r.totalPoints.toFixed(2)}
                        </div>

                        <div
                          className={[
                            "mt-1 text-xs tabular-nums",
                            movement.cls,
                          ].join(" ")}
                        >
                          {movement.text}{" "}
                          <span className="text-muted-foreground">
                            vs last week
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-2">
                      {r.picks.map((p) => (
                        <div
                          key={p.slot}
                          className={[
                            "flex items-center justify-between rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm transition",
                            "hover:bg-background",
                            p.eliminated ? "opacity-60" : "",
                          ].join(" ")}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-semibold text-muted-foreground">
                              Slot {p.slot}
                            </span>

                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                              {p.multiplier}x
                            </span>

                            {p.eliminated && (
                              <span className="rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-xs font-semibold ring-1 ring-destructive/25">
                                ☠ eliminated
                              </span>
                            )}
                          </div>

                          <div
                            className={[
                              "font-medium truncate max-w-[60%] text-right",
                              p.eliminated ? "line-through" : "",
                            ].join(" ")}
                            title={p.queenName}
                          >
                            {p.queenName}
                          </div>
                        </div>
                      ))}
                    </div>

                    {r.picks.some((p) => p.eliminated) && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        Struck-through queens have been eliminated and can no
                        longer earn points.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
