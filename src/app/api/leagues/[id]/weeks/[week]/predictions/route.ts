import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { survivorWeekPredictionLockAt } from "@/lib/survivor/survivor-rules";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

type SurvivorTribalPredictionPayload = {
  bootCastawayId?: string | null;
  bootVoteCount?: number | null;
  immunityWinnerCastawayId?: string | null;
  safePickCastawayId?: string | null;
};

type SurvivorPredictionPayload = {
  tribals?: SurvivorTribalPredictionPayload[];
  finalPlacements?: {
    fourthPlaceCastawayId?: string | null;
    thirdPlaceCastawayId?: string | null;
    secondPlaceCastawayId?: string | null;
    firstPlaceCastawayId?: string | null;
  } | null;
  bootCastawayId?: string | null;
  secondaryBootCastawayId?: string | null;
  bootVoteCount?: number | null;
  secondaryBootVoteCount?: number | null;
  immunityWinnerCastawayId?: string | null;
  secondaryImmunityWinnerCastawayId?: string | null;
  idolPlayed?: boolean;
  safePickCastawayId?: string | null;
  secondarySafePickCastawayId?: string | null;
};

type NormalizedTribalPrediction = {
  bootCastawayId: string | null;
  bootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
  safePickCastawayId: string | null;
};

type NormalizedFinalPlacements = {
  fourthPlaceCastawayId: string | null;
  thirdPlaceCastawayId: string | null;
  secondPlaceCastawayId: string | null;
  firstPlaceCastawayId: string | null;
};

function parseNonNegativeInt(input: unknown) {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function cleanId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeTribalPredictions(payload: SurvivorPredictionPayload) {
  if (Array.isArray(payload.tribals) && payload.tribals.length > 0) {
    return payload.tribals.map((tribal) => ({
      bootCastawayId: cleanId(tribal.bootCastawayId) || null,
      bootVoteCount:
        tribal.bootVoteCount == null ? null : parseNonNegativeInt(tribal.bootVoteCount),
      immunityWinnerCastawayId: cleanId(tribal.immunityWinnerCastawayId) || null,
      safePickCastawayId: cleanId(tribal.safePickCastawayId) || null,
    }));
  }

  const first: NormalizedTribalPrediction = {
    bootCastawayId: cleanId(payload.bootCastawayId) || null,
    bootVoteCount:
      payload.bootVoteCount == null ? null : parseNonNegativeInt(payload.bootVoteCount),
    immunityWinnerCastawayId: cleanId(payload.immunityWinnerCastawayId) || null,
    safePickCastawayId: cleanId(payload.safePickCastawayId) || null,
  };
  const second: NormalizedTribalPrediction = {
    bootCastawayId: cleanId(payload.secondaryBootCastawayId) || null,
    bootVoteCount:
      payload.secondaryBootVoteCount == null
        ? null
        : parseNonNegativeInt(payload.secondaryBootVoteCount),
    immunityWinnerCastawayId: cleanId(payload.secondaryImmunityWinnerCastawayId) || null,
    safePickCastawayId: cleanId(payload.secondarySafePickCastawayId) || null,
  };

  const out = [first];
  if (
    second.bootCastawayId ||
    second.bootVoteCount != null ||
    second.immunityWinnerCastawayId ||
    second.safePickCastawayId
  ) {
    out.push(second);
  }

  return out;
}

function normalizeFinalPlacements(payload: SurvivorPredictionPayload): NormalizedFinalPlacements {
  const placements =
    payload.finalPlacements && typeof payload.finalPlacements === "object"
      ? payload.finalPlacements
      : {};

  return {
    fourthPlaceCastawayId: cleanId(placements.fourthPlaceCastawayId) || null,
    thirdPlaceCastawayId: cleanId(placements.thirdPlaceCastawayId) || null,
    secondPlaceCastawayId: cleanId(placements.secondPlaceCastawayId) || null,
    firstPlaceCastawayId: cleanId(placements.firstPlaceCastawayId) || null,
  };
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; week: string }> }
) {
  try {
    const { id, week } = await params;
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);

    const weekNum = Number(week);
    if (!Number.isInteger(weekNum) || weekNum < 1) {
      return errorResponse("Invalid week", 400);
    }

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        showType: true,
        startsAt: true,
        members: { where: { userId: user.id }, select: { id: true } },
      },
    });
    if (!league) return errorResponse("League not found", 404);
    if (league.showType !== "SURVIVOR") return errorResponse("Ruleset not implemented", 400);
    if (weekNum > SURVIVOR_SEASON_WEEKS) return errorResponse("Invalid week", 400);
    if (league.members.length === 0) return errorResponse("Forbidden", 403);

    const [entry, episode] = await Promise.all([
      prisma.leagueEntry.upsert({
        where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
        create: { leagueId: league.id, userId: user.id },
        update: {},
        select: { id: true },
      }),
      prisma.episode.findUnique({
        where: { leagueId_week: { leagueId: league.id, week: weekNum } },
        select: {
          id: true,
          lockedAt: true,
          survivorMeta: {
            select: {
              lockedAt: true,
              tribalCount: true,
            },
          },
        },
      }),
    ]);

    const existing = episode
      ? await prisma.survivorWeeklyPrediction.findUnique({
          where: {
            episodeId_leagueEntryId: {
              episodeId: episode.id,
              leagueEntryId: entry.id,
            },
          },
          select: {
            id: true,
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
            submittedAt: true,
            scoredAt: true,
            points: true,
            breakdown: true,
          },
        })
      : null;

    const lockAt = survivorWeekPredictionLockAt(league.startsAt, weekNum, episode?.lockedAt);
    const now = new Date();
    const resultsLocked = !!episode?.survivorMeta?.lockedAt;
    const timeLocked = lockAt ? now >= lockAt : false;
    const isLocked = resultsLocked || timeLocked || !!existing;
    const tribalCount = Math.max(
      1,
      episode?.survivorMeta?.tribalCount ?? (weekNum === 1 ? 2 : 1)
    );

    return NextResponse.json({
      isLocked,
      lockAt,
      tribalCount,
      existing,
    });
  } catch {
    return errorResponse("Failed to load prediction state.", 500);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; week: string }> }
) {
  try {
    const { id, week } = await params;
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);

    const weekNum = Number(week);
    if (!Number.isInteger(weekNum) || weekNum < 1) {
      return errorResponse("Invalid week", 400);
    }

    const payload = (await req.json()) as SurvivorPredictionPayload;
    if (!payload || typeof payload !== "object") {
      return errorResponse("Invalid payload", 400);
    }

    const idolPlayed =
      typeof payload.idolPlayed === "boolean" ? payload.idolPlayed : null;
    if (idolPlayed == null) return errorResponse("idolPlayed must be true or false.", 400);

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        showType: true,
        startsAt: true,
        members: { where: { userId: user.id }, select: { id: true } },
      },
    });
    if (!league) return errorResponse("League not found.", 404);
    if (league.showType !== "SURVIVOR") return errorResponse("Ruleset not implemented.", 400);
    if (weekNum > SURVIVOR_SEASON_WEEKS) return errorResponse("Invalid week.", 400);
    if (league.members.length === 0) return errorResponse("Forbidden", 403);

    const result = await prisma.$transaction(async (tx) => {
      const [entry, episode] = await Promise.all([
        tx.leagueEntry.upsert({
          where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
          create: { leagueId: league.id, userId: user.id },
          update: {},
          select: { id: true },
        }),
        tx.episode.upsert({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          create: { leagueId: league.id, week: weekNum },
          update: {},
          select: {
            id: true,
            lockedAt: true,
            survivorMeta: { select: { lockedAt: true, tribalCount: true } },
          },
        }),
      ]);

      const lockAt = survivorWeekPredictionLockAt(league.startsAt, weekNum, episode.lockedAt);
      const now = new Date();
      const resultsLocked = !!episode.survivorMeta?.lockedAt;
      const timeLocked = lockAt ? now >= lockAt : false;
      if (resultsLocked || timeLocked) {
        throw new Error("PREDICTIONS_LOCKED");
      }

      const expectedTribalCount = Math.max(
        1,
        episode.survivorMeta?.tribalCount ?? (weekNum === 1 ? 2 : 1)
      );
      const tribals = normalizeTribalPredictions(payload);
      const isFinaleWeek = weekNum === SURVIVOR_SEASON_WEEKS;
      const finalPlacements = normalizeFinalPlacements(payload);

      if (tribals.length !== expectedTribalCount) {
        throw new Error("INVALID_TRIBAL_COUNT");
      }

      const existing = await tx.survivorWeeklyPrediction.findUnique({
        where: {
          episodeId_leagueEntryId: {
            episodeId: episode.id,
            leagueEntryId: entry.id,
          },
        },
        select: { id: true },
      });
      if (existing) throw new Error("PREDICTION_ALREADY_SUBMITTED");

      const predictedBoots = new Set<string>();
      for (let i = 0; i < tribals.length; i += 1) {
        const tribal = tribals[i];
        if (!tribal.bootCastawayId) throw new Error("MISSING_TRIBAL_FIELDS");
        if (tribal.bootVoteCount == null) throw new Error("MISSING_TRIBAL_FIELDS");
        if (!tribal.immunityWinnerCastawayId) throw new Error("MISSING_TRIBAL_FIELDS");
        if (!tribal.safePickCastawayId) throw new Error("MISSING_TRIBAL_FIELDS");
        if (tribal.safePickCastawayId === tribal.bootCastawayId) {
          throw new Error("SAFE_PICK_EQUALS_BOOT");
        }
        if (predictedBoots.has(tribal.bootCastawayId)) {
          throw new Error("DUPLICATE_BOOT_PICK");
        }
        predictedBoots.add(tribal.bootCastawayId);
      }

      const castawayIds = new Set<string>();
      for (const tribal of tribals) {
        if (tribal.bootCastawayId) castawayIds.add(tribal.bootCastawayId);
        if (tribal.immunityWinnerCastawayId) castawayIds.add(tribal.immunityWinnerCastawayId);
        if (tribal.safePickCastawayId) castawayIds.add(tribal.safePickCastawayId);
      }

      let finalPlacementsForStore: Prisma.InputJsonValue | null = null;
      if (isFinaleWeek) {
        const orderedFinalPlacements = [
          finalPlacements.fourthPlaceCastawayId,
          finalPlacements.thirdPlaceCastawayId,
          finalPlacements.secondPlaceCastawayId,
          finalPlacements.firstPlaceCastawayId,
        ];
        if (orderedFinalPlacements.some((value) => !value)) {
          throw new Error("MISSING_FINALE_PLACEMENTS");
        }

        const uniqueFinalPlacements = new Set(
          orderedFinalPlacements.filter((value): value is string => !!value)
        );
        if (uniqueFinalPlacements.size !== 4) {
          throw new Error("DUPLICATE_FINALE_PLACEMENTS");
        }

        const [allCastaways, eliminatedBeforeFinale] = await Promise.all([
          tx.survivorCastaway.findMany({
            where: { leagueId: league.id },
            select: { id: true },
          }),
          tx.survivorEpisodeCastawayResult.findMany({
            where: {
              leagueId: league.id,
              eliminated: true,
              episode: {
                week: { lt: weekNum },
              },
            },
            select: { castawayId: true },
            distinct: ["castawayId"],
          }),
        ]);

        const eliminatedIds = new Set(eliminatedBeforeFinale.map((row) => row.castawayId));
        const remainingIds = new Set(
          allCastaways.map((row) => row.id).filter((castawayId) => !eliminatedIds.has(castawayId))
        );

        if (remainingIds.size < 4) {
          throw new Error("NOT_ENOUGH_FINALE_CANDIDATES");
        }

        for (const castawayId of uniqueFinalPlacements) {
          if (!remainingIds.has(castawayId)) {
            throw new Error("INVALID_FINALE_CANDIDATE");
          }
          castawayIds.add(castawayId);
        }

        finalPlacementsForStore = {
          fourthPlaceCastawayId: finalPlacements.fourthPlaceCastawayId,
          thirdPlaceCastawayId: finalPlacements.thirdPlaceCastawayId,
          secondPlaceCastawayId: finalPlacements.secondPlaceCastawayId,
          firstPlaceCastawayId: finalPlacements.firstPlaceCastawayId,
        };
      }

      const validCastaways = await tx.survivorCastaway.findMany({
        where: { leagueId: league.id, id: { in: Array.from(castawayIds) } },
        select: { id: true },
      });
      if (validCastaways.length !== castawayIds.size) {
        throw new Error("INVALID_CASTAWAY");
      }

      const firstTribal = tribals[0];
      const secondTribal = tribals[1] ?? null;

      const created = await tx.survivorWeeklyPrediction.create({
        data: {
          leagueId: league.id,
          episodeId: episode.id,
          leagueEntryId: entry.id,
          tribals: tribals as unknown as Prisma.InputJsonValue,
          ...(finalPlacementsForStore
            ? { finalPlacements: finalPlacementsForStore }
            : {}),
          bootCastawayId: firstTribal?.bootCastawayId ?? null,
          secondaryBootCastawayId: secondTribal?.bootCastawayId ?? null,
          bootVoteCount: firstTribal?.bootVoteCount ?? null,
          secondaryBootVoteCount: secondTribal?.bootVoteCount ?? null,
          immunityWinnerCastawayId: firstTribal?.immunityWinnerCastawayId ?? null,
          secondaryImmunityWinnerCastawayId:
            secondTribal?.immunityWinnerCastawayId ?? null,
          idolPlayed,
          safePickCastawayId: firstTribal?.safePickCastawayId ?? null,
          secondarySafePickCastawayId: secondTribal?.safePickCastawayId ?? null,
          submittedAt: now,
        },
        select: {
          id: true,
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
          submittedAt: true,
        },
      });

      return { created, lockAt, tribalCount: expectedTribalCount };
    });

    return NextResponse.json({
      ok: true,
      prediction: result.created,
      lockAt: result.lockAt,
      tribalCount: result.tribalCount,
      message: "Prediction submitted.",
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PREDICTIONS_LOCKED") {
        return errorResponse("Predictions are locked for this week.", 403);
      }
      if (err.message === "PREDICTION_ALREADY_SUBMITTED") {
        return errorResponse("You already submitted this week's prediction.", 409);
      }
      if (err.message === "INVALID_CASTAWAY") {
        return errorResponse("Prediction includes castaways outside this league.", 400);
      }
      if (err.message === "INVALID_TRIBAL_COUNT") {
        return errorResponse(
          "Prediction count does not match configured number of tribals for this week.",
          400
        );
      }
      if (err.message === "MISSING_TRIBAL_FIELDS") {
        return errorResponse(
          "Each tribal prediction needs boot pick, vote count, immunity winner, and safe pick.",
          400
        );
      }
      if (err.message === "SAFE_PICK_EQUALS_BOOT") {
        return errorResponse("Safe pick cannot match boot pick within the same tribal.", 400);
      }
      if (err.message === "DUPLICATE_BOOT_PICK") {
        return errorResponse("Boot picks must be unique across tribal sets.", 400);
      }
      if (err.message === "MISSING_FINALE_PLACEMENTS") {
        return errorResponse(
          "Final week requires 4th, 3rd, 2nd, and 1st place picks.",
          400
        );
      }
      if (err.message === "DUPLICATE_FINALE_PLACEMENTS") {
        return errorResponse("Final placement picks must be unique.", 400);
      }
      if (err.message === "NOT_ENOUGH_FINALE_CANDIDATES") {
        return errorResponse(
          "Not enough remaining survivors to submit Final 4 placement picks.",
          400
        );
      }
      if (err.message === "INVALID_FINALE_CANDIDATE") {
        return errorResponse(
          "Final placement picks must come from remaining survivors.",
          400
        );
      }
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return errorResponse("You already submitted this week's prediction.", 409);
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      return errorResponse(
        "Database schema is behind this deployment (missing column). Run `npx prisma migrate deploy` on production and redeploy.",
        500
      );
    }

    return errorResponse("Failed to submit prediction.", 500);
  }
}
