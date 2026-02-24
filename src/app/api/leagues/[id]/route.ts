import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    await prisma.$transaction(async (tx) => {
      // Some child tables reference castaway/player rows with RESTRICT constraints.
      // Delete those dependents first so league deletion is deterministic.
      await tx.survivorBootOrderItem.deleteMany({
        where: {
          OR: [
            { submission: { leagueId: id } },
            { castaway: { leagueId: id } },
          ],
        },
      });

      await tx.survivorDraftPick.deleteMany({
        where: {
          draft: { leagueId: id },
        },
      });

      await tx.survivorEpisodeCastawayResult.deleteMany({
        where: { leagueId: id },
      });

      await tx.traitorsEntryPick.deleteMany({
        where: {
          entry: { leagueId: id },
        },
      });

      await tx.league.delete({ where: { id } });
    });

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
