import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import ConfettiBurst from "@/components/confetti-burst";

function formatDisplayName(
  user: { displayName?: string | null; name: string | null; email: string | null },
  fallback: string
) {
  return user.displayName || user.name || user.email || fallback;
}

function toNumber(d: Prisma.Decimal | null | undefined) {
  if (d == null) return 0;
  return Number(d.toString());
}

function jsonRecord(
  value: Prisma.JsonValue | null | undefined
): Prisma.JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.JsonObject;
}

function jsonNumber(value: Prisma.JsonValue | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function jsonPathNumber(
  value: Prisma.JsonValue | null | undefined,
  path: string[]
) {
  let current: Prisma.JsonValue | undefined | null = value;
  for (const segment of path) {
    const record = jsonRecord(current);
    if (!record) return 0;
    current = record[segment];
  }
  return jsonNumber(current ?? undefined);
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type SurvivorTiebreakPrediction = {
  leagueEntryId: string;
  tribals: Prisma.JsonValue | null;
  bootCastawayId: string | null;
  secondaryBootCastawayId: string | null;
  episode: {
    survivorCastawayResults: Array<{ castawayId: string }>;
  };
};

function predictedBootCastawayIds(prediction: SurvivorTiebreakPrediction) {
  const fromTribals = new Set<string>();
  if (Array.isArray(prediction.tribals)) {
    for (const row of prediction.tribals) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const castawayId = (row as Record<string, unknown>).bootCastawayId;
      if (typeof castawayId !== "string") continue;
      const trimmed = castawayId.trim();
      if (trimmed) fromTribals.add(trimmed);
    }
  }

  if (fromTribals.size > 0) {
    return Array.from(fromTribals);
  }

  return Array.from(
    new Set(
      [prediction.bootCastawayId, prediction.secondaryBootCastawayId]
        .filter((value): value is string => !!value)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function countCorrectEliminationPredictions(
  predictions: SurvivorTiebreakPrediction[]
) {
  const result = new Map<string, number>();

  for (const prediction of predictions) {
    const predictedBoots = predictedBootCastawayIds(prediction);
    if (predictedBoots.length === 0) continue;

    const actualBoots = new Set(
      prediction.episode.survivorCastawayResults.map((row) => row.castawayId)
    );
    const hits = predictedBoots.filter((castawayId) => actualBoots.has(castawayId)).length;
    if (hits === 0) continue;

    result.set(
      prediction.leagueEntryId,
      (result.get(prediction.leagueEntryId) ?? 0) + hits
    );
  }

  return result;
}

type Row = {
  entryId: string;
  createdAt: Date;
  displayName: string;
  email: string | null;
  totalPoints: number;
  correctEliminationPredictions: number;
  picks: {
    slot: number;
    multiplier: number;
    queenId: string | null;
    queenName: string;
    eliminated: boolean;
  }[];
  survivorRoster: {
    castawayId: string;
    castawayName: string;
    eliminated: boolean;
  }[];
  survivorPointsBreakdown: {
    performance: number;
    predictions: number;
    bootOrder: number;
    lastSurvivorStanding: number;
    advantages: number;
    other: number;
  };
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
    select: { id: true, name: true, showType: true },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  const leagueHref = `/leagues/${league.id}`;
  const isSurvivor = league.showType === "SURVIVOR";

  const entries = await prisma.leagueEntry.findMany({
    where: { leagueId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      user: { select: { displayName: true, name: true, email: true } },
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

  const correctBootPredictionsByEntryId = new Map<string, number>();
  if (isSurvivor) {
    const survivorPredictions = await prisma.survivorWeeklyPrediction.findMany({
      where: {
        leagueId,
      },
      select: {
        leagueEntryId: true,
        tribals: true,
        bootCastawayId: true,
        secondaryBootCastawayId: true,
        episode: {
          select: {
            survivorCastawayResults: {
              where: { eliminated: true },
              select: { castawayId: true },
            },
          },
        },
      },
    });
    const counts = countCorrectEliminationPredictions(survivorPredictions);
    counts.forEach((value, key) => correctBootPredictionsByEntryId.set(key, value));
  }

  const survivorRosterByEntryId = new Map<
    string,
    Array<{ castawayId: string; castawayName: string; eliminated: boolean }>
  >();
  const survivorPointsBreakdownByEntryId = new Map<
    string,
    {
      performance: number;
      predictions: number;
      bootOrder: number;
      lastSurvivorStanding: number;
      advantages: number;
      other: number;
    }
  >();

  if (isSurvivor) {
    const [draftPicks, eliminatedResults, scoreRows] = await Promise.all([
      prisma.survivorDraftPick.findMany({
        where: { draft: { leagueId } },
        select: {
          leagueEntryId: true,
          castawayId: true,
          castaway: { select: { name: true } },
          overallPick: true,
        },
        orderBy: [{ leagueEntryId: "asc" }, { overallPick: "asc" }],
      }),
      prisma.survivorEpisodeCastawayResult.findMany({
        where: { leagueId, eliminated: true },
        select: { castawayId: true },
        distinct: ["castawayId"],
      }),
      prisma.leagueEntryScore.findMany({
        where: { leagueEntry: { leagueId } },
        select: {
          leagueEntryId: true,
          points: true,
          breakdown: true,
        },
      }),
    ]);

    const eliminatedCastawayIds = new Set(
      eliminatedResults.map((row) => row.castawayId)
    );

    for (const pick of draftPicks) {
      const list = survivorRosterByEntryId.get(pick.leagueEntryId) ?? [];
      list.push({
        castawayId: pick.castawayId,
        castawayName: pick.castaway.name,
        eliminated: eliminatedCastawayIds.has(pick.castawayId),
      });
      survivorRosterByEntryId.set(pick.leagueEntryId, list);
    }

    for (const score of scoreRows) {
      const existing = survivorPointsBreakdownByEntryId.get(score.leagueEntryId) ?? {
        performance: 0,
        predictions: 0,
        bootOrder: 0,
        lastSurvivorStanding: 0,
        advantages: 0,
        other: 0,
      };

      const performance = jsonPathNumber(score.breakdown, ["performanceTotal"]);
      const predictions = jsonPathNumber(score.breakdown, [
        "predictions",
        "cappedPoints",
      ]);
      const bootOrder = jsonPathNumber(score.breakdown, ["bootOrder", "points"]);
      const lastSurvivorStanding = jsonPathNumber(score.breakdown, [
        "engagement",
        "lastSurvivorStanding",
        "points",
      ]);
      const advantages = jsonPathNumber(score.breakdown, ["advantages", "points"]);

      const scoreTotal = toNumber(score.points);
      const categorizedTotal =
        performance + predictions + bootOrder + lastSurvivorStanding + advantages;

      existing.performance += performance;
      existing.predictions += predictions;
      existing.bootOrder += bootOrder;
      existing.lastSurvivorStanding += lastSurvivorStanding;
      existing.advantages += advantages;
      existing.other += scoreTotal - categorizedTotal;

      survivorPointsBreakdownByEntryId.set(score.leagueEntryId, existing);
    }
  }

  const rowsBase = entries.map((e) => {
    const total = totalsByEntryId.get(e.id) ?? 0;
    const display = formatDisplayName(e.user, e.userId);

    return {
      entryId: e.id,
      createdAt: e.createdAt,
      displayName: display,
      email: e.user.email,
      totalPoints: total,
      correctEliminationPredictions: correctBootPredictionsByEntryId.get(e.id) ?? 0,
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
      survivorRoster: survivorRosterByEntryId.get(e.id) ?? [],
      survivorPointsBreakdown: survivorPointsBreakdownByEntryId.get(e.id) ?? {
        performance: 0,
        predictions: 0,
        bootOrder: 0,
        lastSurvivorStanding: 0,
        advantages: 0,
        other: 0,
      },
    };
  });

  rowsBase.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (
      isSurvivor &&
      b.correctEliminationPredictions !== a.correctEliminationPredictions
    ) {
      return b.correctEliminationPredictions - a.correctEliminationPredictions;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let currentRank = 0;
  let lastPoints: number | null = null;
  let lastCorrectPredictions: number | null = null;
  const rankedNow = rowsBase.map((r, idx) => {
    if (
      lastPoints === null ||
      r.totalPoints !== lastPoints ||
      (isSurvivor && r.correctEliminationPredictions !== lastCorrectPredictions)
    ) {
      currentRank = idx + 1;
      lastPoints = r.totalPoints;
      lastCorrectPredictions = r.correctEliminationPredictions;
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
      const cumulativeCorrectPredictionsThrough = async (week: number) => {
        if (!isSurvivor) return new Map<string, number>();

        const survivorPredictions = await prisma.survivorWeeklyPrediction.findMany({
          where: {
            leagueId,
            episode: {
              leagueId,
              week: { lte: week },
            },
          },
          select: {
            leagueEntryId: true,
            tribals: true,
            bootCastawayId: true,
            secondaryBootCastawayId: true,
            episode: {
              select: {
                survivorCastawayResults: {
                  where: { eliminated: true },
                  select: { castawayId: true },
                },
              },
            },
          },
        });
        return countCorrectEliminationPredictions(survivorPredictions);
      };

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
      const latestCorrectPredictions =
        await cumulativeCorrectPredictionsThrough(latestWeek);
      const prevCorrectPredictions =
        await cumulativeCorrectPredictionsThrough(prevWeek);

      const makeRanks = (
        totals: Map<string, number>,
        correctPredictions: Map<string, number>
      ) => {
        const arr = rankedNow.map((r) => ({
          entryId: r.entryId,
          createdAt: r.createdAt,
          points: totals.get(r.entryId) ?? 0,
          correctEliminationPredictions: correctPredictions.get(r.entryId) ?? 0,
        }));

        arr.sort((a, b) =>
          b.points !== a.points
            ? b.points - a.points
            : isSurvivor &&
                b.correctEliminationPredictions !==
                  a.correctEliminationPredictions
              ? b.correctEliminationPredictions - a.correctEliminationPredictions
            : a.createdAt.getTime() - b.createdAt.getTime()
        );

        let rank = 0;
        let last = null as number | null;
        let lastCorrect = null as number | null;
        const out = new Map<string, number>();

        arr.forEach((it, idx) => {
          if (
            last === null ||
            it.points !== last ||
            (isSurvivor && it.correctEliminationPredictions !== lastCorrect)
          ) {
            rank = idx + 1;
            last = it.points;
            lastCorrect = it.correctEliminationPredictions;
          }
          out.set(it.entryId, rank);
        });

        return out;
      };

      const latestRanks = makeRanks(latestTotals, latestCorrectPredictions);
      const prevRanks = makeRanks(prevTotals, prevCorrectPredictions);

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
        {/* Header (mobile-first) */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-5 sm:p-6 shadow-sm">
          <div className="pointer-events-none absolute -top-16 -right-16 -z-10 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 -z-10 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />

          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                🏆 Scoreboard
              </div>
              <h1 className="text-xl sm:text-3xl font-semibold truncate">
                Leaderboard
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                {league.name}
              </p>
            </div>

            <Link
              href={leagueHref}
              className="shrink-0 rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-accent transition"
            >
              ← Back
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
              <div className="min-w-0">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  🎭 Standings
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {isSurvivor
                    ? "Ties are broken by total correct elimination predictions."
                    : "Picks are shown below each player. Eliminated queens are struck through."}
                </p>
              </div>

              <span className="shrink-0 rounded-full bg-primary/15 text-primary px-2.5 py-1 text-xs font-semibold ring-1 ring-primary/25">
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
                      "px-4 sm:px-5 py-4 transition",
                      "hover:bg-accent/60",
                      topStyle,
                      "border-b border-border last:border-b-0",
                    ].join(" ")}
                  >
                    {/* Mobile-first row header (stacked) */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-start gap-3">
                        {/* Rank badge */}
                        <div className="shrink-0">
                          <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-background/70 ring-1 ring-border font-extrabold tabular-nums">
                            {r.rank}
                          </div>
                        </div>

                        {/* Name block */}
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {r.displayName}
                          </div>
                          {r.email && (
                            <div className="truncate text-xs text-muted-foreground">
                              {r.email}
                            </div>
                          )}

                          {/* Badges row (wraps) */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {/* Hide avatar on mobile; looks cramped */}
                            <span className="inline-flex sm:hidden rounded-full bg-background/60 px-2 py-0.5 text-xs font-semibold ring-1 ring-border">
                              {initials(r.displayName)}
                            </span>

                            {r.rank === 1 && (
                              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[11px] font-semibold">
                                👑 front-runner
                              </span>
                            )}

                            <span
                              className={[
                                "rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums",
                                movement.cls,
                              ].join(" ")}
                            >
                              {movement.text}{" "}
                              <span className="text-muted-foreground font-medium">
                                vs last week
                              </span>
                            </span>
                            {isSurvivor && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                                Correct boots: {r.correctEliminationPredictions}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Score block */}
                      <div className="shrink-0 text-right">
                        <div className="text-xs text-muted-foreground">Total</div>
                        <div className="text-2xl font-extrabold tabular-nums leading-tight">
                          {r.totalPoints.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">pts</div>
                      </div>
                    </div>

                    {!isSurvivor && (
                      <>
                    {/* Picks */}
                    <div className="mt-4 space-y-2">
                      {r.picks.map((p) => (
                        <div
                          key={p.slot}
                          className={[
                            "rounded-2xl border border-border bg-background/60 px-3 py-2 text-sm transition",
                            "hover:bg-background",
                            p.eliminated ? "opacity-70" : "",
                          ].join(" ")}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
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
                                "truncate text-right font-medium max-w-[65%]",
                                p.eliminated ? "line-through" : "",
                              ].join(" ")}
                              title={p.queenName}
                            >
                              {p.queenName}
                            </div>
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
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isSurvivor && ranked.length > 0 && (
          <section className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="text-base font-semibold">
                Survivor Teams and Point Sources
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Active and eliminated castaways, plus where each player&apos;s
                points are coming from.
              </p>
            </div>

            <div className="divide-y divide-border">
              {ranked.map((r) => {
                const active = r.survivorRoster.filter((castaway) => !castaway.eliminated);
                const eliminated = r.survivorRoster.filter((castaway) => castaway.eliminated);
                const breakdownRows = [
                  {
                    label: "Performance",
                    value: r.survivorPointsBreakdown.performance,
                    tone: "text-emerald-300",
                  },
                  {
                    label: "Predictions",
                    value: r.survivorPointsBreakdown.predictions,
                    tone: "text-sky-300",
                  },
                  {
                    label: "Boot order",
                    value: r.survivorPointsBreakdown.bootOrder,
                    tone: "text-violet-300",
                  },
                  {
                    label: "Last survivor standing",
                    value: r.survivorPointsBreakdown.lastSurvivorStanding,
                    tone: "text-amber-300",
                  },
                  {
                    label: "Advantages",
                    value: r.survivorPointsBreakdown.advantages,
                    tone: "text-pink-300",
                  },
                  {
                    label: "Other",
                    value: r.survivorPointsBreakdown.other,
                    tone: "text-muted-foreground",
                  },
                ];

                return (
                  <div key={`${r.entryId}-survivor-breakdown`} className="p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">{r.displayName}</div>
                        <div className="text-xs text-muted-foreground">
                          Rank #{r.rank} | {r.totalPoints.toFixed(2)} total points
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Roster</div>
                        <div className="text-sm font-semibold">
                          {active.length} active / {eliminated.length} eliminated
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-emerald-200">
                          Active survivors
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {active.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              None remaining
                            </span>
                          ) : (
                            active.map((castaway) => (
                              <span
                                key={`${r.entryId}-active-${castaway.castawayId}`}
                                className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium"
                              >
                                {castaway.castawayName}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
                        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-red-200">
                          Eliminated survivors
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {eliminated.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None yet</span>
                          ) : (
                            eliminated.map((castaway) => (
                              <span
                                key={`${r.entryId}-out-${castaway.castawayId}`}
                                className="rounded-full border border-destructive/40 bg-destructive/15 px-2.5 py-1 text-xs font-medium line-through"
                              >
                                {castaway.castawayName}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {breakdownRows.map((item) => (
                        <div
                          key={`${r.entryId}-${item.label}`}
                          className="rounded-xl border border-border bg-background/60 px-3 py-2"
                        >
                          <div className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                            {item.label}
                          </div>
                          <div className={`mt-1 text-lg font-semibold tabular-nums ${item.tone}`}>
                            {item.value.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
