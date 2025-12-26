import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeDragRaceWeekScores } from "@/lib/scoring/drag-race";

type DragRaceWeekPayload = {
  miniWinners: string[]; // queenIds
  mainWinners: string[]; // queenIds
  lipsyncWinner: string; // queenId
  eliminatedQueenId: string | null; // null = no elimination
};

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

  const episode = await prisma.episode.findUnique({
    where: { leagueId_week: { leagueId: id, week: weekNum } },
    include: { results: true },
  });

  return NextResponse.json({ episode });
}

export async function PUT(
  req: Request,
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

  if (league.showType !== "DRAG_RACE") {
    return NextResponse.json({ error: "Ruleset not implemented" }, { status: 400 });
  }

  const body = (await req.json()) as DragRaceWeekPayload;

  // Basic validation (MVP)
  if (!Array.isArray(body.miniWinners) || body.miniWinners.length < 1) {
    return NextResponse.json({ error: "Mini winners required" }, { status: 400 });
  }
  if (!Array.isArray(body.mainWinners) || body.mainWinners.length < 1) {
    return NextResponse.json({ error: "Main winners required" }, { status: 400 });
  }
  if (!body.lipsyncWinner) {
    return NextResponse.json({ error: "Lip sync winner required" }, { status: 400 });
  }

  // Ensure submitted queenIds belong to season (server enforcement)
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
    { type: "elimination", queenId: body.eliminatedQueenId }, // null allowed
  ];

  const episode = await prisma.$transaction(async (tx) => {
    const upserted = await tx.episode.upsert({
      where: { leagueId_week: { leagueId: league.id, week: weekNum } },
      create: { leagueId: league.id, week: weekNum },
      update: {},
    });

    await tx.episodeResult.deleteMany({ where: { episodeId: upserted.id } });
    await tx.episodeResult.createMany({
      data: resultRows.map((r) => ({
        episodeId: upserted.id,
        type: r.type,
        queenId: r.queenId,
      })),
    });

    // recompute scores for this week
    await recomputeDragRaceWeekScores(tx, league.id, upserted.id);

    return upserted;
  });

  return NextResponse.json({ ok: true, episodeId: episode.id });
}
