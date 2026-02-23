import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPickInRound,
  getRoundForOverallPick,
  getSnakeSeatForOverallPick,
} from "@/lib/survivor/draft-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function displayName(user: {
  displayName: string | null;
  name: string | null;
  email: string | null;
}) {
  return user.displayName ?? user.name ?? user.email ?? "Unknown";
}

export async function GET(
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
      name: true,
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

  const [memberCount, castaways, draft] = await Promise.all([
    prisma.leagueMember.count({ where: { leagueId } }),
    prisma.survivorCastaway.findMany({
      where: { leagueId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, tribe: true },
    }),
    prisma.survivorDraft.findUnique({
      where: { leagueId },
      select: {
        id: true,
        status: true,
        picksPerEntry: true,
        totalRounds: true,
        totalPicks: true,
        currentOverallPick: true,
        startedAt: true,
        completedAt: true,
        seats: {
          orderBy: { seat: "asc" },
          select: {
            seat: true,
            leagueEntryId: true,
            leagueEntry: {
              select: {
                userId: true,
                user: {
                  select: { displayName: true, name: true, email: true },
                },
              },
            },
          },
        },
        picks: {
          orderBy: { overallPick: "asc" },
          select: {
            overallPick: true,
            round: true,
            pickInRound: true,
            castawayId: true,
            castaway: { select: { id: true, name: true, tribe: true } },
            leagueEntry: {
              select: {
                userId: true,
                user: {
                  select: { displayName: true, name: true, email: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);

  const isCommissioner = user.id === league.createdById;
  const castawayCount = castaways.length;
  const draftStatus = draft?.status ?? "NOT_STARTED";

  const canSplitEvenly = memberCount > 0 && castawayCount % memberCount === 0;
  const computedPicksPerEntry = canSplitEvenly ? castawayCount / memberCount : null;

  const startIssues: string[] = [];
  if (!isCommissioner) startIssues.push("Only the commissioner can start the draft.");
  if (memberCount < 2) startIssues.push("At least 2 league members are required.");
  if (castawayCount === 0) startIssues.push("No castaways are seeded for this league.");
  if (!canSplitEvenly) {
    startIssues.push("Cast count must divide evenly across members for equal picks.");
  }
  if (draftStatus !== "NOT_STARTED") {
    startIssues.push("Draft has already started.");
  }

  const draftedByCastaway = new Map(
    (draft?.picks ?? []).map((pick) => [
      pick.castawayId,
      {
        overallPick: pick.overallPick,
        round: pick.round,
        pickInRound: pick.pickInRound,
        userId: pick.leagueEntry.userId,
        displayName: displayName(pick.leagueEntry.user),
      },
    ])
  );

  const seats = draft?.seats ?? [];
  let currentTurn:
    | {
        overallPick: number;
        round: number;
        pickInRound: number;
        seat: number;
        userId: string;
        displayName: string;
      }
    | null = null;

  if (
    draft &&
    draft.status === "IN_PROGRESS" &&
    draft.currentOverallPick &&
    seats.length > 0
  ) {
    const seatNumber = getSnakeSeatForOverallPick(
      seats.length,
      draft.currentOverallPick
    );
    const seat = seats.find((s) => s.seat === seatNumber) ?? null;

    if (seat) {
      currentTurn = {
        overallPick: draft.currentOverallPick,
        round: getRoundForOverallPick(seats.length, draft.currentOverallPick),
        pickInRound: getPickInRound(seats.length, draft.currentOverallPick),
        seat: seatNumber,
        userId: seat.leagueEntry.userId,
        displayName: displayName(seat.leagueEntry.user),
      };
    }
  }

  return NextResponse.json({
    league: {
      id: league.id,
      name: league.name,
    },
    viewer: {
      userId: user.id,
      isCommissioner,
    },
    startChecks: {
      canStart: startIssues.length === 0,
      issues: startIssues,
      memberCount,
      castawayCount,
      picksPerEntry: computedPicksPerEntry,
    },
    draft: {
      id: draft?.id ?? null,
      status: draftStatus,
      picksPerEntry: draft?.picksPerEntry ?? computedPicksPerEntry,
      totalRounds: draft?.totalRounds ?? computedPicksPerEntry,
      totalPicks: draft?.totalPicks ?? castawayCount,
      currentOverallPick: draft?.currentOverallPick ?? null,
      startedAt: draft?.startedAt ?? null,
      completedAt: draft?.completedAt ?? null,
      seats: seats.map((seat) => ({
        seat: seat.seat,
        userId: seat.leagueEntry.userId,
        displayName: displayName(seat.leagueEntry.user),
      })),
      currentTurn,
      isMyTurn: currentTurn?.userId === user.id,
      picks: (draft?.picks ?? []).map((pick) => ({
        overallPick: pick.overallPick,
        round: pick.round,
        pickInRound: pick.pickInRound,
        castawayId: pick.castawayId,
        castawayName: pick.castaway.name,
        castawayTribe: pick.castaway.tribe,
        userId: pick.leagueEntry.userId,
        displayName: displayName(pick.leagueEntry.user),
      })),
    },
    castaways: castaways.map((castaway) => ({
      id: castaway.id,
      name: castaway.name,
      tribe: castaway.tribe,
      draftedBy: draftedByCastaway.get(castaway.id) ?? null,
    })),
  });
}
