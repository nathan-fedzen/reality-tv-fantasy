import { Prisma, PrismaClient } from "@prisma/client";

const DRAG_RACE_POINTS = {
  survived: 1,
  miniWin: 15,
  mainWin: 25,
  lipsyncWin: 10,
};

const FINALE_POINTS = {
  top4: 15,
  top2: 25,
  winner: 50,
};

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Recomputes LeagueEntryScore for a single league+episode (week).
 *
 * REGULAR logic:
 * - Per picked queen, award:
 *   survived + miniWin + mainWin + lipsyncWin
 * - Multiply per slot multiplier (2.5/2.0/1.5/1.0 stored on picks)
 * - Sum across the 4 picks into one score for the entry for that episode
 *
 * FINALE logic:
 * - For each picked queen, award placement points based on actual finale outcome:
 *   top4 = 15, top2 = 25, winner = 50 (highest applicable, NOT stacked)
 * - Plus any added mini/main/lipsync wins (using DRAG_RACE_POINTS values, as counts)
 * - Multiply by slot multiplier
 */
export async function recomputeDragRaceWeekScores(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  // Load current episode WITH its week number AND finale info if present
  const episode = await tx.episode.findUnique({
    where: { id: episodeId },
    include: {
      results: true,
      finalePlacements: true,
      finaleExtras: true,
    },
  });

  if (!episode) return;

  // Clear previous scores for this episode so edits are clean
  await tx.leagueEntryScore.deleteMany({ where: { episodeId } });

  const entries = await tx.leagueEntry.findMany({
    where: { leagueId },
    include: { picks: true },
  });

  const rows: Prisma.LeagueEntryScoreCreateManyInput[] = [];

  // =========================
  // ✅ FINALE SCORING BRANCH
  // =========================
  if (episode.episodeType === "FINALE") {
    // Build quick lookup maps:
    // placementByQueenId: queenId -> place (1..4)
    const placementByQueenId = new Map<string, number>();
    for (const p of episode.finalePlacements) {
      if (p.queenId) placementByQueenId.set(p.queenId, p.place);
    }

    // extrasByQueenId: queenId -> { miniWins, mainWins, lipsyncWins }
    const extrasByQueenId = new Map<
      string,
      { miniWins: number; mainWins: number; lipsyncWins: number }
    >();
    for (const ex of episode.finaleExtras) {
      if (!ex.queenId) continue;
      extrasByQueenId.set(ex.queenId, {
        miniWins: ex.miniWins ?? 0,
        mainWins: ex.mainWins ?? 0,
        lipsyncWins: ex.lipsyncWins ?? 0,
      });
    }

    for (const entry of entries) {
      let total = new Prisma.Decimal(0);

      for (const pick of entry.picks) {
        const qid = pick.queenId;
        const mult = new Prisma.Decimal(pick.multiplier.toString());

        // Placement points (STACKED / cumulative)
        let base = 0;
        const place = placementByQueenId.get(qid);

        if (place === 1) {
          base += FINALE_POINTS.top4;
          base += FINALE_POINTS.top2;
          base += FINALE_POINTS.winner;
        } else if (place === 2) {
          base += FINALE_POINTS.top4;
          base += FINALE_POINTS.top2;
        } else if (place === 3 || place === 4) {
          base += FINALE_POINTS.top4;
        }
        // else: not in final 4 => 0 placement points

        // Extras (counts) using original point values
        const ex = extrasByQueenId.get(qid);
        if (ex) {
          base += ex.miniWins * DRAG_RACE_POINTS.miniWin;
          base += ex.mainWins * DRAG_RACE_POINTS.mainWin;
          base += ex.lipsyncWins * DRAG_RACE_POINTS.lipsyncWin;
        }

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
    return;
  }

  // =========================
  // ✅ REGULAR SCORING (existing logic)
  // =========================

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

  // 🔥 fetch ALL prior eliminations (weeks < currentWeek)
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
