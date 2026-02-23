import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeTraitorsEpisodeScores } from "@/lib/scoring/traitors";

type TraitorsEpisodePayload = {
  hasMurder: boolean;
  hasBanishment: boolean;

  // per-player flags for this episode
  playerResults: Array<{
    playerId: string;
    elimination: "NONE" | "MURDERED" | "BANISHED";
    gotShield: boolean;
    isShowTraitor: boolean;
  }>;

  // optional: open vote windows after saving results
  openMurderVote?: boolean;     // if true, open murder vote for next episode
  openBanishmentVote?: boolean; // if true, open banishment vote for next episode
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
    include: {
      scores: true,
    },
  });

  const traitorsResults = episode
    ? await prisma.traitorsEpisodePlayerResult.findMany({
        where: { episodeId: episode.id },
      })
    : [];

  return NextResponse.json({ episode, traitorsResults });
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
      createdById: true,
      startsAt: true,
      startedAt: true,
    },
  });

  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });

  const isCommissioner = league.createdById === user.id;
  if (!isCommissioner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  if (!hasStarted) return NextResponse.json({ error: "League not started" }, { status: 400 });

  if (league.showType !== "TRAITORS") {
    return NextResponse.json({ error: "Ruleset not implemented" }, { status: 400 });
  }

  const body = (await req.json()) as TraitorsEpisodePayload;

  if (!Array.isArray(body.playerResults)) {
    return NextResponse.json({ error: "playerResults required" }, { status: 400 });
  }

  // Validate that playerIds belong to this league
  const submittedPlayerIds = Array.from(new Set(body.playerResults.map((r) => r.playerId)));
  const validPlayers = await prisma.traitorsPlayer.findMany({
    where: { leagueId: league.id, id: { in: submittedPlayerIds } },
    select: { id: true },
  });
  if (validPlayers.length !== submittedPlayerIds.length) {
    return NextResponse.json({ error: "Invalid player in payload" }, { status: 400 });
  }

  const episode = await prisma.$transaction(async (tx) => {
    const upserted = await tx.episode.upsert({
      where: { leagueId_week: { leagueId: league.id, week: weekNum } },
      create: { leagueId: league.id, week: weekNum },
      update: {},
    });

    // update episode flags
    await tx.episode.update({
      where: { id: upserted.id },
      data: {
        hasMurder: !!body.hasMurder,
        hasBanishment: !!body.hasBanishment,
        lockedAt: new Date(),
      },
    });

    // replace traitors results for this episode
    await tx.traitorsEpisodePlayerResult.deleteMany({ where: { episodeId: upserted.id } });
    await tx.traitorsEpisodePlayerResult.createMany({
      data: body.playerResults.map((r) => ({
        episodeId: upserted.id,
        playerId: r.playerId,
        elimination: r.elimination,
        gotShield: !!r.gotShield,
        isShowTraitor: !!r.isShowTraitor,
      })),
    });

    // Open vote windows for NEXT episode (votes apply to next episode)
    const nextWeek = weekNum + 1;
    const nextEpisode = await tx.episode.upsert({
      where: { leagueId_week: { leagueId: league.id, week: nextWeek } },
      create: { leagueId: league.id, week: nextWeek },
      update: {},
    });

    const oneDayMs = 24 * 60 * 60 * 1000;

    const openMurder = !!body.openMurderVote || !!body.hasMurder;
    const openBanish = !!body.openBanishmentVote || !!body.hasBanishment;

    await tx.episode.update({
      where: { id: upserted.id },
      data: {
        // store vote windows on the episode that just completed (for display),
        // but votes are tied to *this episodeId* as the “cause”
        murderVoteOpensAt: openMurder ? new Date() : null,
        murderVoteClosesAt: openMurder ? new Date(Date.now() + oneDayMs) : null,
        banishmentVoteOpensAt: openBanish ? new Date() : null,
        banishmentVoteClosesAt: openBanish ? new Date(Date.now() + oneDayMs) : null,
      },
    });

    // recompute scores for THIS episode
    await recomputeTraitorsEpisodeScores(tx, league.id, upserted.id);

    // Note: effects from votes will be applied by the vote resolve routes (next step).
    return upserted;
  });

  return NextResponse.json({ ok: true, episodeId: episode.id });
}
