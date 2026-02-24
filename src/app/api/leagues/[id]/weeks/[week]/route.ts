import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeDragRaceWeekScores } from "@/lib/scoring/drag-race";
import { recomputeSurvivorWeekScores } from "@/lib/scoring/survivor";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

type DragRaceWeekPayload = {
  miniWinners: string[];
  mainWinners: string[];
  lipsyncWinner: string;
  eliminatedQueenId: string | null;
};

type SurvivorCastawayResultPayload = {
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
};

type SurvivorWeekPayload = {
  recomputeOnly?: boolean;
  isMerge: boolean;
  isNonElimination: boolean;
  bootCastawayId: string | null;
  secondaryBootCastawayId: string | null;
  bootVoteCount: number | null;
  secondaryBootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
  secondaryImmunityWinnerCastawayId: string | null;
  results: SurvivorCastawayResultPayload[];
};

function parseNonNegativeInt(input: unknown) {
  const n = Number(input);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function prismaErrorToResponse(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2022") {
      const meta =
        err.meta && typeof err.meta === "object" ? ` (${JSON.stringify(err.meta)})` : "";
      return NextResponse.json(
        {
          error:
            `Database schema is behind this deployment (missing column). Run \`npx prisma migrate deploy\` on production and redeploy.${meta}`,
          prismaCode: err.code,
        },
        { status: 500 }
      );
    }

    if (err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "A referenced record was not found for this save operation. Refresh and try again.",
          prismaCode: err.code,
        },
        { status: 400 }
      );
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error:
          "Database connection failed. Verify production DATABASE_URL/DIRECT_URL credentials.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; week: string }> }
) {
  const { id, week } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekNum = Number(week);
  if (!Number.isInteger(weekNum) || weekNum < 1) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id },
    select: { showType: true },
  });
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.showType === "SURVIVOR" && weekNum > SURVIVOR_SEASON_WEEKS) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }

  const episode =
    league.showType === "SURVIVOR"
      ? await prisma.episode.findUnique({
          where: { leagueId_week: { leagueId: id, week: weekNum } },
          select: {
            id: true,
            week: true,
            leagueId: true,
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
        })
      : await prisma.episode.findUnique({
          where: { leagueId_week: { leagueId: id, week: weekNum } },
          select: {
            id: true,
            week: true,
            leagueId: true,
            episodeType: true,
            results: true,
          },
        });

  return NextResponse.json({ episode });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; week: string }> }
) {
  try {
    const { id, week } = await params;

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const weekNum = Number(week);
    if (!Number.isInteger(weekNum) || weekNum < 1) {
      return NextResponse.json({ error: "Invalid week" }, { status: 400 });
    }

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        showType: true,
        seasonKey: true,
        createdById: true,
        startsAt: true,
        startedAt: true,
      },
    });

    if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
    if (league.showType === "SURVIVOR" && weekNum > SURVIVOR_SEASON_WEEKS) {
      return NextResponse.json({ error: "Invalid week" }, { status: 400 });
    }

    const isCommissioner = league.createdById === user.id;
    if (!isCommissioner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const hasStarted =
      league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

    if (!hasStarted) {
      return NextResponse.json({ error: "League not started" }, { status: 400 });
    }

    if (league.showType === "DRAG_RACE") {
      const body = (await req.json()) as DragRaceWeekPayload;

      if (!Array.isArray(body.miniWinners) || body.miniWinners.length < 1) {
        return NextResponse.json({ error: "Mini winners required" }, { status: 400 });
      }
      if (!Array.isArray(body.mainWinners) || body.mainWinners.length < 1) {
        return NextResponse.json({ error: "Main winners required" }, { status: 400 });
      }
      if (!body.lipsyncWinner) {
        return NextResponse.json({ error: "Lip sync winner required" }, { status: 400 });
      }

      if (!league.seasonKey) {
        return NextResponse.json({ error: "League seasonKey missing" }, { status: 400 });
      }

      const submittedIds = new Set<string>([
        ...body.miniWinners,
        ...body.mainWinners,
        body.lipsyncWinner,
        ...(body.eliminatedQueenId ? [body.eliminatedQueenId] : []),
      ]);

      const validQueens = await prisma.queen.findMany({
        where: { seasonKey: league.seasonKey, id: { in: Array.from(submittedIds) } },
        select: { id: true },
      });

      if (validQueens.length !== submittedIds.size) {
        return NextResponse.json({ error: "Invalid queen in payload" }, { status: 400 });
      }

      const resultRows = [
        ...body.miniWinners.map((queenId) => ({ type: "mini", queenId })),
        ...body.mainWinners.map((queenId) => ({ type: "main", queenId })),
        { type: "lipsync", queenId: body.lipsyncWinner },
        { type: "elimination", queenId: body.eliminatedQueenId },
      ];

      const episode = await prisma.$transaction(async (tx) => {
        const upserted = await tx.episode.upsert({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          create: { leagueId: league.id, week: weekNum },
          update: {},
          select: { id: true },
        });

        await tx.episodeResult.deleteMany({ where: { episodeId: upserted.id } });
        await tx.episodeResult.createMany({
          data: resultRows.map((r) => ({
            episodeId: upserted.id,
            type: r.type,
            queenId: r.queenId,
          })),
        });

        await recomputeDragRaceWeekScores(tx, league.id, upserted.id);
        return upserted;
      });

      return NextResponse.json({ ok: true, episodeId: episode.id });
    }

    if (league.showType === "SURVIVOR") {
      const body = (await req.json()) as SurvivorWeekPayload;

      if (body.recomputeOnly) {
        const existingEpisode = await prisma.episode.findUnique({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          select: { id: true },
        });

        if (!existingEpisode) {
          return NextResponse.json(
            { error: "No saved results exist for this week yet." },
            { status: 400 }
          );
        }

        await prisma.$transaction(async (tx) => {
          await recomputeSurvivorWeekScores(tx, league.id, existingEpisode.id);
        });
        return NextResponse.json({
          ok: true,
          episodeId: existingEpisode.id,
          message: "Week scores recomputed.",
        });
      }

      if (!Array.isArray(body.results) || body.results.length === 0) {
        return NextResponse.json(
          { error: "At least one castaway result is required." },
          { status: 400 }
        );
      }

      const castawayIdsInPayload = body.results.map((r) => (r.castawayId ?? "").trim());
      if (castawayIdsInPayload.some((idValue) => !idValue)) {
        return NextResponse.json({ error: "castawayId is required for each row." }, { status: 400 });
      }
      if (new Set(castawayIdsInPayload).size !== castawayIdsInPayload.length) {
        return NextResponse.json(
          { error: "Duplicate castaway rows are not allowed." },
          { status: 400 }
        );
      }

      const idsToValidate = new Set<string>(castawayIdsInPayload);
      if (body.bootCastawayId) idsToValidate.add(body.bootCastawayId);
      if (body.secondaryBootCastawayId) idsToValidate.add(body.secondaryBootCastawayId);
      if (body.immunityWinnerCastawayId) idsToValidate.add(body.immunityWinnerCastawayId);
      if (body.secondaryImmunityWinnerCastawayId) {
        idsToValidate.add(body.secondaryImmunityWinnerCastawayId);
      }

      const validCastaways = await prisma.survivorCastaway.findMany({
        where: { leagueId: league.id, id: { in: Array.from(idsToValidate) } },
        select: { id: true },
      });
      if (validCastaways.length !== idsToValidate.size) {
        return NextResponse.json(
          { error: "Payload includes castaway(s) not in this league." },
          { status: 400 }
        );
      }

      const sanitizedResults: Array<{
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

      for (const row of body.results) {
        const individualImmunityWins = parseNonNegativeInt(row.individualImmunityWins);
        const tribeImmunityWins = parseNonNegativeInt(row.tribeImmunityWins);
        const individualRewardWins = parseNonNegativeInt(row.individualRewardWins);
        const advantagesFound = parseNonNegativeInt(row.advantagesFound);
        const idolsPlayedSuccessfully = parseNonNegativeInt(row.idolsPlayedSuccessfully);
        const votesReceived = parseNonNegativeInt(row.votesReceived);
        const confessionalCount = parseNonNegativeInt(row.confessionalCount);

        if (
          individualImmunityWins == null ||
          tribeImmunityWins == null ||
          individualRewardWins == null ||
          advantagesFound == null ||
          idolsPlayedSuccessfully == null ||
          votesReceived == null ||
          confessionalCount == null
        ) {
          return NextResponse.json(
            { error: "Numeric Survivor stats must be non-negative integers." },
            { status: 400 }
          );
        }

        let endgamePlacement: number | null = null;
        if (row.endgamePlacement != null && row.endgamePlacement !== 0) {
          const parsedPlacement = Number(row.endgamePlacement);
          if (!Number.isInteger(parsedPlacement) || parsedPlacement < 1 || parsedPlacement > 20) {
            return NextResponse.json(
              { error: "endgamePlacement must be an integer between 1 and 20." },
              { status: 400 }
            );
          }
          endgamePlacement = parsedPlacement;
        }

        const eliminated = !!row.eliminated;
        const survived = eliminated ? false : !!row.survived;

        sanitizedResults.push({
          castawayId: row.castawayId.trim(),
          survived,
          eliminated,
          individualImmunityWins,
          tribeImmunityWins,
          individualRewardWins,
          advantagesFound,
          idolsPlayedSuccessfully,
          votesReceived,
          confessionalCount,
          confessionalLeader: !!row.confessionalLeader,
          endgamePlacement,
        });
      }

      const eliminatedRows = sanitizedResults.filter((r) => r.eliminated);
      const isDoubleTribalWeek = weekNum === 1;

      if (body.isNonElimination) {
        if (eliminatedRows.length > 0) {
          return NextResponse.json(
            { error: "Non-elimination weeks cannot have eliminated castaways." },
            { status: 400 }
          );
        }
        if (body.bootCastawayId) {
          return NextResponse.json(
            { error: "Non-elimination weeks cannot have a boot castaway." },
            { status: 400 }
          );
        }
        if (body.secondaryBootCastawayId) {
          return NextResponse.json(
            { error: "Non-elimination weeks cannot have a secondary boot castaway." },
            { status: 400 }
          );
        }
      } else {
        if (eliminatedRows.length < 1) {
          return NextResponse.json(
            { error: "At least one castaway must be marked eliminated." },
            { status: 400 }
          );
        }
        if (!body.bootCastawayId) {
          return NextResponse.json(
            { error: "Primary bootCastawayId is required for elimination weeks." },
            { status: 400 }
          );
        }
        if (!eliminatedRows.some((row) => row.castawayId === body.bootCastawayId)) {
          return NextResponse.json(
            { error: "Primary bootCastawayId must match one eliminated castaway row." },
            { status: 400 }
          );
        }
        if (isDoubleTribalWeek) {
          if (!body.secondaryBootCastawayId) {
            return NextResponse.json(
              { error: "Week 1 requires secondaryBootCastawayId (2nd tribal)." },
              { status: 400 }
            );
          }
          if (body.secondaryBootCastawayId === body.bootCastawayId) {
            return NextResponse.json(
              { error: "secondaryBootCastawayId must differ from bootCastawayId." },
              { status: 400 }
            );
          }
          if (
            !eliminatedRows.some((row) => row.castawayId === body.secondaryBootCastawayId)
          ) {
            return NextResponse.json(
              { error: "secondaryBootCastawayId must match one eliminated castaway row." },
              { status: 400 }
            );
          }
          if (!body.secondaryImmunityWinnerCastawayId) {
            return NextResponse.json(
              { error: "Week 1 requires secondaryImmunityWinnerCastawayId (2nd tribal)." },
              { status: 400 }
            );
          }
        } else if (
          body.secondaryBootCastawayId ||
          body.secondaryBootVoteCount != null ||
          body.secondaryImmunityWinnerCastawayId
        ) {
          return NextResponse.json(
            { error: "Secondary tribal fields are only allowed in week 1." },
            { status: 400 }
          );
        }
      }

      const bootVoteCount =
        body.bootVoteCount == null || body.bootVoteCount === 0
          ? null
          : parseNonNegativeInt(body.bootVoteCount);
      if (body.bootVoteCount != null && bootVoteCount == null) {
        return NextResponse.json(
          { error: "bootVoteCount must be a non-negative integer." },
          { status: 400 }
        );
      }
      const secondaryBootVoteCount =
        body.secondaryBootVoteCount == null || body.secondaryBootVoteCount === 0
          ? null
          : parseNonNegativeInt(body.secondaryBootVoteCount);
      if (body.secondaryBootVoteCount != null && secondaryBootVoteCount == null) {
        return NextResponse.json(
          { error: "secondaryBootVoteCount must be a non-negative integer." },
          { status: 400 }
        );
      }
      if (isDoubleTribalWeek && !body.isNonElimination && secondaryBootVoteCount == null) {
        return NextResponse.json(
          { error: "Week 1 requires secondaryBootVoteCount (2nd tribal)." },
          { status: 400 }
        );
      }

      const episode = await prisma.$transaction(async (tx) => {
        const episodeForWeek = await tx.episode.upsert({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          create: { leagueId: league.id, week: weekNum },
          update: {},
          select: { id: true },
        });

        await tx.survivorEpisodeMeta.upsert({
          where: { episodeId: episodeForWeek.id },
          create: {
            leagueId: league.id,
            episodeId: episodeForWeek.id,
            isMerge: !!body.isMerge,
            isNonElimination: !!body.isNonElimination,
            bootCastawayId: body.bootCastawayId || null,
            secondaryBootCastawayId:
              isDoubleTribalWeek && !body.isNonElimination
                ? body.secondaryBootCastawayId || null
                : null,
            bootVoteCount,
            secondaryBootVoteCount:
              isDoubleTribalWeek && !body.isNonElimination ? secondaryBootVoteCount : null,
            immunityWinnerCastawayId: body.immunityWinnerCastawayId || null,
            secondaryImmunityWinnerCastawayId:
              isDoubleTribalWeek && !body.isNonElimination
                ? body.secondaryImmunityWinnerCastawayId || null
                : null,
            lockedAt: new Date(),
          },
          update: {
            isMerge: !!body.isMerge,
            isNonElimination: !!body.isNonElimination,
            bootCastawayId: body.bootCastawayId || null,
            secondaryBootCastawayId:
              isDoubleTribalWeek && !body.isNonElimination
                ? body.secondaryBootCastawayId || null
                : null,
            bootVoteCount,
            secondaryBootVoteCount:
              isDoubleTribalWeek && !body.isNonElimination ? secondaryBootVoteCount : null,
            immunityWinnerCastawayId: body.immunityWinnerCastawayId || null,
            secondaryImmunityWinnerCastawayId:
              isDoubleTribalWeek && !body.isNonElimination
                ? body.secondaryImmunityWinnerCastawayId || null
                : null,
            lockedAt: new Date(),
          },
        });

        await tx.survivorEpisodeCastawayResult.deleteMany({
          where: { episodeId: episodeForWeek.id },
        });
        await tx.survivorEpisodeCastawayResult.createMany({
          data: sanitizedResults.map((row) => ({
            leagueId: league.id,
            episodeId: episodeForWeek.id,
            castawayId: row.castawayId,
            survived: row.survived,
            eliminated: row.eliminated,
            individualImmunityWins: row.individualImmunityWins,
            tribeImmunityWins: row.tribeImmunityWins,
            individualRewardWins: row.individualRewardWins,
            advantagesFound: row.advantagesFound,
            idolsPlayedSuccessfully: row.idolsPlayedSuccessfully,
            votesReceived: row.votesReceived,
            confessionalCount: row.confessionalCount,
            confessionalLeader: row.confessionalLeader,
            endgamePlacement: row.endgamePlacement,
          })),
        });

        await tx.survivorCastaway.updateMany({
          where: { leagueId: league.id },
          data: { totalConfessionals: 0 },
        });

        const confessionalTotals = await tx.survivorEpisodeCastawayResult.groupBy({
          by: ["castawayId"],
          where: { leagueId: league.id },
          _sum: { confessionalCount: true },
        });

        await Promise.all(
          confessionalTotals.map((row) =>
            tx.survivorCastaway.update({
              where: { id: row.castawayId },
              data: { totalConfessionals: row._sum.confessionalCount ?? 0 },
            })
          )
        );

        await recomputeSurvivorWeekScores(tx, league.id, episodeForWeek.id);
        return episodeForWeek;
      });

      return NextResponse.json({
        ok: true,
        episodeId: episode.id,
        message: "Survivor week saved and scores recomputed.",
      });
    }

    return NextResponse.json({ error: "Ruleset not implemented" }, { status: 400 });
  } catch (err) {
    console.error("Week PUT error", err);
    return prismaErrorToResponse(err);
  }
}
