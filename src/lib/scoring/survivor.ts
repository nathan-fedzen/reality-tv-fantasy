import { Prisma, PrismaClient } from "@prisma/client";
import {
  SURVIVOR_V1_RULES,
  survivorEndgamePlacementPoints,
  survivorPredictionPointsCapped,
} from "@/lib/survivor/survivor-rules";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

type BootOrderAward = {
  points: number;
  breakdown: Prisma.InputJsonObject;
};

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
            isMerge: true,
            isNonElimination: true,
            bootCastawayId: true,
            bootVoteCount: true,
            immunityWinnerCastawayId: true,
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
        individualRewardWins: true,
        advantagesFound: true,
        idolsPlayedSuccessfully: true,
        votesReceived: true,
        confessionalLeader: true,
        endgamePlacement: true,
      },
    }),
    tx.survivorWeeklyPrediction.findMany({
      where: { leagueId, episodeId },
      select: {
        id: true,
        leagueEntryId: true,
        bootCastawayId: true,
        bootVoteCount: true,
        immunityWinnerCastawayId: true,
        idolPlayed: true,
        safePickCastawayId: true,
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
  const actualBootCastawayId = episode.survivorMeta?.bootCastawayId ?? null;
  const actualBootVoteCount = episode.survivorMeta?.bootVoteCount ?? null;
  const actualImmunityWinnerCastawayId =
    episode.survivorMeta?.immunityWinnerCastawayId ?? null;
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

  for (const entry of entries) {
    const roster = rosterByEntry.get(entry.id) ?? [];

    let performanceTotal = 0;
    const perCastaway: Array<{
      castawayId: string;
      castawayName: string;
      points: {
        survived: number;
        immunity: number;
        reward: number;
        idolFind: number;
        idolPlay: number;
        zeroVotePostMerge: number;
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
          points: {
            survived: 0,
            immunity: 0,
            reward: 0,
            idolFind: 0,
            idolPlay: 0,
            zeroVotePostMerge: 0,
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
        immunity:
          result.individualImmunityWins *
          SURVIVOR_V1_RULES.performance.individualImmunityWin,
        reward:
          result.individualRewardWins *
          SURVIVOR_V1_RULES.performance.individualRewardWin,
        idolFind: result.advantagesFound * SURVIVOR_V1_RULES.performance.idolFind,
        idolPlay:
          result.idolsPlayedSuccessfully *
          SURVIVOR_V1_RULES.performance.idolPlaySuccessful,
        zeroVotePostMerge:
          isMergeEpisode && !result.eliminated && result.votesReceived === 0
            ? SURVIVOR_V1_RULES.performance.zeroVotePostMerge
            : 0,
        confessionalLeader: result.confessionalLeader
          ? SURVIVOR_V1_RULES.performance.confessionalLeader
          : 0,
        eliminated: result.eliminated ? SURVIVOR_V1_RULES.performance.eliminated : 0,
        endgamePlacement: survivorEndgamePlacementPoints(result.endgamePlacement),
      };

      const subtotal =
        points.survived +
        points.immunity +
        points.reward +
        points.idolFind +
        points.idolPlay +
        points.zeroVotePostMerge +
        points.confessionalLeader +
        points.eliminated +
        points.endgamePlacement;

      performanceTotal += subtotal;

      perCastaway.push({
        castawayId: castaway.castawayId,
        castawayName: castaway.castawayName,
        points,
        subtotal,
      });
    }

    const prediction = predictionByEntryId.get(entry.id) ?? null;
    let predictionSubtotal = 0;
    let predictionCapped = 0;
    let predictionBreakdown: Prisma.InputJsonObject | null = null;

    if (prediction) {
      const predictionPoints = {
        bootCastawayExact:
          prediction.bootCastawayId === actualBootCastawayId
            ? SURVIVOR_V1_RULES.weeklyPredictions.bootCastawayExact
            : 0,
        bootVoteCountExact:
          prediction.bootVoteCount != null &&
          actualBootVoteCount != null &&
          prediction.bootVoteCount === actualBootVoteCount
            ? SURVIVOR_V1_RULES.weeklyPredictions.bootVoteCountExact
            : 0,
        immunityWinnerExact:
          prediction.immunityWinnerCastawayId != null &&
          actualImmunityWinnerCastawayId != null &&
          prediction.immunityWinnerCastawayId === actualImmunityWinnerCastawayId
            ? SURVIVOR_V1_RULES.weeklyPredictions.immunityWinnerExact
            : 0,
        idolPlayedYesNo:
          prediction.idolPlayed != null && prediction.idolPlayed === actualIdolPlayed
            ? SURVIVOR_V1_RULES.weeklyPredictions.idolPlayedYesNo
            : 0,
        safePickSurvives:
          prediction.safePickCastawayId != null &&
          (resultByCastawayId.get(prediction.safePickCastawayId)?.eliminated ?? true) === false
            ? SURVIVOR_V1_RULES.weeklyPredictions.safePickSurvives
            : 0,
      };

      predictionSubtotal =
        predictionPoints.bootCastawayExact +
        predictionPoints.bootVoteCountExact +
        predictionPoints.immunityWinnerExact +
        predictionPoints.idolPlayedYesNo +
        predictionPoints.safePickSurvives;
      predictionCapped = survivorPredictionPointsCapped(predictionSubtotal);

      predictionBreakdown = {
        points: predictionPoints,
        rawPoints: predictionSubtotal,
        cappedPoints: predictionCapped,
        maxPoints: SURVIVOR_V1_RULES.weeklyPredictions.maxPoints,
        actual: {
          bootCastawayId: actualBootCastawayId,
          bootVoteCount: actualBootVoteCount,
          immunityWinnerCastawayId: actualImmunityWinnerCastawayId,
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

    const subtotalBeforeAdvantages = performanceTotal + predictionCapped + bootOrderPoints;

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
