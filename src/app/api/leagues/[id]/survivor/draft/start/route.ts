import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    },
  });

  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json(
      { error: "Draft room is only available for Survivor leagues." },
      { status: 400 }
    );
  }
  if (league.createdById !== user.id) {
    return NextResponse.json(
      { error: "Only the commissioner can start the draft." },
      { status: 403 }
    );
  }

  const [castawayCount, members] = await Promise.all([
    prisma.survivorCastaway.count({ where: { leagueId } }),
    prisma.leagueMember.findMany({
      where: { leagueId },
      orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      select: { userId: true },
    }),
  ]);

  if (castawayCount === 0) {
    return NextResponse.json(
      { error: "No castaways are seeded for this league." },
      { status: 400 }
    );
  }
  if (members.length < 2) {
    return NextResponse.json(
      { error: "At least 2 league members are required to start draft." },
      { status: 400 }
    );
  }
  if (members.length > 8) {
    return NextResponse.json(
      {
        error: "Survivor draft supports between 2 and 8 league members.",
      },
      { status: 400 }
    );
  }

  const picksPerEntry = Math.floor(castawayCount / members.length);
  if (picksPerEntry < 1) {
    return NextResponse.json(
      { error: "Not enough castaways to give each player at least one pick." },
      { status: 400 }
    );
  }
  const totalRounds = picksPerEntry;
  const totalPicks = picksPerEntry * members.length;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const draft = await tx.survivorDraft.upsert({
        where: { leagueId },
        update: {},
        create: { leagueId },
        select: { id: true, status: true },
      });

      if (draft.status !== "NOT_STARTED") {
        throw new Error("DRAFT_ALREADY_STARTED");
      }

      const orderedEntries: Array<{ id: string; userId: string }> = [];
      for (const member of members) {
        const entry = await tx.leagueEntry.upsert({
          where: { leagueId_userId: { leagueId, userId: member.userId } },
          create: { leagueId, userId: member.userId },
          update: {},
          select: { id: true, userId: true },
        });
        orderedEntries.push(entry);
      }

      await tx.survivorDraftPick.deleteMany({
        where: { draftId: draft.id },
      });
      await tx.survivorDraftSeat.deleteMany({
        where: { draftId: draft.id },
      });

      await tx.survivorDraftSeat.createMany({
        data: orderedEntries.map((entry, index) => ({
          draftId: draft.id,
          leagueEntryId: entry.id,
          seat: index + 1,
        })),
      });

      const updatedDraft = await tx.survivorDraft.update({
        where: { id: draft.id },
        data: {
          status: "IN_PROGRESS",
          picksPerEntry,
          totalRounds,
          totalPicks,
          currentOverallPick: 1,
          startedAt: new Date(),
          completedAt: null,
        },
        select: {
          id: true,
          status: true,
          picksPerEntry: true,
          totalRounds: true,
          totalPicks: true,
          currentOverallPick: true,
        },
      });

      return updatedDraft;
    });

    return NextResponse.json({ ok: true, draft: result });
  } catch (err) {
    if (err instanceof Error && err.message === "DRAFT_ALREADY_STARTED") {
      return NextResponse.json({ error: "Draft has already started." }, { status: 409 });
    }

    console.error("Failed to start Survivor draft", err);
    return NextResponse.json({ error: "Failed to start draft." }, { status: 500 });
  }
}
