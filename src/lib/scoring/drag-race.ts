import { Prisma, PrismaClient } from "@prisma/client";

const DRAG_RACE_POINTS = {
  survived: 1,
  miniWin: 15,
  mainWin: 25,
  lipsyncWin: 10,
};

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Recomputes LeagueEntryScore for a single league+episode (week).
 * MVP logic:
 * - Per picked queen, award:
 *   survived + miniWin + mainWin + lipsyncWin
 * - Multiply per slot multiplier (2.5/2.0/1.5/1.0 already stored on picks)
 * - Sum across the 4 picks into one score for the entry for that episode
 */
export async function recomputeDragRaceWeekScores(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  // Load current episode WITH its week number
  const episode = await tx.episode.findUnique({
    where: { id: episodeId },
    include: { results: true },
  });

  if (!episode) return;

  const currentWeek = episode.week;
  const results = episode.results;

  // Winners THIS week
  const miniWinners = new Set(
    results
      .filter((r) => r.type === "mini")
      .map((r) => r.queenId!)
      .filter(Boolean)
  );

  const mainWinners = new Set(
    results
      .filter((r) => r.type === "main")
      .map((r) => r.queenId!)
      .filter(Boolean)
  );

  const lipsyncWinner =
    results.find((r) => r.type === "lipsync")?.queenId ?? null;

  const eliminatedThisWeek =
    results.find((r) => r.type === "elimination")?.queenId ?? null;

  // 🔥 NEW: fetch ALL prior eliminations (weeks < currentWeek)
  const priorEliminations = await tx.episodeResult.findMany({
    where: {
      type: "elimination",
      queenId: { not: null },
      episode: {
        leagueId,
        week: { lt: currentWeek },
      },
    },
    select: { queenId: true },
  });

  const permanentlyEliminated = new Set<string>(
    priorEliminations.map((e) => e.queenId!).filter(Boolean)
  );

  // Add this week's elimination as well
  if (eliminatedThisWeek) {
    permanentlyEliminated.add(eliminatedThisWeek);
  }

  const entries = await tx.leagueEntry.findMany({
    where: { leagueId },
    include: { picks: true },
  });

  // Clear previous scores for this episode so edits are clean
  await tx.leagueEntryScore.deleteMany({ where: { episodeId } });

  const rows: Prisma.LeagueEntryScoreCreateManyInput[] = [];

  for (const entry of entries) {
    let total = new Prisma.Decimal(0);

    for (const pick of entry.picks) {
      const qid = pick.queenId;

      // ❌ permanently eliminated queens earn NOTHING
      if (permanentlyEliminated.has(qid)) continue;

      const mult = new Prisma.Decimal(pick.multiplier.toString());

      let base = DRAG_RACE_POINTS.survived;

      if (miniWinners.has(qid)) base += DRAG_RACE_POINTS.miniWin;
      if (mainWinners.has(qid)) base += DRAG_RACE_POINTS.mainWin;
      if (lipsyncWinner && qid === lipsyncWinner)
        base += DRAG_RACE_POINTS.lipsyncWin;

      total = total.add(new Prisma.Decimal(base).mul(mult));
    }

    rows.push({
      leagueEntryId: entry.id,
      episodeId,
      points: total,
    });
  }

  if (rows.length > 0) {
    await tx.leagueEntryScore.createMany({ data: rows });
  }
}

