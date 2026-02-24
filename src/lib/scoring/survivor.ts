import { Prisma, PrismaClient } from "@prisma/client";
import {
  SURVIVOR_V1_RULES,
  survivorEndgamePlacementPoints,
  survivorPredictionPointsCapped,
} from "@/lib/survivor/survivor-rules";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type BootOrderAward = {
  points: number;
  breakdown: Prisma.InputJsonObject;
};

type TribalOutcome = {
  bootCastawayId: string | null;
  bootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
};

type TribalPrediction = TribalOutcome & {
  safePickCastawayId: string | null;
};

type FinalPlacementPrediction = {
  fourthPlaceCastawayId: string | null;
  thirdPlaceCastawayId: string | null;
  secondPlaceCastawayId: string | null;
  firstPlaceCastawayId: string | null;
};

function jsonObject(
  value: Prisma.JsonValue | null | undefined
): Prisma.JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.JsonObject;
}

function jsonString(value: Prisma.JsonValue | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function jsonInt(value: Prisma.JsonValue | undefined) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function parseTribalOutcomeArray(value: Prisma.JsonValue | null | undefined): TribalOutcome[] {
  if (!Array.isArray(value)) return [];
  const out: TribalOutcome[] = [];

  for (const row of value) {
    const obj = jsonObject(row);
    if (!obj) continue;
    out.push({
      bootCastawayId: jsonString(obj.bootCastawayId),
      bootVoteCount: jsonInt(obj.bootVoteCount),
      immunityWinnerCastawayId: jsonString(obj.immunityWinnerCastawayId),
    });
  }

  return out;
}

function parseTribalPredictionArray(
  value: Prisma.JsonValue | null | undefined
): TribalPrediction[] {
  if (!Array.isArray(value)) return [];
  const out: TribalPrediction[] = [];

  for (const row of value) {
    const obj = jsonObject(row);
    if (!obj) continue;
    out.push({
      bootCastawayId: jsonString(obj.bootCastawayId),
      bootVoteCount: jsonInt(obj.bootVoteCount),
      immunityWinnerCastawayId: jsonString(obj.immunityWinnerCastawayId),
      safePickCastawayId: jsonString(obj.safePickCastawayId),
    });
  }

  return out;
}

function parseFinalPlacementPrediction(
  value: Prisma.JsonValue | null | undefined
): FinalPlacementPrediction {
  const obj = jsonObject(value);
  return {
    fourthPlaceCastawayId: jsonString(obj?.fourthPlaceCastawayId),
    thirdPlaceCastawayId: jsonString(obj?.thirdPlaceCastawayId),
    secondPlaceCastawayId: jsonString(obj?.secondPlaceCastawayId),
    firstPlaceCastawayId: jsonString(obj?.firstPlaceCastawayId),
  };
}

async function computeBootOrderAwardsForEpisode(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  const latestPlacementEpisode = await tx.episode.findFirst({
    where: {
      leagueId,
      survivorCastawayResults: {
        some: { endgamePlacement: { not: null } },
      },
    },
    orderBy: { week: "desc" },
    select: { id: true },
  });

  if (!latestPlacementEpisode || latestPlacementEpisode.id !== episodeId) {
    return new Map<string, BootOrderAward>();
  }

  const mergeEpisode = await tx.episode.findFirst({
    where: {
      leagueId,
      survivorMeta: {
        is: { isMerge: true },
      },
    },
    orderBy: { week: "asc" },
    select: {
      id: true,
      week: true,
      survivorCastawayResults: {
        select: {
          castawayId: true,
          castaway: { select: { name: true } },
        },
      },
    },
  });

  if (!mergeEpisode) return new Map<string, BootOrderAward>();

  const mergeCastawayMap = new Map<
    string,
    {
      castawayId: string;
      castawayName: string;
    }
  >();
  for (const row of mergeEpisode.survivorCastawayResults) {
    mergeCastawayMap.set(row.castawayId, {
      castawayId: row.castawayId,
      castawayName: row.castaway.name,
    });
  }
  const mergeCastaways = Array.from(mergeCastawayMap.values());
  if (mergeCastaways.length === 0) return new Map<string, BootOrderAward>();

  const placements = await tx.survivorEpisodeCastawayResult.findMany({
    where: {
      leagueId,
      castawayId: { in: mergeCastaways.map((row) => row.castawayId) },
      endgamePlacement: { not: null },
    },
    select: {
      castawayId: true,
      endgamePlacement: true,
    },
  });

  const placementByCastaway = new Map<string, number>();
  for (const row of placements) {
    if (row.endgamePlacement == null) continue;
    const existing = placementByCastaway.get(row.castawayId);
    if (existing == null || row.endgamePlacement < existing) {
      placementByCastaway.set(row.castawayId, row.endgamePlacement);
    }
  }

  if (placementByCastaway.size < mergeCastaways.length) {
    return new Map<string, BootOrderAward>();
  }

  const actualOrder = mergeCastaways
    .map((castaway) => ({
      castawayId: castaway.castawayId,
      castawayName: castaway.castawayName,
      placement: placementByCastaway.get(castaway.castawayId)!,
    }))
    .sort((a, b) => {
      if (a.placement !== b.placement) return b.placement - a.placement;
      return a.castawayName.localeCompare(b.castawayName);
    });

  const actualPositionByCastaway = new Map<string, number>();
  for (let i = 0; i < actualOrder.length; i++) {
    actualPositionByCastaway.set(actualOrder[i].castawayId, i + 1);
  }

  const final3StartPosition = Math.max(1, actualOrder.length - 2);
  const winnerCastawayId = actualOrder[actualOrder.length - 1]?.castawayId ?? null;

  const submissions = await tx.survivorBootOrderSubmission.findMany({
    where: { leagueId },
    select: {
      id: true,
      leagueEntryId: true,
      items: {
        select: {
          castawayId: true,
          predictedPosition: true,
          castaway: { select: { name: true } },
        },
      },
    },
  });

  const awardsByEntryId = new Map<string, BootOrderAward>();

  await Promise.all(
    submissions.map(async (submission) => {
      const predictedPositionByCastaway = new Map<string, number>();
      for (const item of submission.items) {
        predictedPositionByCastaway.set(item.castawayId, item.predictedPosition);
      }

      const predictedWinner = submission.items.reduce<{
        castawayId: string | null;
        predictedPosition: number;
      }>(
        (acc, item) => {
          if (item.predictedPosition > acc.predictedPosition) {
            return {
              castawayId: item.castawayId,
              predictedPosition: item.predictedPosition,
            };
          }
          return acc;
        },
        { castawayId: null, predictedPosition: -1 }
      );

      let total = 0;
      const perCastaway = actualOrder.map((actual) => {
        const predictedPosition = predictedPositionByCastaway.get(actual.castawayId) ?? null;
        const actualPosition = actualPositionByCastaway.get(actual.castawayId)!;

        const exactPosition =
          predictedPosition != null && predictedPosition === actualPosition
            ? SURVIVOR_V1_RULES.bootOrder.exactPosition
            : 0;
        const offByOne =
          exactPosition === 0 &&
          predictedPosition != null &&
          Math.abs(predictedPosition - actualPosition) === 1
            ? SURVIVOR_V1_RULES.bootOrder.offByOne
            : 0;
        const final3Presence =
          predictedPosition != null &&
          predictedPosition >= final3StartPosition &&
          actualPosition >= final3StartPosition
            ? SURVIVOR_V1_RULES.bootOrder.final3Presence
            : 0;

        const subtotal = exactPosition + offByOne + final3Presence;
        total += subtotal;

        return {
          castawayId: actual.castawayId,
          castawayName: actual.castawayName,
          predictedPosition,
          actualPosition,
          points: {
            exactPosition,
            offByOne,
            final3Presence,
          },
          subtotal,
        };
      });

      const winnerBonus =
        winnerCastawayId != null && predictedWinner.castawayId === winnerCastawayId
          ? SURVIVOR_V1_RULES.bootOrder.winnerBonus
          : 0;
      total += winnerBonus;

      const breakdown: Prisma.InputJsonObject = {
        ruleset: "SURVIVOR_V1_BOOT_ORDER",
        mergeWeek: mergeEpisode.week,
        final3StartPosition,
        winnerCastawayId,
        winnerBonus,
        perCastaway,
        total,
      };

      awardsByEntryId.set(submission.leagueEntryId, { points: total, breakdown });

      await tx.survivorBootOrderSubmission.update({
        where: { id: submission.id },
        data: {
          points: new Prisma.Decimal(total),
          scoredAt: new Date(),
          breakdown,
        },
      });
    })
  );

  return awardsByEntryId;
}

export async function recomputeSurvivorWeekScores(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  const [
    episode,
    entries,
    draftPicks,
    castawayResults,
    finalPlacementRows,
    predictions,
    bootOrderAwards,
    usedAdvantages,
  ] =
    await Promise.all([
    tx.episode.findUnique({
      where: { id: episodeId },
      select: {
        id: true,
        week: true,
        survivorMeta: {
          select: {
            tribalCount: true,
            tribals: true,
            isMerge: true,
            isNonElimination: true,
            bootCastawayId: true,
            secondaryBootCastawayId: true,
            bootVoteCount: true,
            secondaryBootVoteCount: true,
            immunityWinnerCastawayId: true,
            secondaryImmunityWinnerCastawayId: true,
          },
        },
      },
    }),
    tx.leagueEntry.findMany({
      where: { leagueId },
      select: { id: true },
    }),
    tx.survivorDraftPick.findMany({
      where: { draft: { leagueId } },
      select: {
        leagueEntryId: true,
        castawayId: true,
        castaway: { select: { name: true } },
      },
    }),
    tx.survivorEpisodeCastawayResult.findMany({
      where: { leagueId, episodeId },
      select: {
        castawayId: true,
        survived: true,
        eliminated: true,
        individualImmunityWins: true,
        tribeImmunityWins: true,
        individualRewardWins: true,
        advantagesFound: true,
        idolsPlayedSuccessfully: true,
        votesReceived: true,
        confessionalCount: true,
        confessionalLeader: true,
        endgamePlacement: true,
      },
    }),
    tx.survivorEpisodeCastawayResult.findMany({
      where: {
        leagueId,
        endgamePlacement: { gte: 1, lte: 4 },
      },
      select: {
        castawayId: true,
        endgamePlacement: true,
      },
    }),
    tx.survivorWeeklyPrediction.findMany({
      where: { leagueId, episodeId },
      select: {
        id: true,
        leagueEntryId: true,
        tribals: true,
        finalPlacements: true,
        bootCastawayId: true,
        secondaryBootCastawayId: true,
        bootVoteCount: true,
        secondaryBootVoteCount: true,
        immunityWinnerCastawayId: true,
        secondaryImmunityWinnerCastawayId: true,
        idolPlayed: true,
        safePickCastawayId: true,
        secondarySafePickCastawayId: true,
      },
    }),
    computeBootOrderAwardsForEpisode(tx, leagueId, episodeId),
    tx.survivorOwnedAdvantage.findMany({
      where: {
        leagueId,
        status: "USED",
        lastAppliedEpisodeId: episodeId,
      },
      select: {
        id: true,
        leagueEntryId: true,
        advantageType: true,
        title: true,
      },
    }),
  ]);

  if (!episode) return;

  const isMergeEpisode = !!episode.survivorMeta?.isMerge;
  const actualBootCastawayIds = castawayResults
    .filter((row) => row.eliminated)
    .map((row) => row.castawayId);

  const fallbackActualTribals: TribalOutcome[] = [];
  const firstBootCastawayId =
    episode.survivorMeta?.bootCastawayId ?? actualBootCastawayIds[0] ?? null;
  const secondBootCastawayId =
    episode.survivorMeta?.secondaryBootCastawayId ??
    actualBootCastawayIds.find((castawayId) => castawayId !== firstBootCastawayId) ??
    null;

  if (
    firstBootCastawayId != null ||
    episode.survivorMeta?.bootVoteCount != null ||
    episode.survivorMeta?.immunityWinnerCastawayId != null
  ) {
    fallbackActualTribals.push({
      bootCastawayId: firstBootCastawayId,
      bootVoteCount: episode.survivorMeta?.bootVoteCount ?? null,
      immunityWinnerCastawayId: episode.survivorMeta?.immunityWinnerCastawayId ?? null,
    });
  }

  if (
    secondBootCastawayId != null ||
    episode.survivorMeta?.secondaryBootVoteCount != null ||
    episode.survivorMeta?.secondaryImmunityWinnerCastawayId != null
  ) {
    fallbackActualTribals.push({
      bootCastawayId: secondBootCastawayId,
      bootVoteCount: episode.survivorMeta?.secondaryBootVoteCount ?? null,
      immunityWinnerCastawayId:
        episode.survivorMeta?.secondaryImmunityWinnerCastawayId ?? null,
    });
  }

  if (fallbackActualTribals.length === 0 && actualBootCastawayIds.length > 0) {
    for (const castawayId of actualBootCastawayIds) {
      fallbackActualTribals.push({
        bootCastawayId: castawayId,
        bootVoteCount: null,
        immunityWinnerCastawayId: null,
      });
    }
  }

  const metaTribals = parseTribalOutcomeArray(episode.survivorMeta?.tribals);
  const actualTribals = metaTribals.length > 0 ? metaTribals : fallbackActualTribals;
  const actualIdolPlayed = castawayResults.some((row) => row.idolsPlayedSuccessfully > 0);

  await tx.leagueEntryScore.deleteMany({ where: { episodeId } });

  const rosterByEntry = new Map<
    string,
    Array<{ castawayId: string; castawayName: string }>
  >();

  for (const pick of draftPicks) {
    const list = rosterByEntry.get(pick.leagueEntryId) ?? [];
    list.push({ castawayId: pick.castawayId, castawayName: pick.castaway.name });
    rosterByEntry.set(pick.leagueEntryId, list);
  }

  const resultByCastawayId = new Map(
    castawayResults.map((row) => [row.castawayId, row])
  );
  const predictionByEntryId = new Map(
    predictions.map((prediction) => [prediction.leagueEntryId, prediction])
  );
  const finalPlacementByCastaway = new Map<string, number>();
  for (const row of finalPlacementRows) {
    const placement = row.endgamePlacement;
    if (placement == null) continue;
    const existing = finalPlacementByCastaway.get(row.castawayId);
    if (existing == null || placement < existing) {
      finalPlacementByCastaway.set(row.castawayId, placement);
    }
  }
  const actualCastawayByPlacement = new Map<number, string>();
  for (const [castawayId, placement] of finalPlacementByCastaway.entries()) {
    if (placement >= 1 && placement <= 4 && !actualCastawayByPlacement.has(placement)) {
      actualCastawayByPlacement.set(placement, castawayId);
    }
  }
  const hasResolvedFinal4 =
    actualCastawayByPlacement.has(1) &&
    actualCastawayByPlacement.has(2) &&
    actualCastawayByPlacement.has(3) &&
    actualCastawayByPlacement.has(4);

  const rows: Prisma.LeagueEntryScoreCreateManyInput[] = [];
  const advantageEffectTransactions: Prisma.SurvivorPointTransactionCreateManyInput[] = [];
  const predictionUpdates: Array<{
    id: string;
    points: Prisma.Decimal;
    breakdown: Prisma.InputJsonValue;
  }> = [];

  const usedAdvantagesByEntryId = new Map<
    string,
    Array<{
      id: string;
      advantageType: "DOUBLE_EPISODE" | "IDOL_INSURANCE" | "PREDICTION_SHIELD";
      title: string;
    }>
  >();
  for (const advantage of usedAdvantages) {
    const list = usedAdvantagesByEntryId.get(advantage.leagueEntryId) ?? [];
    list.push({
      id: advantage.id,
      advantageType: advantage.advantageType as
        | "DOUBLE_EPISODE"
        | "IDOL_INSURANCE"
        | "PREDICTION_SHIELD",
      title: advantage.title,
    });
    usedAdvantagesByEntryId.set(advantage.leagueEntryId, list);
  }

  await tx.survivorPointTransaction.deleteMany({
    where: {
      leagueId,
      episodeId,
      source: "ADVANTAGE_EFFECT",
    },
  });

  const survivorsRemainingByEntryId = new Map<string, number>();
  for (const entry of entries) {
    const roster = rosterByEntry.get(entry.id) ?? [];
    let survivorsRemaining = 0;
    for (const castaway of roster) {
      const result = resultByCastawayId.get(castaway.castawayId);
      if (result && result.survived && !result.eliminated) {
        survivorsRemaining += 1;
      }
    }
    survivorsRemainingByEntryId.set(entry.id, survivorsRemaining);
  }

  const maxSurvivorsRemaining =
    survivorsRemainingByEntryId.size > 0
      ? Math.max(...Array.from(survivorsRemainingByEntryId.values()))
      : 0;

  const lastSurvivorStandingWinners =
    maxSurvivorsRemaining > 0
      ? new Set(
          Array.from(survivorsRemainingByEntryId.entries())
            .filter(([, count]) => count === maxSurvivorsRemaining)
            .map(([entryId]) => entryId)
        )
      : new Set<string>();

  for (const entry of entries) {
    const roster = rosterByEntry.get(entry.id) ?? [];

    let performanceTotal = 0;
    const perCastaway: Array<{
      castawayId: string;
      castawayName: string;
      confessionalCount: number;
      points: {
        survived: number;
        individualImmunity: number;
        tribeImmunity: number;
        reward: number;
        idolFind: number;
        idolPlay: number;
        confessionals: number;
        confessionalLeader: number;
        eliminated: number;
        endgamePlacement: number;
      };
      subtotal: number;
    }> = [];

    for (const castaway of roster) {
      const result = resultByCastawayId.get(castaway.castawayId);

      if (!result) {
        perCastaway.push({
          castawayId: castaway.castawayId,
          castawayName: castaway.castawayName,
          confessionalCount: 0,
          points: {
            survived: 0,
            individualImmunity: 0,
            tribeImmunity: 0,
            reward: 0,
            idolFind: 0,
            idolPlay: 0,
            confessionals: 0,
            confessionalLeader: 0,
            eliminated: 0,
            endgamePlacement: 0,
          },
          subtotal: 0,
        });
        continue;
      }

      const points = {
        survived: result.survived ? SURVIVOR_V1_RULES.performance.survived : 0,
        individualImmunity:
          result.individualImmunityWins *
          SURVIVOR_V1_RULES.performance.individualImmunityWin,
        tribeImmunity:
          result.tribeImmunityWins * SURVIVOR_V1_RULES.performance.tribeImmunityWin,
        reward:
          result.individualRewardWins *
          SURVIVOR_V1_RULES.performance.individualRewardWin,
        idolFind: result.advantagesFound * SURVIVOR_V1_RULES.performance.idolFind,
        idolPlay:
          result.idolsPlayedSuccessfully *
          SURVIVOR_V1_RULES.performance.idolPlaySuccessful,
        confessionals:
          result.confessionalCount * SURVIVOR_V1_RULES.performance.confessionalPer,
        confessionalLeader: result.confessionalLeader
          ? SURVIVOR_V1_RULES.performance.confessionalLeader
          : 0,
        eliminated: result.eliminated ? SURVIVOR_V1_RULES.performance.eliminated : 0,
        endgamePlacement: survivorEndgamePlacementPoints(result.endgamePlacement),
      };

      const subtotal =
        points.survived +
        points.individualImmunity +
        points.tribeImmunity +
        points.reward +
        points.idolFind +
        points.idolPlay +
        points.confessionals +
        points.confessionalLeader +
        points.eliminated +
        points.endgamePlacement;

      performanceTotal += subtotal;

      perCastaway.push({
        castawayId: castaway.castawayId,
        castawayName: castaway.castawayName,
        confessionalCount: result.confessionalCount,
        points,
        subtotal,
      });
    }

    const prediction = predictionByEntryId.get(entry.id) ?? null;
    let predictionSubtotal = 0;
    let predictionCapped = 0;
    let predictionBreakdown: Prisma.InputJsonObject | null = null;

    if (prediction) {
      const fallbackPredictedTribals: TribalPrediction[] = [];
      if (
        prediction.bootCastawayId != null ||
        prediction.bootVoteCount != null ||
        prediction.immunityWinnerCastawayId != null ||
        prediction.safePickCastawayId != null
      ) {
        fallbackPredictedTribals.push({
          bootCastawayId: prediction.bootCastawayId,
          bootVoteCount: prediction.bootVoteCount,
          immunityWinnerCastawayId: prediction.immunityWinnerCastawayId,
          safePickCastawayId: prediction.safePickCastawayId,
        });
      }
      if (
        prediction.secondaryBootCastawayId != null ||
        prediction.secondaryBootVoteCount != null ||
        prediction.secondaryImmunityWinnerCastawayId != null ||
        prediction.secondarySafePickCastawayId != null
      ) {
        fallbackPredictedTribals.push({
          bootCastawayId: prediction.secondaryBootCastawayId,
          bootVoteCount: prediction.secondaryBootVoteCount,
          immunityWinnerCastawayId: prediction.secondaryImmunityWinnerCastawayId,
          safePickCastawayId: prediction.secondarySafePickCastawayId,
        });
      }

      const jsonPredictedTribals = parseTribalPredictionArray(prediction.tribals);
      const predictedTribals =
        jsonPredictedTribals.length > 0 ? jsonPredictedTribals : fallbackPredictedTribals;

      let bootExactHits = 0;
      let voteCountExactHits = 0;
      let immunityExactHits = 0;
      let safeExactHits = 0;

      for (let tribalIndex = 0; tribalIndex < actualTribals.length; tribalIndex += 1) {
        const actual = actualTribals[tribalIndex];
        const predicted = predictedTribals[tribalIndex];
        if (!predicted) continue;

        if (
          predicted.bootCastawayId != null &&
          actual.bootCastawayId != null &&
          predicted.bootCastawayId === actual.bootCastawayId
        ) {
          bootExactHits += 1;
        }

        if (
          predicted.bootVoteCount != null &&
          actual.bootVoteCount != null &&
          predicted.bootVoteCount === actual.bootVoteCount
        ) {
          voteCountExactHits += 1;
        }

        if (
          predicted.immunityWinnerCastawayId != null &&
          actual.immunityWinnerCastawayId != null &&
          predicted.immunityWinnerCastawayId === actual.immunityWinnerCastawayId
        ) {
          immunityExactHits += 1;
        }

        if (
          predicted.safePickCastawayId != null &&
          actual.bootCastawayId != null &&
          predicted.safePickCastawayId !== actual.bootCastawayId
        ) {
          safeExactHits += 1;
        }
      }

      const predictionPoints = {
        bootCastawayExact: bootExactHits * SURVIVOR_V1_RULES.weeklyPredictions.bootCastawayExact,
        bootVoteCountExact:
          voteCountExactHits * SURVIVOR_V1_RULES.weeklyPredictions.bootVoteCountExact,
        immunityWinnerExact:
          immunityExactHits * SURVIVOR_V1_RULES.weeklyPredictions.immunityWinnerExact,
        idolPlayedYesNo:
          prediction.idolPlayed != null && prediction.idolPlayed === actualIdolPlayed
            ? SURVIVOR_V1_RULES.weeklyPredictions.idolPlayedYesNo
            : 0,
        safePickSurvives:
          safeExactHits * SURVIVOR_V1_RULES.weeklyPredictions.safePickSurvives,
      };

      const coreRawPoints =
        predictionPoints.bootCastawayExact +
        predictionPoints.bootVoteCountExact +
        predictionPoints.immunityWinnerExact +
        predictionPoints.idolPlayedYesNo +
        predictionPoints.safePickSurvives;

      const predictedFinalPlacements = parseFinalPlacementPrediction(prediction.finalPlacements);
      const finalPlacementPoints = {
        fourthPlaceExact:
          episode.week === SURVIVOR_SEASON_WEEKS &&
          hasResolvedFinal4 &&
          predictedFinalPlacements.fourthPlaceCastawayId != null &&
          predictedFinalPlacements.fourthPlaceCastawayId === actualCastawayByPlacement.get(4)
            ? SURVIVOR_V1_RULES.weeklyPredictions.finalPlacements.fourthPlaceExact
            : 0,
        thirdPlaceExact:
          episode.week === SURVIVOR_SEASON_WEEKS &&
          hasResolvedFinal4 &&
          predictedFinalPlacements.thirdPlaceCastawayId != null &&
          predictedFinalPlacements.thirdPlaceCastawayId === actualCastawayByPlacement.get(3)
            ? SURVIVOR_V1_RULES.weeklyPredictions.finalPlacements.thirdPlaceExact
            : 0,
        secondPlaceExact:
          episode.week === SURVIVOR_SEASON_WEEKS &&
          hasResolvedFinal4 &&
          predictedFinalPlacements.secondPlaceCastawayId != null &&
          predictedFinalPlacements.secondPlaceCastawayId === actualCastawayByPlacement.get(2)
            ? SURVIVOR_V1_RULES.weeklyPredictions.finalPlacements.secondPlaceExact
            : 0,
        firstPlaceExact:
          episode.week === SURVIVOR_SEASON_WEEKS &&
          hasResolvedFinal4 &&
          predictedFinalPlacements.firstPlaceCastawayId != null &&
          predictedFinalPlacements.firstPlaceCastawayId === actualCastawayByPlacement.get(1)
            ? SURVIVOR_V1_RULES.weeklyPredictions.finalPlacements.firstPlaceExact
            : 0,
      };
      const finalPlacementsTotal =
        finalPlacementPoints.fourthPlaceExact +
        finalPlacementPoints.thirdPlaceExact +
        finalPlacementPoints.secondPlaceExact +
        finalPlacementPoints.firstPlaceExact;

      const coreCappedPoints = survivorPredictionPointsCapped(coreRawPoints);
      predictionSubtotal = coreRawPoints + finalPlacementsTotal;
      predictionCapped = coreCappedPoints + finalPlacementsTotal;

      predictionBreakdown = {
        points: {
          ...predictionPoints,
          finalPlacements: finalPlacementPoints,
          finalPlacementsTotal,
        },
        rawPoints: predictionSubtotal,
        cappedPoints: predictionCapped,
        maxPoints: SURVIVOR_V1_RULES.weeklyPredictions.maxPoints,
        corePrediction: {
          rawPoints: coreRawPoints,
          cappedPoints: coreCappedPoints,
          maxPoints: SURVIVOR_V1_RULES.weeklyPredictions.maxPoints,
        },
        actual: {
          bootCastawayIds: actualBootCastawayIds,
          tribals: actualTribals,
          predictedTribals,
          finalPlacements: {
            predicted: predictedFinalPlacements,
            actual: {
              fourthPlaceCastawayId: actualCastawayByPlacement.get(4) ?? null,
              thirdPlaceCastawayId: actualCastawayByPlacement.get(3) ?? null,
              secondPlaceCastawayId: actualCastawayByPlacement.get(2) ?? null,
              firstPlaceCastawayId: actualCastawayByPlacement.get(1) ?? null,
            },
            enabledForWeek: episode.week === SURVIVOR_SEASON_WEEKS,
            resolved: hasResolvedFinal4,
          },
          bootExactHits,
          voteCountExactHits,
          immunityExactHits,
          safeExactHits,
          idolPlayed: actualIdolPlayed,
          isNonEliminationEpisode: !!episode.survivorMeta?.isNonElimination,
        },
      };

      predictionUpdates.push({
        id: prediction.id,
        points: new Prisma.Decimal(predictionCapped),
        breakdown: predictionBreakdown,
      });
    }

    const bootOrderAward = bootOrderAwards.get(entry.id);
    const bootOrderPoints = bootOrderAward?.points ?? 0;
    const survivorsRemaining = survivorsRemainingByEntryId.get(entry.id) ?? 0;
    const lastSurvivorStandingPoints = lastSurvivorStandingWinners.has(entry.id)
      ? SURVIVOR_V1_RULES.engagement.lastSurvivorStandingWeekly
      : 0;

    const subtotalBeforeAdvantages =
      performanceTotal + predictionCapped + bootOrderPoints + lastSurvivorStandingPoints;

    let advantagePoints = 0;
    const advantageEffects: Array<{
      ownedAdvantageId: string;
      type: "DOUBLE_EPISODE" | "IDOL_INSURANCE" | "PREDICTION_SHIELD";
      title: string;
      points: number;
      reason: string;
    }> = [];

    const appliedAdvantages = usedAdvantagesByEntryId.get(entry.id) ?? [];
    const hasEliminatedRosterCastaway = roster.some(
      (castaway) => resultByCastawayId.get(castaway.castawayId)?.eliminated === true
    );

    for (const advantage of appliedAdvantages) {
      let points = 0;
      let reason = "";

      if (advantage.advantageType === "DOUBLE_EPISODE") {
        points = Math.max(
          0,
          subtotalBeforeAdvantages * (SURVIVOR_V1_RULES.advantages.doubleEpisodeMultiplier - 1)
        );
        reason = "Doubled this week's subtotal.";
      } else if (advantage.advantageType === "IDOL_INSURANCE") {
        points = hasEliminatedRosterCastaway
          ? SURVIVOR_V1_RULES.advantages.idolInsuranceFlat
          : 0;
        reason = hasEliminatedRosterCastaway
          ? "Roster loss protection applied."
          : "No roster elimination this week.";
      } else if (advantage.advantageType === "PREDICTION_SHIELD") {
        points = Math.max(
          0,
          SURVIVOR_V1_RULES.advantages.predictionShieldFloor - predictionCapped
        );
        reason = "Prediction score floor protection applied.";
      }

      if (points !== 0) {
        advantageEffectTransactions.push({
          leagueId,
          leagueEntryId: entry.id,
          episodeId,
          ownedAdvantageId: advantage.id,
          source: "ADVANTAGE_EFFECT",
          amount: new Prisma.Decimal(points),
          reason,
          metadata: {
            type: advantage.advantageType,
            title: advantage.title,
            subtotalBeforeAdvantages,
            predictionCapped,
            hasEliminatedRosterCastaway,
          },
        });
      }

      advantagePoints += points;
      advantageEffects.push({
        ownedAdvantageId: advantage.id,
        type: advantage.advantageType,
        title: advantage.title,
        points,
        reason,
      });
    }

    const total = subtotalBeforeAdvantages + advantagePoints;

    rows.push({
      leagueEntryId: entry.id,
      episodeId,
      points: new Prisma.Decimal(total),
      breakdown: {
        ruleset: "SURVIVOR_V1",
        week: episode.week,
        isMergeEpisode,
        perCastaway,
        performanceTotal,
        predictions: prediction
          ? {
              submitted: true,
              ...predictionBreakdown,
            }
          : { submitted: false, rawPoints: 0, cappedPoints: 0 },
        bootOrder: bootOrderAward
          ? {
              awarded: true,
              points: bootOrderPoints,
              ...bootOrderAward.breakdown,
            }
          : { awarded: false, points: 0 },
        engagement: {
          survivorsRemaining,
          maxSurvivorsRemaining,
          lastSurvivorStanding: {
            awarded: lastSurvivorStandingPoints > 0,
            points: lastSurvivorStandingPoints,
          },
        },
        advantages: {
          appliedCount: advantageEffects.length,
          points: advantagePoints,
          effects: advantageEffects,
        },
        total,
      },
    });
  }

  if (predictionUpdates.length) {
    await Promise.all(
      predictionUpdates.map((prediction) =>
        tx.survivorWeeklyPrediction.update({
          where: { id: prediction.id },
          data: {
            points: prediction.points,
            scoredAt: new Date(),
            breakdown: prediction.breakdown,
          },
        })
      )
    );
  }

  if (rows.length) {
    await tx.leagueEntryScore.createMany({ data: rows });
  }

  if (advantageEffectTransactions.length) {
    await tx.survivorPointTransaction.createMany({
      data: advantageEffectTransactions,
    });
  }
}
