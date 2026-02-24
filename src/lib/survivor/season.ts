export const SURVIVOR_SEASON_WEEKS = 13;

export function isValidSurvivorWeek(week: number) {
  return Number.isInteger(week) && week >= 1 && week <= SURVIVOR_SEASON_WEEKS;
}
