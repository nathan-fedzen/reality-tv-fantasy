import "dotenv/config";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  getPickInRound,
  getRoundForOverallPick,
  getSnakeSeatForOverallPick,
} from "../src/lib/survivor/draft-engine";
import { recomputeSurvivorWeekScores } from "../src/lib/scoring/survivor";
import { SURVIVOR_SEASON_WEEKS } from "../src/lib/survivor/season";

type ArgMap = {
  leagueId: string | null;
  seed: string;
};

type Entry = {
  id: string;
  userId: string;
  displayName: string;
};

type Castaway = {
  id: string;
  name: string;
  tribe: string | null;
};

type CastawayState = Castaway & {
  alive: boolean;
};

type WeekReport = {
  week: number;
  isMerge: boolean;
  tribalCount: number;
  eliminated: string[];
  immunityWinner: string | null;
  secondaryImmunityWinner: string | null;
};

const DOUBLE_TRIBAL_WEEK = 1;
const MERGE_WEEK = 6;
const FINALE_WEEK = SURVIVOR_SEASON_WEEKS;
const TARGET_FINALISTS = 4;
const MAX_ELIMS_PER_WEEK = 2;

function parseArgs(): ArgMap {
  const raw = process.argv.slice(2);

  let leagueId: string | null = null;
  let seed = "survivor-mock-v1";

  for (const part of raw) {
    if (part.startsWith("--leagueId=")) {
      leagueId = part.slice("--leagueId=".length).trim() || null;
      continue;
    }
    if (part.startsWith("--seed=")) {
      seed = part.slice("--seed=".length).trim() || seed;
      continue;
    }
    if (!part.startsWith("--") && !leagueId) {
      leagueId = part.trim();
    }
  }

  return { leagueId, seed };
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rand: () => number, min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}

function chance(rand: () => number, p: number) {
  return rand() < p;
}

function shuffle<T>(rand: () => number, input: T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickOne<T>(rand: () => number, arr: T[]): T {
  if (arr.length === 0) {
    throw new Error("Cannot pick from empty array.");
  }
  return arr[Math.floor(rand() * arr.length)];
}

function pickManyDistinct<T>(rand: () => number, arr: T[], count: number): T[] {
  if (count <= 0) return [];
  if (count > arr.length) {
    throw new Error(`Cannot pick ${count} values from ${arr.length}.`);
  }
  return shuffle(rand, arr).slice(0, count);
}

function chooseDifferent(
  rand: () => number,
  actual: string | null,
  pool: string[],
  banned: Set<string>
) {
  const filtered = pool.filter((id) => id !== actual && !banned.has(id));
  if (filtered.length === 0) {
    const fallback = pool.filter((id) => !banned.has(id));
    return fallback.length > 0 ? pickOne(rand, fallback) : actual;
  }
  return pickOne(rand, filtered);
}

function jitterVoteCount(rand: () => number, actual: number) {
  const delta = randomInt(rand, -2, 2);
  const value = actual + delta;
  return value < 0 ? 0 : value;
}

function displayName(user: { displayName: string | null; name: string | null; email: string | null }) {
  return user.displayName ?? user.name ?? user.email ?? "Unknown";
}

function buildEliminationPlan(totalCastaways: number) {
  const plan = Array.from({ length: SURVIVOR_SEASON_WEEKS }, () => 0);
  let eliminationsRemaining = Math.max(0, totalCastaways - TARGET_FINALISTS);

  const firstWeekElims = Math.min(DOUBLE_TRIBAL_WEEK === 1 ? 2 : 1, eliminationsRemaining);
  plan[0] = firstWeekElims;
  eliminationsRemaining -= firstWeekElims;

  for (let week = 2; week < FINALE_WEEK; week += 1) {
    if (eliminationsRemaining <= 0) break;

    const weeksRemainingBeforeFinale = FINALE_WEEK - week - 1;
    const minNeededThisWeek = Math.max(
      0,
      eliminationsRemaining - weeksRemainingBeforeFinale * MAX_ELIMS_PER_WEEK
    );
    const baseline = Math.ceil(eliminationsRemaining / (weeksRemainingBeforeFinale + 1));
    const count = Math.max(
      minNeededThisWeek,
      Math.min(MAX_ELIMS_PER_WEEK, baseline)
    );

    plan[week - 1] = count;
    eliminationsRemaining -= count;
  }

  if (eliminationsRemaining !== 0) {
    throw new Error(
      `Could not create elimination plan. Remaining eliminations: ${eliminationsRemaining}.`
    );
  }

  plan[FINALE_WEEK - 1] = 0;
  return plan;
}

async function resolveLeagueId(inputLeagueId: string | null) {
  if (inputLeagueId) return inputLeagueId;

  const latest = await prisma.league.findFirst({
    where: { showType: "SURVIVOR" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!latest) {
    throw new Error("No Survivor league found. Pass --leagueId=<id>.");
  }

  return latest.id;
}

function buildPlacementMap(
  rand: () => number,
  mergeCastawayIds: string[],
  eliminationLog: Array<{ week: number; castawayId: string }>
) {
  const mergeSet = new Set(mergeCastawayIds);
  const eliminatedAfterMerge = eliminationLog
    .filter((row) => row.week >= MERGE_WEEK && mergeSet.has(row.castawayId))
    .map((row) => row.castawayId);

  const survivorsToFinale = mergeCastawayIds.filter(
    (castawayId) => !eliminatedAfterMerge.includes(castawayId)
  );
  const finalsBestToWorst = shuffle(rand, survivorsToFinale);

  const placementByCastaway = new Map<string, number>();
  const mergeCount = mergeCastawayIds.length;

  for (let i = 0; i < eliminatedAfterMerge.length; i += 1) {
    placementByCastaway.set(eliminatedAfterMerge[i], mergeCount - i);
  }
  for (let i = 0; i < finalsBestToWorst.length; i += 1) {
    placementByCastaway.set(finalsBestToWorst[i], i + 1);
  }

  return placementByCastaway;
}

function countCorrectEliminationPredictions(
  predictions: Array<{
    leagueEntryId: string;
    tribals: Prisma.JsonValue | null;
    bootCastawayId: string | null;
    secondaryBootCastawayId: string | null;
    episode: { survivorCastawayResults: Array<{ castawayId: string }> };
  }>
) {
  const result = new Map<string, number>();
  for (const prediction of predictions) {
    const predictedFromTribals: string[] = [];
    if (Array.isArray(prediction.tribals)) {
      for (const row of prediction.tribals) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const castawayId = (row as Record<string, unknown>).bootCastawayId;
        if (typeof castawayId !== "string") continue;
        const trimmed = castawayId.trim();
        if (trimmed) predictedFromTribals.push(trimmed);
      }
    }

    const predicted = Array.from(
      new Set(
        predictedFromTribals.length > 0
          ? predictedFromTribals
          : [prediction.bootCastawayId, prediction.secondaryBootCastawayId]
              .filter((value): value is string => !!value)
              .map((value) => value.trim())
              .filter(Boolean)
      )
    );
    if (predicted.length === 0) continue;

    const actual = new Set(
      prediction.episode.survivorCastawayResults.map((row) => row.castawayId)
    );
    const hits = predicted.filter((id) => actual.has(id)).length;
    if (hits === 0) continue;
    result.set(prediction.leagueEntryId, (result.get(prediction.leagueEntryId) ?? 0) + hits);
  }
  return result;
}

async function main() {
  const args = parseArgs();
  const leagueId = await resolveLeagueId(args.leagueId);
  const rand = mulberry32(hashSeed(args.seed));

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      showType: true,
      startedAt: true,
      startsAt: true,
      members: {
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        select: {
          userId: true,
          user: {
            select: {
              displayName: true,
              name: true,
              email: true,
            },
          },
        },
      },
      survivorCastaways: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          tribe: true,
        },
      },
    },
  });

  if (!league) {
    throw new Error(`League not found: ${leagueId}`);
  }
  if (league.showType !== "SURVIVOR") {
    throw new Error(`League ${leagueId} is ${league.showType}, expected SURVIVOR.`);
  }
  if (league.members.length < 2 || league.members.length > 8) {
    throw new Error(
      `League has ${league.members.length} members. Survivor mock requires 2-8 members.`
    );
  }
  if (league.survivorCastaways.length === 0) {
    throw new Error("League has no seeded Survivor castaways.");
  }

  const picksPerEntry = Math.floor(league.survivorCastaways.length / league.members.length);
  if (picksPerEntry < 1) {
    throw new Error("Not enough castaways to draft at least one per player.");
  }

  const weekReports: WeekReport[] = [];

  const transactionResult = await prisma.$transaction(
    async (tx) => {
      await tx.league.update({
      where: { id: league.id },
      data: {
        startedAt: league.startedAt ?? new Date("2026-09-01T20:00:00.000Z"),
      },
    });

    const entries: Entry[] = [];
    for (const member of league.members) {
      const entry = await tx.leagueEntry.upsert({
        where: { leagueId_userId: { leagueId: league.id, userId: member.userId } },
        create: { leagueId: league.id, userId: member.userId },
        update: {},
        select: { id: true, userId: true },
      });
      entries.push({
        id: entry.id,
        userId: entry.userId,
        displayName: displayName(member.user),
      });
    }

    const draft = await tx.survivorDraft.upsert({
      where: { leagueId: league.id },
      create: { leagueId: league.id },
      update: {},
      select: { id: true },
    });

    await tx.leagueEntryScore.deleteMany({
      where: { leagueEntry: { leagueId: league.id } },
    });
    await tx.survivorWeeklyPrediction.deleteMany({ where: { leagueId: league.id } });
    await tx.survivorBootOrderSubmission.deleteMany({ where: { leagueId: league.id } });
    await tx.survivorEpisodeCastawayResult.deleteMany({ where: { leagueId: league.id } });
    await tx.survivorEpisodeMeta.deleteMany({ where: { leagueId: league.id } });
    await tx.episode.deleteMany({ where: { leagueId: league.id } });
    await tx.survivorDraftPick.deleteMany({ where: { draftId: draft.id } });
    await tx.survivorDraftSeat.deleteMany({ where: { draftId: draft.id } });
    await tx.survivorPointTransaction.deleteMany({
      where: {
        leagueId: league.id,
        source: "ADVANTAGE_EFFECT",
      },
    });
    await tx.survivorCastaway.updateMany({
      where: { leagueId: league.id },
      data: { totalConfessionals: 0 },
    });

    const seatOrder = shuffle(rand, entries);
    await tx.survivorDraftSeat.createMany({
      data: seatOrder.map((entry, index) => ({
        draftId: draft.id,
        leagueEntryId: entry.id,
        seat: index + 1,
      })),
    });

    const totalRounds = picksPerEntry;
    const totalPicks = picksPerEntry * entries.length;
    const shuffledCastaways = shuffle(rand, league.survivorCastaways);
    const draftPool = shuffledCastaways.slice(0, totalPicks);

    for (let overallPick = 1; overallPick <= totalPicks; overallPick += 1) {
      const seat = getSnakeSeatForOverallPick(entries.length, overallPick);
      const entry = seatOrder[seat - 1];
      const castaway = draftPool[overallPick - 1];

      await tx.survivorDraftPick.create({
        data: {
          draftId: draft.id,
          leagueEntryId: entry.id,
          castawayId: castaway.id,
          round: getRoundForOverallPick(entries.length, overallPick),
          overallPick,
          pickInRound: getPickInRound(entries.length, overallPick),
        },
      });
    }

    await tx.survivorDraft.update({
      where: { id: draft.id },
      data: {
        status: "COMPLETE",
        picksPerEntry,
        totalRounds,
        totalPicks,
        currentOverallPick: null,
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const castawayState = new Map<string, CastawayState>(
      league.survivorCastaways.map((castaway) => [
        castaway.id,
        { ...castaway, alive: true },
      ])
    );

    let mergeCastawayIds: string[] = [];
    let bootOrderCreated = false;
    const eliminationLog: Array<{ week: number; castawayId: string }> = [];
    const eliminationPlan = buildEliminationPlan(league.survivorCastaways.length);
    const clearWinnerEntryId = entries[0]?.id ?? null;

    for (let week = 1; week <= SURVIVOR_SEASON_WEEKS; week += 1) {
      const episode = await tx.episode.upsert({
        where: { leagueId_week: { leagueId: league.id, week } },
        create: { leagueId: league.id, week },
        update: {},
        select: { id: true },
      });

      const aliveBefore = Array.from(castawayState.values())
        .filter((castaway) => castaway.alive)
        .map((castaway) => castaway.id);
      const eliminationCount = eliminationPlan[week - 1] ?? 0;
      const minAliveAfterWeek = week < FINALE_WEEK ? TARGET_FINALISTS : 0;
      if (aliveBefore.length < eliminationCount || aliveBefore.length - eliminationCount < minAliveAfterWeek) {
        throw new Error(
          `Week ${week} cannot eliminate ${eliminationCount} castaways with ${aliveBefore.length} alive.`
        );
      }
      if (week === FINALE_WEEK && aliveBefore.length !== TARGET_FINALISTS) {
        throw new Error(
          `Finale week expected ${TARGET_FINALISTS} survivors, got ${aliveBefore.length}.`
        );
      }

      if (week === MERGE_WEEK) {
        mergeCastawayIds = aliveBefore.slice();
      }

      const eliminatedIds =
        eliminationCount > 0 ? pickManyDistinct(rand, aliveBefore, eliminationCount) : [];
      const bootCastawayId = eliminatedIds[0] ?? null;
      const secondaryBootCastawayId = eliminatedIds[1] ?? null;

      for (const castawayId of eliminatedIds) {
        eliminationLog.push({ week, castawayId });
      }

      const activePool = aliveBefore.filter((castawayId) => !eliminatedIds.includes(castawayId));
      const winnerPool = activePool.length > 0 ? activePool : aliveBefore;

      const immunityWinnerCastawayId = winnerPool.length > 0 ? pickOne(rand, winnerPool) : null;
      const secondaryImmunityWinnerCastawayId =
        eliminationCount > 1 && winnerPool.length > 0
          ? chooseDifferent(
              rand,
              immunityWinnerCastawayId,
              winnerPool,
              new Set(immunityWinnerCastawayId ? [immunityWinnerCastawayId] : [])
            )
          : null;
      const confessionalLeaderCastawayId =
        winnerPool.length > 0 ? pickOne(rand, winnerPool) : null;
      const rewardWinners = pickManyDistinct(
        rand,
        winnerPool,
        Math.min(2, winnerPool.length)
      );
      const tribeImmunityWinners = pickManyDistinct(
        rand,
        winnerPool,
        Math.min(3, winnerPool.length)
      );
      const advantageFinderCastawayId =
        winnerPool.length > 0 && chance(rand, 0.28) ? pickOne(rand, winnerPool) : null;
      const idolPlayerCastawayId =
        winnerPool.length > 0 && chance(rand, 0.22) ? pickOne(rand, winnerPool) : null;

      const actualBootVoteCount = eliminationCount > 0 ? randomInt(rand, 4, 10) : null;
      const actualSecondaryVoteCount = eliminationCount > 1 ? randomInt(rand, 3, 9) : null;
      const actualTribals =
        eliminationCount > 0
          ? [
              {
                bootCastawayId,
                bootVoteCount: actualBootVoteCount,
                immunityWinnerCastawayId,
              },
              ...(eliminationCount > 1
                ? [
                    {
                      bootCastawayId: secondaryBootCastawayId,
                      bootVoteCount: actualSecondaryVoteCount,
                      immunityWinnerCastawayId: secondaryImmunityWinnerCastawayId,
                    },
                  ]
                : []),
            ]
          : [
              {
                bootCastawayId: null,
                bootVoteCount: null,
                immunityWinnerCastawayId,
              },
            ];

      await tx.survivorEpisodeMeta.upsert({
        where: { episodeId: episode.id },
        create: {
          leagueId: league.id,
          episodeId: episode.id,
          tribalCount: actualTribals.length,
          tribals: actualTribals as unknown as Prisma.InputJsonValue,
          isMerge: week === MERGE_WEEK,
          isNonElimination: eliminationCount === 0,
          wasIdolPlayed: !!idolPlayerCastawayId,
          bootCastawayId,
          secondaryBootCastawayId,
          bootVoteCount: actualBootVoteCount,
          secondaryBootVoteCount: actualSecondaryVoteCount,
          immunityWinnerCastawayId,
          secondaryImmunityWinnerCastawayId,
          lockedAt: new Date(),
        },
        update: {
          tribalCount: actualTribals.length,
          tribals: actualTribals as unknown as Prisma.InputJsonValue,
          isMerge: week === MERGE_WEEK,
          isNonElimination: eliminationCount === 0,
          wasIdolPlayed: !!idolPlayerCastawayId,
          bootCastawayId,
          secondaryBootCastawayId,
          bootVoteCount: actualBootVoteCount,
          secondaryBootVoteCount: actualSecondaryVoteCount,
          immunityWinnerCastawayId,
          secondaryImmunityWinnerCastawayId,
          lockedAt: new Date(),
        },
      });

      if (week === MERGE_WEEK && !bootOrderCreated && mergeCastawayIds.length > 0) {
        for (const entry of entries) {
          const order = shuffle(rand, mergeCastawayIds);
          const submission = await tx.survivorBootOrderSubmission.create({
            data: {
              leagueId: league.id,
              leagueEntryId: entry.id,
              mergeEpisodeId: episode.id,
              submittedAt: new Date(),
              lockedAt: new Date(),
            },
            select: { id: true },
          });

          await tx.survivorBootOrderItem.createMany({
            data: order.map((castawayId, index) => ({
              submissionId: submission.id,
              castawayId,
              predictedPosition: index + 1,
            })),
          });
        }
        bootOrderCreated = true;
      }

      const weekResults: Array<{
        leagueId: string;
        episodeId: string;
        castawayId: string;
        survived: boolean;
        eliminated: boolean;
        individualImmunityWins: number;
        tribeImmunityWins: number;
        individualRewardWins: number;
        advantagesFound: number;
        idolsPlayedSuccessfully: number;
        votesReceived: number;
        confessionalCount: number;
        confessionalLeader: boolean;
        endgamePlacement: number | null;
      }> = [];

      for (const castaway of castawayState.values()) {
        const wasAliveBeforeWeek = castaway.alive;
        const eliminatedThisWeek = eliminatedIds.includes(castaway.id);
        const survived = wasAliveBeforeWeek && !eliminatedThisWeek;

        if (eliminatedThisWeek) {
          castaway.alive = false;
        }

        weekResults.push({
          leagueId: league.id,
          episodeId: episode.id,
          castawayId: castaway.id,
          survived,
          eliminated: eliminatedThisWeek,
          individualImmunityWins:
            immunityWinnerCastawayId === castaway.id ||
            secondaryImmunityWinnerCastawayId === castaway.id
              ? 1
              : 0,
          tribeImmunityWins: tribeImmunityWinners.includes(castaway.id) ? 1 : 0,
          individualRewardWins: rewardWinners.includes(castaway.id) ? 1 : 0,
          advantagesFound: advantageFinderCastawayId === castaway.id ? 1 : 0,
          idolsPlayedSuccessfully: idolPlayerCastawayId === castaway.id ? 1 : 0,
          votesReceived: eliminatedThisWeek
            ? randomInt(rand, 5, 10)
            : wasAliveBeforeWeek && chance(rand, 0.15)
            ? randomInt(rand, 1, 3)
            : 0,
          confessionalCount: wasAliveBeforeWeek ? randomInt(rand, 0, 8) : 0,
          confessionalLeader: confessionalLeaderCastawayId === castaway.id,
          endgamePlacement: null,
        });
      }

      let finalPlacementsActual: {
        fourthPlaceCastawayId: string | null;
        thirdPlaceCastawayId: string | null;
        secondPlaceCastawayId: string | null;
        firstPlaceCastawayId: string | null;
      } | null = null;

      if (week === FINALE_WEEK && mergeCastawayIds.length > 0) {
        const placementByCastaway = buildPlacementMap(rand, mergeCastawayIds, eliminationLog);
        for (const row of weekResults) {
          if (placementByCastaway.has(row.castawayId)) {
            row.endgamePlacement = placementByCastaway.get(row.castawayId) ?? null;
          }
        }

        const castawayByPlacement = new Map<number, string>();
        for (const [castawayId, placement] of placementByCastaway.entries()) {
          if (placement >= 1 && placement <= 4 && !castawayByPlacement.has(placement)) {
            castawayByPlacement.set(placement, castawayId);
          }
        }
        finalPlacementsActual = {
          fourthPlaceCastawayId: castawayByPlacement.get(4) ?? null,
          thirdPlaceCastawayId: castawayByPlacement.get(3) ?? null,
          secondPlaceCastawayId: castawayByPlacement.get(2) ?? null,
          firstPlaceCastawayId: castawayByPlacement.get(1) ?? null,
        };
      }

      await tx.survivorEpisodeCastawayResult.deleteMany({
        where: { episodeId: episode.id },
      });
      await tx.survivorEpisodeCastawayResult.createMany({
        data: weekResults,
      });

      for (const entry of entries) {
        const isClearWinner = entry.id === clearWinnerEntryId;
        const predictedBoot =
          eliminationCount > 0
            ? isClearWinner
              ? bootCastawayId
              : chance(rand, 0.3)
              ? bootCastawayId
              : chooseDifferent(
                  rand,
                  bootCastawayId,
                  aliveBefore,
                  new Set<string>()
                )
            : null;

        const predictedSecondaryBoot =
          eliminationCount > 1
            ? isClearWinner
              ? secondaryBootCastawayId
              : chance(rand, 0.25)
              ? secondaryBootCastawayId
              : chooseDifferent(
                  rand,
                  secondaryBootCastawayId,
                  aliveBefore,
                  new Set(predictedBoot ? [predictedBoot] : [])
                )
            : null;

        const predictedImmunityWinner =
          isClearWinner
            ? immunityWinnerCastawayId
            : chance(rand, 0.35)
            ? immunityWinnerCastawayId
            : chooseDifferent(
                rand,
                immunityWinnerCastawayId,
                winnerPool,
                new Set<string>()
              );

        const predictedSecondaryImmunityWinner =
          eliminationCount > 1
            ? isClearWinner
              ? secondaryImmunityWinnerCastawayId
              : chance(rand, 0.28)
              ? secondaryImmunityWinnerCastawayId
              : chooseDifferent(
                  rand,
                  secondaryImmunityWinnerCastawayId,
                  winnerPool,
                  new Set(predictedImmunityWinner ? [predictedImmunityWinner] : [])
                )
            : null;

        const primarySafePool = aliveBefore.filter((castawayId) => castawayId !== predictedBoot);
        const predictedSafePick =
          primarySafePool.length > 0 ? pickOne(rand, primarySafePool) : pickOne(rand, aliveBefore);

        const secondarySafePool = aliveBefore.filter((castawayId) => castawayId !== predictedSecondaryBoot);
        const predictedSecondarySafePick =
          eliminationCount > 1
            ? secondarySafePool.length > 0
              ? pickOne(rand, secondarySafePool)
              : pickOne(rand, aliveBefore)
            : null;

        const predictedBootVoteCount =
          eliminationCount > 0 && actualBootVoteCount != null
            ? isClearWinner
              ? actualBootVoteCount
              : chance(rand, 0.35)
              ? actualBootVoteCount
              : jitterVoteCount(rand, actualBootVoteCount)
            : null;
        const predictedSecondaryBootVoteCount =
          eliminationCount > 1 && actualSecondaryVoteCount != null
            ? isClearWinner
              ? actualSecondaryVoteCount
              : chance(rand, 0.28)
              ? actualSecondaryVoteCount
              : jitterVoteCount(rand, actualSecondaryVoteCount)
            : null;
        const predictedIdolPlayed = isClearWinner
          ? !!idolPlayerCastawayId
          : chance(rand, 0.55)
          ? !!idolPlayerCastawayId
          : !idolPlayerCastawayId;

        const predictedTribals =
          eliminationCount > 0
            ? [
                {
                  bootCastawayId: predictedBoot,
                  bootVoteCount: predictedBootVoteCount,
                  immunityWinnerCastawayId: predictedImmunityWinner,
                  safePickCastawayId: predictedSafePick,
                },
                ...(eliminationCount > 1
                  ? [
                      {
                        bootCastawayId: predictedSecondaryBoot,
                        bootVoteCount: predictedSecondaryBootVoteCount,
                        immunityWinnerCastawayId: predictedSecondaryImmunityWinner,
                        safePickCastawayId: predictedSecondarySafePick,
                      },
                    ]
                  : []),
              ]
            : [
                {
                  bootCastawayId: null,
                  bootVoteCount: null,
                  immunityWinnerCastawayId: predictedImmunityWinner,
                  safePickCastawayId: predictedSafePick,
                },
              ];

        let finalPlacementsPrediction: Prisma.InputJsonValue | null = null;
        if (week === FINALE_WEEK && finalPlacementsActual) {
          const finalistOrder = [
            finalPlacementsActual.fourthPlaceCastawayId,
            finalPlacementsActual.thirdPlaceCastawayId,
            finalPlacementsActual.secondPlaceCastawayId,
            finalPlacementsActual.firstPlaceCastawayId,
          ].filter((value): value is string => !!value);

          if (finalistOrder.length === 4) {
            let ordered = finalistOrder.slice();
            if (!isClearWinner) {
              ordered = shuffle(rand, finalistOrder);
              if (ordered.join("|") === finalistOrder.join("|")) {
                ordered = finalistOrder.slice(1).concat(finalistOrder[0]);
              }
            }
            finalPlacementsPrediction = {
              fourthPlaceCastawayId: ordered[0],
              thirdPlaceCastawayId: ordered[1],
              secondPlaceCastawayId: ordered[2],
              firstPlaceCastawayId: ordered[3],
            };
          }
        }

        const firstPredictedTribal = predictedTribals[0] ?? null;
        const secondPredictedTribal = predictedTribals[1] ?? null;

        await tx.survivorWeeklyPrediction.upsert({
          where: {
            episodeId_leagueEntryId: {
              episodeId: episode.id,
              leagueEntryId: entry.id,
            },
          },
          create: {
            leagueId: league.id,
            episodeId: episode.id,
            leagueEntryId: entry.id,
            tribals: predictedTribals as unknown as Prisma.InputJsonValue,
            ...(finalPlacementsPrediction ? { finalPlacements: finalPlacementsPrediction } : {}),
            bootCastawayId: firstPredictedTribal?.bootCastawayId ?? null,
            secondaryBootCastawayId: secondPredictedTribal?.bootCastawayId ?? null,
            bootVoteCount: firstPredictedTribal?.bootVoteCount ?? null,
            secondaryBootVoteCount: secondPredictedTribal?.bootVoteCount ?? null,
            immunityWinnerCastawayId: firstPredictedTribal?.immunityWinnerCastawayId ?? null,
            secondaryImmunityWinnerCastawayId:
              secondPredictedTribal?.immunityWinnerCastawayId ?? null,
            idolPlayed: predictedIdolPlayed,
            safePickCastawayId: firstPredictedTribal?.safePickCastawayId ?? null,
            secondarySafePickCastawayId: secondPredictedTribal?.safePickCastawayId ?? null,
            submittedAt: new Date(Date.now() - week * 86_400_000),
          },
          update: {
            tribals: predictedTribals as unknown as Prisma.InputJsonValue,
            finalPlacements:
              finalPlacementsPrediction ??
              ((Prisma.JsonNull as unknown) as Prisma.InputJsonValue),
            bootCastawayId: firstPredictedTribal?.bootCastawayId ?? null,
            secondaryBootCastawayId: secondPredictedTribal?.bootCastawayId ?? null,
            bootVoteCount: firstPredictedTribal?.bootVoteCount ?? null,
            secondaryBootVoteCount: secondPredictedTribal?.bootVoteCount ?? null,
            immunityWinnerCastawayId: firstPredictedTribal?.immunityWinnerCastawayId ?? null,
            secondaryImmunityWinnerCastawayId:
              secondPredictedTribal?.immunityWinnerCastawayId ?? null,
            idolPlayed: predictedIdolPlayed,
            safePickCastawayId: firstPredictedTribal?.safePickCastawayId ?? null,
            secondarySafePickCastawayId: secondPredictedTribal?.safePickCastawayId ?? null,
            submittedAt: new Date(Date.now() - week * 86_400_000),
            scoredAt: null,
            points: 0,
            breakdown: Prisma.JsonNull,
          },
        });
      }

      await recomputeSurvivorWeekScores(tx, league.id, episode.id);

      const namesById = new Map(league.survivorCastaways.map((castaway) => [castaway.id, castaway.name]));
      weekReports.push({
        week,
        isMerge: week === MERGE_WEEK,
        tribalCount: actualTribals.length,
        eliminated: eliminatedIds.map((id) => namesById.get(id) ?? id),
        immunityWinner: immunityWinnerCastawayId
          ? namesById.get(immunityWinnerCastawayId) ?? immunityWinnerCastawayId
          : null,
        secondaryImmunityWinner:
          secondaryImmunityWinnerCastawayId
            ? namesById.get(secondaryImmunityWinnerCastawayId) ??
              secondaryImmunityWinnerCastawayId
            : null,
      });
    }

    const confessionalTotals = await tx.survivorEpisodeCastawayResult.groupBy({
      by: ["castawayId"],
      where: { leagueId: league.id },
      _sum: { confessionalCount: true },
    });

    await tx.survivorCastaway.updateMany({
      where: { leagueId: league.id },
      data: { totalConfessionals: 0 },
    });
    await Promise.all(
      confessionalTotals.map((row) =>
        tx.survivorCastaway.update({
          where: { id: row.castawayId },
          data: { totalConfessionals: row._sum.confessionalCount ?? 0 },
        })
      )
    );

      return {
        picksPerEntry,
        seatOrder,
        entries,
      };
    },
    { maxWait: 10_000, timeout: 180_000 }
  );

  const [draftPicks, scoreSums, scoringPredictions, episodes, weeklyPredictions] =
    await Promise.all([
    prisma.survivorDraftPick.findMany({
      where: { draft: { leagueId } },
      select: {
        overallPick: true,
        leagueEntryId: true,
        castaway: { select: { name: true } },
      },
      orderBy: { overallPick: "asc" },
    }),
    prisma.leagueEntryScore.groupBy({
      by: ["leagueEntryId"],
      where: { leagueEntry: { leagueId } },
      _sum: { points: true },
    }),
    prisma.survivorWeeklyPrediction.findMany({
      where: { leagueId },
      select: {
        leagueEntryId: true,
        tribals: true,
        bootCastawayId: true,
        secondaryBootCastawayId: true,
        episode: {
          select: {
            survivorCastawayResults: {
              where: { eliminated: true },
              select: { castawayId: true },
            },
          },
        },
      },
    }),
    prisma.episode.findMany({
      where: { leagueId },
      orderBy: { week: "asc" },
      select: {
        week: true,
        survivorMeta: {
          select: {
            isMerge: true,
            isNonElimination: true,
            bootCastawayId: true,
            secondaryBootCastawayId: true,
            bootVoteCount: true,
            secondaryBootVoteCount: true,
            immunityWinnerCastawayId: true,
            secondaryImmunityWinnerCastawayId: true,
            lockedAt: true,
          },
        },
        survivorCastawayResults: {
          orderBy: { castawayId: "asc" },
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
        },
      },
    }),
    prisma.survivorWeeklyPrediction.findMany({
      where: { leagueId },
      orderBy: [{ episode: { week: "asc" } }, { leagueEntryId: "asc" }],
      select: {
        leagueEntryId: true,
        episode: { select: { week: true } },
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
        points: true,
      },
    }),
  ]);

  const totalsByEntryId = new Map(
    scoreSums.map((row) => [row.leagueEntryId, Number(row._sum.points?.toString() ?? "0")])
  );
  const correctBootByEntryId = countCorrectEliminationPredictions(scoringPredictions);
  const standings = transactionResult.entries
    .map((entry) => ({
      entryId: entry.id,
      displayName: entry.displayName,
      totalPoints: totalsByEntryId.get(entry.id) ?? 0,
      correctBootPredictions: correctBootByEntryId.get(entry.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
      if (b.correctBootPredictions !== a.correctBootPredictions) {
        return b.correctBootPredictions - a.correctBootPredictions;
      }
      return a.displayName.localeCompare(b.displayName);
    })
    .map((row, index) => ({ rank: index + 1, ...row }));

  const pickSummary = draftPicks.map((pick) => {
    const entry = transactionResult.entries.find((value) => value.id === pick.leagueEntryId);
    return {
      overallPick: pick.overallPick,
      draftedBy: entry?.displayName ?? pick.leagueEntryId,
      castaway: pick.castaway.name,
    };
  });

  const castawayNameById = new Map(
    league.survivorCastaways.map((castaway) => [castaway.id, castaway.name])
  );
  const entryNameById = new Map(
    transactionResult.entries.map((entry) => [entry.id, entry.displayName])
  );

  const fullWeeklyResults = episodes.map((episode) => ({
    week: episode.week,
    meta: {
      isMerge: episode.survivorMeta?.isMerge ?? false,
      isNonElimination: episode.survivorMeta?.isNonElimination ?? false,
      bootCastaway:
        episode.survivorMeta?.bootCastawayId
          ? castawayNameById.get(episode.survivorMeta.bootCastawayId) ??
            episode.survivorMeta.bootCastawayId
          : null,
      secondaryBootCastaway:
        episode.survivorMeta?.secondaryBootCastawayId
          ? castawayNameById.get(episode.survivorMeta.secondaryBootCastawayId) ??
            episode.survivorMeta.secondaryBootCastawayId
          : null,
      bootVoteCount: episode.survivorMeta?.bootVoteCount ?? null,
      secondaryBootVoteCount: episode.survivorMeta?.secondaryBootVoteCount ?? null,
      immunityWinner:
        episode.survivorMeta?.immunityWinnerCastawayId
          ? castawayNameById.get(episode.survivorMeta.immunityWinnerCastawayId) ??
            episode.survivorMeta.immunityWinnerCastawayId
          : null,
      secondaryImmunityWinner:
        episode.survivorMeta?.secondaryImmunityWinnerCastawayId
          ? castawayNameById.get(episode.survivorMeta.secondaryImmunityWinnerCastawayId) ??
            episode.survivorMeta.secondaryImmunityWinnerCastawayId
          : null,
      lockedAt: episode.survivorMeta?.lockedAt ?? null,
    },
    castawayResults: episode.survivorCastawayResults.map((result) => ({
      castawayId: result.castawayId,
      castawayName: castawayNameById.get(result.castawayId) ?? result.castawayId,
      survived: result.survived,
      eliminated: result.eliminated,
      individualImmunityWins: result.individualImmunityWins,
      tribeImmunityWins: result.tribeImmunityWins,
      individualRewardWins: result.individualRewardWins,
      advantagesFound: result.advantagesFound,
      idolsPlayedSuccessfully: result.idolsPlayedSuccessfully,
      votesReceived: result.votesReceived,
      confessionalCount: result.confessionalCount,
      confessionalLeader: result.confessionalLeader,
      endgamePlacement: result.endgamePlacement,
    })),
  }));

  const fullWeeklyPredictions = weeklyPredictions.map((prediction) => {
    const finalPlacements =
      prediction.finalPlacements &&
      typeof prediction.finalPlacements === "object" &&
      !Array.isArray(prediction.finalPlacements)
        ? (prediction.finalPlacements as Record<string, unknown>)
        : null;
    const mapName = (value: unknown) =>
      typeof value === "string" ? castawayNameById.get(value) ?? value : null;

    return {
      week: prediction.episode.week,
      entryId: prediction.leagueEntryId,
      entryName: entryNameById.get(prediction.leagueEntryId) ?? prediction.leagueEntryId,
      picks: {
        bootCastaway: mapName(prediction.bootCastawayId),
        secondaryBootCastaway: mapName(prediction.secondaryBootCastawayId),
        bootVoteCount: prediction.bootVoteCount,
        secondaryBootVoteCount: prediction.secondaryBootVoteCount,
        immunityWinner: mapName(prediction.immunityWinnerCastawayId),
        secondaryImmunityWinner: mapName(prediction.secondaryImmunityWinnerCastawayId),
        idolPlayed: prediction.idolPlayed,
        safePick: mapName(prediction.safePickCastawayId),
        secondarySafePick: mapName(prediction.secondarySafePickCastawayId),
        finalPlacements: {
          fourthPlace: mapName(finalPlacements?.fourthPlaceCastawayId),
          thirdPlace: mapName(finalPlacements?.thirdPlaceCastawayId),
          secondPlace: mapName(finalPlacements?.secondPlaceCastawayId),
          firstPlace: mapName(finalPlacements?.firstPlaceCastawayId),
        },
      },
      pointsAwarded: Number(prediction.points.toString()),
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    league: {
      id: league.id,
      name: league.name,
      picksPerEntry: transactionResult.picksPerEntry,
      seasonWeeks: SURVIVOR_SEASON_WEEKS,
    },
    draftOrder: transactionResult.seatOrder.map((entry, index) => ({
      seat: index + 1,
      displayName: entry.displayName,
    })),
    draftPicks: pickSummary,
    weeks: weekReports,
    weeklyPredictions: fullWeeklyPredictions,
    weeklyResults: fullWeeklyResults,
    standings,
  };

  const outputPath = path.resolve(
    process.cwd(),
    `mock-survivor-season-${league.id}.json`
  );
  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");

  console.log(`Mock Survivor season generated for league: ${league.name} (${league.id})`);
  console.log(`Seed: ${args.seed}`);
  console.log(`Weeks generated: ${SURVIVOR_SEASON_WEEKS}`);
  console.log(`Draft picks per entry: ${transactionResult.picksPerEntry}`);
  console.log("");
  console.log("Final standings:");
  for (const row of standings) {
    console.log(
      `  #${row.rank} ${row.displayName} - ${row.totalPoints.toFixed(
        2
      )} pts (correct boots: ${row.correctBootPredictions})`
    );
  }
  console.log("");
  console.log(`Summary written to: ${outputPath}`);
}

main()
  .catch((error) => {
    console.error("Failed to generate mock Survivor season.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
