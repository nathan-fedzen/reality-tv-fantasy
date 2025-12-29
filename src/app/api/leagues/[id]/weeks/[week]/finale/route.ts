import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { recomputeDragRaceWeekScores } from "@/lib/scoring/drag-race";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string; week: string }> }
) {
  const { id: leagueId, week } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Not authenticated", 401);

  const weekNum = Number(week);
  if (!Number.isInteger(weekNum) || weekNum < 1) return jsonError("Invalid week", 400);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, createdById: true },
  });
  if (!league) return jsonError("League not found", 404);
  if (league.createdById !== user.id) return jsonError("Forbidden", 403);

  // Upsert episode and mark as finale
  await prisma.episode.upsert({
    where: { leagueId_week: { leagueId, week: weekNum } },
    create: { leagueId, week: weekNum, episodeType: "FINALE" },
    update: { episodeType: "FINALE" },
  });

  return NextResponse.json({ ok: true });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; week: string }> }
) {
  const { id: leagueId, week } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return jsonError("Not authenticated", 401);

  const weekNum = Number(week);
  if (!Number.isInteger(weekNum) || weekNum < 1) return jsonError("Invalid week", 400);

  const body = await req.json().catch(() => null);
  if (!body) return jsonError("Missing JSON body", 400);

  const { placements, extras, finalize } = body as {
    placements: Array<{ queenId: string; place: number }>;
    extras: Array<{ queenId: string; miniWins: number; mainWins: number; lipsyncWins: number }>;
    finalize?: boolean;
  };

  if (!Array.isArray(placements) || placements.length !== 4) {
    return jsonError("placements must be an array of 4 items", 400);
  }

  // validate places 1..4 and unique queens
  const places = placements.map((p) => p.place).sort((a, b) => a - b);
  const expected = [1, 2, 3, 4];
  if (places.join(",") !== expected.join(",")) return jsonError("places must be 1,2,3,4", 400);

  const queenIds = placements.map((p) => p.queenId);
  if (new Set(queenIds).size !== 4) return jsonError("placements must have 4 different queens", 400);

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, createdById: true, showType: true },
  });
  if (!league) return jsonError("League not found", 404);
  if (league.createdById !== user.id) return jsonError("Forbidden", 403);
  if (league.showType !== "DRAG_RACE") return jsonError("Finale is only supported for Drag Race right now", 400);

  const episode = await prisma.episode.findUnique({
    where: { leagueId_week: { leagueId, week: weekNum } },
    select: { id: true, episodeType: true },
  });
  if (!episode) return jsonError("Episode not found. Convert to finale first.", 404);
  if (episode.episodeType !== "FINALE") return jsonError("Episode is not marked as FINALE", 400);

  await prisma.$transaction(async (tx) => {
    // wipe existing
    await tx.episodeFinalePlacement.deleteMany({ where: { episodeId: episode.id } });
    await tx.episodeFinaleExtra.deleteMany({ where: { episodeId: episode.id } });

    // placements
    await tx.episodeFinalePlacement.createMany({
      data: placements.map((p) => ({
        episodeId: episode.id,
        queenId: p.queenId,
        place: p.place,
      })),
    });

    // extras (optional; allow missing entries)
    if (Array.isArray(extras) && extras.length > 0) {
      await tx.episodeFinaleExtra.createMany({
        data: extras.map((e) => ({
          episodeId: episode.id,
          queenId: e.queenId,
          miniWins: Math.max(0, Number(e.miniWins || 0)),
          mainWins: Math.max(0, Number(e.mainWins || 0)),
          lipsyncWins: Math.max(0, Number(e.lipsyncWins || 0)),
        })),
      });
    }

    // recompute this week's scores using your finale-aware scoring function
    await recomputeDragRaceWeekScores(tx as any, leagueId, episode.id);

    // optionally complete the season
    if (finalize) {
      await tx.league.update({
        where: { id: leagueId },
        data: { status: "COMPLETE" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
