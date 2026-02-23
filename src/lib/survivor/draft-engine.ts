export function getRoundForOverallPick(totalSeats: number, overallPick: number): number {
  if (totalSeats <= 0) return 0;
  return Math.floor((overallPick - 1) / totalSeats) + 1;
}

export function getPickInRound(totalSeats: number, overallPick: number): number {
  if (totalSeats <= 0) return 0;
  return ((overallPick - 1) % totalSeats) + 1;
}

export function getSnakeSeatForOverallPick(totalSeats: number, overallPick: number): number {
  if (totalSeats <= 0) return 0;

  const round = getRoundForOverallPick(totalSeats, overallPick);
  const pickInRound = getPickInRound(totalSeats, overallPick);

  if (round % 2 === 1) return pickInRound;
  return totalSeats - pickInRound + 1;
}
