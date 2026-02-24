import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isMissingTableError(err: unknown) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code === "P2021") return true;
  if (err.code !== "P2010") return false;

  const metaText =
    err.meta && typeof err.meta === "object" ? JSON.stringify(err.meta) : "";
  return metaText.includes("does not exist") || metaText.includes("relation");
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id || id === "undefined") {
    return NextResponse.json({ error: "Invalid league id" }, { status: 400 });
  }

  // Simple MVP authorization: only the creator can delete
  const league = await prisma.league.findUnique({
    where: { id },
    select: { id: true, createdById: true, name: true },
  });

  if (!league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  if (league.createdById !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const optionalCleanup = async (op: () => Promise<unknown>) => {
      try {
        await op();
      } catch (err) {
        if (isMissingTableError(err)) return;
        throw err;
      }
    };

    // Some child tables reference castaway/player rows with RESTRICT constraints.
    // Delete those dependents first so league deletion is deterministic.
    await optionalCleanup(() =>
      prisma.$executeRaw`
        DELETE FROM "SurvivorBootOrderItem"
        WHERE "submissionId" IN (
          SELECT "id" FROM "SurvivorBootOrderSubmission" WHERE "leagueId" = ${id}
        )
        OR "castawayId" IN (
          SELECT "id" FROM "SurvivorCastaway" WHERE "leagueId" = ${id}
        )
      `
    );

    await optionalCleanup(() =>
      prisma.survivorBootOrderSubmission.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.survivorDraftPick.deleteMany({
        where: {
          draft: { leagueId: id },
        },
      })
    );

    await optionalCleanup(() =>
      prisma.survivorEpisodeCastawayResult.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.traitorsEntryPick.deleteMany({
        where: {
          entry: { leagueId: id },
        },
      })
    );

    await optionalCleanup(() =>
      prisma.leagueMessage.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.traitorsEpisodePlayerResult.deleteMany({
        where: {
          episode: { leagueId: id },
        },
      })
    );

    await optionalCleanup(() =>
      prisma.traitorsVote.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.memberEffect.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.traitorsFantasyRolePeriod.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.traitorsPlayer.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.episodeResult.deleteMany({
        where: { episode: { leagueId: id } },
      })
    );

    await optionalCleanup(() =>
      prisma.episodeFinalePlacement.deleteMany({
        where: { episode: { leagueId: id } },
      })
    );

    await optionalCleanup(() =>
      prisma.episodeFinaleExtra.deleteMany({
        where: { episode: { leagueId: id } },
      })
    );

    await optionalCleanup(() =>
      prisma.episode.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.leagueEntry.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.leagueMember.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.leagueInvite.deleteMany({
        where: { leagueId: id },
      })
    );

    await optionalCleanup(() =>
      prisma.survivorCastaway.deleteMany({
        where: { leagueId: id },
      })
    );

    await prisma.league.delete({ where: { id } });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      const details =
        err.meta && typeof err.meta === "object" ? JSON.stringify(err.meta) : null;
      return NextResponse.json(
        {
          error: details
            ? `League delete is blocked by related records (${details}).`
            : "League delete is blocked by related records.",
          prismaCode: err.code,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to delete league." }, { status: 500 });
  }
}
