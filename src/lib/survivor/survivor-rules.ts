export const SURVIVOR_V1_RULES = {
  performance: {
    survived: 2,
    individualImmunityWin: 5,
    tribeImmunityWin: 3,
    individualRewardWin: 3,
    confessionalPer: 0.5,
    idolFind: 4,
    idolPlaySuccessful: 6,
    confessionalLeader: 4,
    eliminated: -5,
  },
  weeklyPredictions: {
    bootCastawayExact: 15,
    bootVoteCountExact: 6,
    immunityWinnerExact: 5,
    idolPlayedYesNo: 4,
    safePickSurvives: 8,
    finalPlacements: {
      fourthPlaceExact: 4,
      thirdPlaceExact: 6,
      secondPlaceExact: 8,
      firstPlaceExact: 12,
      maxPoints: 30,
    },
    maxPoints: 35,
  },
  bootOrder: {
    exactPosition: 8,
    offByOne: 4,
    final3Presence: 5,
    winnerBonus: 10,
  },
  advantages: {
    doubleEpisodeMultiplier: 2,
    idolInsuranceFlat: 8,
    predictionShieldFloor: 15,
  },
  engagement: {
    lastSurvivorStandingWeekly: 3,
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

const EASTERN_TIME_ZONE = "America/New_York";

function timeZoneDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? "");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "");
  return { year, month, day };
}

function timeZoneWeekdayIndex(date: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return weekdayMap[weekday] ?? 0;
}

function addDaysToDateParts(year: number, month: number, day: number, days: number) {
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function timeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });
  const offsetText =
    formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "";

  if (offsetText === "GMT" || offsetText === "UTC") return 0;

  const match = offsetText.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function zonedTimeToUtcDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offsetMinutes = timeZoneOffsetMinutes(new Date(baseUtcMs), timeZone);
  return new Date(baseUtcMs - offsetMinutes * 60 * 1000);
}

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

  // Weekly lock is every Wednesday at 7:00 PM Eastern.
  const startWeekday = timeZoneWeekdayIndex(leagueStartsAt, EASTERN_TIME_ZONE);
  const daysUntilWednesday = (3 - startWeekday + 7) % 7;

  const startDateParts = timeZoneDateParts(leagueStartsAt, EASTERN_TIME_ZONE);
  const weekOneDateParts = addDaysToDateParts(
    startDateParts.year,
    startDateParts.month,
    startDateParts.day,
    daysUntilWednesday
  );
  const lockDateParts = addDaysToDateParts(
    weekOneDateParts.year,
    weekOneDateParts.month,
    weekOneDateParts.day,
    (week - 1) * 7
  );

  return zonedTimeToUtcDate(
    lockDateParts.year,
    lockDateParts.month,
    lockDateParts.day,
    19,
    0,
    EASTERN_TIME_ZONE
  );
}
