import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type BootOrderPayload = {
  orderedCastawayIds: string[];
};

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        showType: true,
        members: {
          where: { userId: user.id },
          select: { id: true },
        },
      },
    });
    if (!league) return errorResponse("League not found", 404);
    if (league.showType !== "SURVIVOR") return errorResponse("Ruleset not implemented", 400);
    if (league.members.length === 0) return errorResponse("Forbidden", 403);

    const [entry, mergeEpisode] = await Promise.all([
      prisma.leagueEntry.upsert({
        where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
        create: { leagueId: league.id, userId: user.id },
        update: {},
        select: { id: true },
      }),
      prisma.episode.findFirst({
        where: {
          leagueId: league.id,
          survivorMeta: { is: { isMerge: true } },
        },
        orderBy: { week: "asc" },
        select: {
          id: true,
          week: true,
          survivorCastawayResults: {
            select: {
              castawayId: true,
              castaway: {
                select: {
                  id: true,
                  name: true,
                  tribe: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const existing = await prisma.survivorBootOrderSubmission.findUnique({
      where: { leagueEntryId: entry.id },
      select: {
        id: true,
        submittedAt: true,
        lockedAt: true,
        scoredAt: true,
        points: true,
        items: {
          select: {
            castawayId: true,
            predictedPosition: true,
            castaway: { select: { name: true } },
          },
          orderBy: { predictedPosition: "asc" },
        },
      },
    });

    if (!mergeEpisode) {
      return NextResponse.json({
        isMergeOpen: false,
        isLocked: true,
        lockReason: "Boot-order lock-in unlocks at merge.",
        mergeWeek: null,
        castaways: [],
        existing,
      });
    }

    const mergeCastaways = Array.from(
      new Map(
        mergeEpisode.survivorCastawayResults.map((row) => [
          row.castawayId,
          {
            id: row.castaway.id,
            name: row.castaway.name,
            tribe: row.castaway.tribe,
          },
        ])
      ).values()
    );

    const final3Count = await prisma.survivorEpisodeCastawayResult.count({
      where: {
        leagueId: league.id,
        castawayId: { in: mergeCastaways.map((row) => row.id) },
        endgamePlacement: { lte: 3 },
      },
    });
    const deadlinePassed = final3Count >= 3;

    const isLocked = !!existing || deadlinePassed;
    const lockReason = existing
      ? "You already submitted your boot-order lock-in."
      : deadlinePassed
        ? "Boot-order lock-in has closed."
        : null;

    return NextResponse.json({
      isMergeOpen: true,
      isLocked,
      lockReason,
      mergeWeek: mergeEpisode.week,
      castaways: mergeCastaways,
      existing,
    });
  } catch {
    return errorResponse("Failed to load boot-order lock-in state.", 500);
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getCurrentUser();
    if (!user) return errorResponse("Unauthorized", 401);

    const payload = (await req.json()) as BootOrderPayload;
    if (!payload || !Array.isArray(payload.orderedCastawayIds)) {
      return errorResponse("orderedCastawayIds is required.", 400);
    }

    const orderedCastawayIds = payload.orderedCastawayIds.map((value) => String(value).trim());
    if (orderedCastawayIds.some((value) => !value)) {
      return errorResponse("orderedCastawayIds contains invalid values.", 400);
    }

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        showType: true,
        members: {
          where: { userId: user.id },
          select: { id: true },
        },
      },
    });
    if (!league) return errorResponse("League not found", 404);
    if (league.showType !== "SURVIVOR") return errorResponse("Ruleset not implemented", 400);
    if (league.members.length === 0) return errorResponse("Forbidden", 403);

    const result = await prisma.$transaction(async (tx) => {
      const [entry, mergeEpisode] = await Promise.all([
        tx.leagueEntry.upsert({
          where: { leagueId_userId: { leagueId: league.id, userId: user.id } },
          create: { leagueId: league.id, userId: user.id },
          update: {},
          select: { id: true },
        }),
        tx.episode.findFirst({
          where: {
            leagueId: league.id,
            survivorMeta: { is: { isMerge: true } },
          },
          orderBy: { week: "asc" },
          select: {
            id: true,
            survivorCastawayResults: {
              select: {
                castawayId: true,
              },
            },
          },
        }),
      ]);

      if (!mergeEpisode) throw new Error("MERGE_NOT_OPEN");

      const mergeCastawayIds = Array.from(
        new Set(mergeEpisode.survivorCastawayResults.map((row) => row.castawayId))
      );

      if (mergeCastawayIds.length === 0) throw new Error("MERGE_CASTAWAYS_MISSING");

      const final3Count = await tx.survivorEpisodeCastawayResult.count({
        where: {
          leagueId: league.id,
          castawayId: { in: mergeCastawayIds },
          endgamePlacement: { lte: 3 },
        },
      });
      if (final3Count >= 3) throw new Error("LOCK_DEADLINE_PASSED");

      const existing = await tx.survivorBootOrderSubmission.findUnique({
        where: { leagueEntryId: entry.id },
        select: { id: true },
      });
      if (existing) throw new Error("ALREADY_SUBMITTED");

      if (
        orderedCastawayIds.length !== mergeCastawayIds.length ||
        new Set(orderedCastawayIds).size !== orderedCastawayIds.length
      ) {
        throw new Error("INVALID_ORDER_LENGTH");
      }

      const mergeCastawayIdSet = new Set(mergeCastawayIds);
      if (!orderedCastawayIds.every((idValue) => mergeCastawayIdSet.has(idValue))) {
        throw new Error("INVALID_CASTAWAY_SET");
      }

      const created = await tx.survivorBootOrderSubmission.create({
        data: {
          leagueId: league.id,
          leagueEntryId: entry.id,
          mergeEpisodeId: mergeEpisode.id,
          submittedAt: new Date(),
          lockedAt: new Date(),
        },
        select: { id: true },
      });

      await tx.survivorBootOrderItem.createMany({
        data: orderedCastawayIds.map((castawayId, index) => ({
          submissionId: created.id,
          castawayId,
          predictedPosition: index + 1,
        })),
      });

      return created.id;
    });

    return NextResponse.json({
      ok: true,
      submissionId: result,
      message: "Boot-order lock-in submitted.",
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "MERGE_NOT_OPEN") {
        return errorResponse("Boot-order lock-in unlocks at merge.", 400);
      }
      if (err.message === "MERGE_CASTAWAYS_MISSING") {
        return errorResponse("Merge castaways are not available yet.", 400);
      }
      if (err.message === "LOCK_DEADLINE_PASSED") {
        return errorResponse("Boot-order lock-in has closed.", 403);
      }
      if (err.message === "ALREADY_SUBMITTED") {
        return errorResponse("You already submitted your boot-order lock-in.", 409);
      }
      if (err.message === "INVALID_ORDER_LENGTH") {
        return errorResponse("Submission must include each merge castaway exactly once.", 400);
      }
      if (err.message === "INVALID_CASTAWAY_SET") {
        return errorResponse("Submission contains invalid castaways for this merge.", 400);
      }
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return errorResponse("You already submitted your boot-order lock-in.", 409);
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      return errorResponse(
        "Database schema is behind this deployment (missing column). Run `npx prisma migrate deploy` on production and redeploy.",
        500
      );
    }

    return errorResponse("Failed to submit boot-order lock-in.", 500);
  }
}
