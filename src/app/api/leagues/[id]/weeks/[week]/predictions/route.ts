import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { survivorWeekPredictionLockAt } from "@/lib/survivor/survivor-rules";

type SurvivorPredictionPayload = {
  bootCastawayId: string;
  bootVoteCount: number;
  immunityWinnerCastawayId: string;
  idolPlayed: boolean;
  safePickCastawayId: string;
};

function parseNonNegativeInt(input: unknown) {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
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
        select: { id: true, lockedAt: true, survivorMeta: { select: { lockedAt: true } } },
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
            bootCastawayId: true,
            bootVoteCount: true,
            immunityWinnerCastawayId: true,
            idolPlayed: true,
            safePickCastawayId: true,
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

    return NextResponse.json({
      isLocked,
      lockAt,
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

    const bootCastawayId = (payload.bootCastawayId ?? "").trim();
    const immunityWinnerCastawayId = (payload.immunityWinnerCastawayId ?? "").trim();
    const safePickCastawayId = (payload.safePickCastawayId ?? "").trim();
    const bootVoteCount = parseNonNegativeInt(payload.bootVoteCount);
    const idolPlayed =
      typeof payload.idolPlayed === "boolean" ? payload.idolPlayed : null;

    if (!bootCastawayId) return errorResponse("bootCastawayId is required.", 400);
    if (!immunityWinnerCastawayId) {
      return errorResponse("immunityWinnerCastawayId is required.", 400);
    }
    if (!safePickCastawayId) return errorResponse("safePickCastawayId is required.", 400);
    if (bootVoteCount == null) return errorResponse("bootVoteCount must be a non-negative integer.", 400);
    if (idolPlayed == null) return errorResponse("idolPlayed must be true or false.", 400);
    if (safePickCastawayId === bootCastawayId) {
      return errorResponse("safePickCastawayId cannot match bootCastawayId.", 400);
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
    if (!league) return errorResponse("League not found.", 404);
    if (league.showType !== "SURVIVOR") return errorResponse("Ruleset not implemented.", 400);
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
          select: { id: true, lockedAt: true, survivorMeta: { select: { lockedAt: true } } },
        }),
      ]);

      const lockAt = survivorWeekPredictionLockAt(league.startsAt, weekNum, episode.lockedAt);
      const now = new Date();
      const resultsLocked = !!episode.survivorMeta?.lockedAt;
      const timeLocked = lockAt ? now >= lockAt : false;
      if (resultsLocked || timeLocked) {
        throw new Error("PREDICTIONS_LOCKED");
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

      const castawayIds = new Set<string>([
        bootCastawayId,
        immunityWinnerCastawayId,
        safePickCastawayId,
      ]);

      const validCastaways = await tx.survivorCastaway.findMany({
        where: { leagueId: league.id, id: { in: Array.from(castawayIds) } },
        select: { id: true },
      });
      if (validCastaways.length !== castawayIds.size) {
        throw new Error("INVALID_CASTAWAY");
      }

      const created = await tx.survivorWeeklyPrediction.create({
        data: {
          leagueId: league.id,
          episodeId: episode.id,
          leagueEntryId: entry.id,
          bootCastawayId,
          bootVoteCount,
          immunityWinnerCastawayId,
          idolPlayed,
          safePickCastawayId,
          submittedAt: now,
        },
        select: {
          id: true,
          bootCastawayId: true,
          bootVoteCount: true,
          immunityWinnerCastawayId: true,
          idolPlayed: true,
          safePickCastawayId: true,
          submittedAt: true,
        },
      });

      return { created, lockAt };
    });

    return NextResponse.json({
      ok: true,
      prediction: result.created,
      lockAt: result.lockAt,
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
