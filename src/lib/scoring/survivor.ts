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

export async function recomputeSurvivorWeekScores(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  const [episode, entries, draftPicks, castawayResults, predictions] = await Promise.all([
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
  const predictionUpdates: Array<{
    id: string;
    points: Prisma.Decimal;
    breakdown: Prisma.InputJsonValue;
  }> = [];

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

    const total = performanceTotal + predictionCapped;

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
}
