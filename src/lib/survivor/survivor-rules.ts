export const SURVIVOR_V1_RULES = {
  performance: {
    survived: 2,
    individualImmunityWin: 5,
    individualRewardWin: 3,
    idolFind: 4,
    idolPlaySuccessful: 6,
    zeroVotePostMerge: 3,
    confessionalLeader: 4,
    eliminated: -5,
  },
  weeklyPredictions: {
    bootCastawayExact: 15,
    bootVoteCountExact: 6,
    immunityWinnerExact: 5,
    idolPlayedYesNo: 4,
    safePickSurvives: 8,
    maxPoints: 35,
  },
  endgamePlacementPoints: {
    1: 35,
    2: 25,
    3: 20,
    4: 15,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
  } as Record<number, number>,
} as const;

export function survivorEndgamePlacementPoints(placement: number | null | undefined) {
  if (!placement || placement < 1) return 0;
  return SURVIVOR_V1_RULES.endgamePlacementPoints[placement] ?? 0;
}

export function survivorPredictionPointsCapped(rawPoints: number) {
  if (rawPoints <= 0) return 0;
  return Math.min(rawPoints, SURVIVOR_V1_RULES.weeklyPredictions.maxPoints);
}

export function survivorWeekPredictionLockAt(
  leagueStartsAt: Date | null | undefined,
  week: number,
  episodeLockedAt?: Date | null
) {
  if (episodeLockedAt) return episodeLockedAt;
  if (!leagueStartsAt || !Number.isInteger(week) || week < 1) return null;

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return new Date(leagueStartsAt.getTime() + (week - 1) * msPerWeek);
}
