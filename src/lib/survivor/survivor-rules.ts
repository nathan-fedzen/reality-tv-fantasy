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
