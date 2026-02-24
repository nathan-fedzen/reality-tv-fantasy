import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      showType: true,
      createdById: true,
      survivorAuctionActivatedAt: true,
    },
  });

  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json({ error: "Survivor-only route." }, { status: 400 });
  }
  if (league.createdById !== user.id) {
    return NextResponse.json({ error: "Only commissioner can activate auction." }, { status: 403 });
  }

  if (league.survivorAuctionActivatedAt) {
    return NextResponse.json({
      ok: true,
      activatedAt: league.survivorAuctionActivatedAt,
      alreadyActive: true,
    });
  }

  const updated = await prisma.league.update({
    where: { id: league.id },
    data: { survivorAuctionActivatedAt: new Date() },
    select: { survivorAuctionActivatedAt: true },
  });

  return NextResponse.json({
    ok: true,
    activatedAt: updated.survivorAuctionActivatedAt,
    alreadyActive: false,
  });
}
