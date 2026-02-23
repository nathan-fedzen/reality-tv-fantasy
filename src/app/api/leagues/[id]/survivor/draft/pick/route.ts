import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getPickInRound,
  getRoundForOverallPick,
  getSnakeSeatForOverallPick,
} from "@/lib/survivor/draft-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PickBody = {
  castawayId: string;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PickBody;
  try {
    body = (await req.json()) as PickBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const castawayId = (body.castawayId ?? "").trim();
  if (!castawayId) {
    return NextResponse.json({ error: "castawayId is required." }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, showType: true },
  });

  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json(
      { error: "Draft room is only available for Survivor leagues." },
      { status: 400 }
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const draft = await tx.survivorDraft.findUnique({
        where: { leagueId },
        select: {
          id: true,
          status: true,
          currentOverallPick: true,
          totalPicks: true,
          picksPerEntry: true,
          seats: {
            orderBy: { seat: "asc" },
            select: {
              seat: true,
              leagueEntryId: true,
              leagueEntry: { select: { userId: true } },
            },
          },
        },
      });

      if (!draft || draft.status !== "IN_PROGRESS" || !draft.currentOverallPick) {
        throw new Error("DRAFT_NOT_ACTIVE");
      }
      if (draft.seats.length === 0) {
        throw new Error("DRAFT_HAS_NO_SEATS");
      }

      const totalPicks =
        draft.totalPicks ?? draft.seats.length * (draft.picksPerEntry ?? 0);
      if (totalPicks <= 0) throw new Error("DRAFT_TOTAL_PICKS_INVALID");

      const currentOverallPick = draft.currentOverallPick;
      const seatNumber = getSnakeSeatForOverallPick(
        draft.seats.length,
        currentOverallPick
      );
      const currentSeat = draft.seats.find((seat) => seat.seat === seatNumber) ?? null;
      if (!currentSeat) throw new Error("CURRENT_SEAT_NOT_FOUND");

      if (currentSeat.leagueEntry.userId !== user.id) {
        throw new Error("NOT_YOUR_TURN");
      }

      const castaway = await tx.survivorCastaway.findFirst({
        where: { id: castawayId, leagueId },
        select: { id: true },
      });
      if (!castaway) throw new Error("INVALID_CASTAWAY");

      const round = getRoundForOverallPick(draft.seats.length, currentOverallPick);
      const pickInRound = getPickInRound(draft.seats.length, currentOverallPick);

      await tx.survivorDraftPick.create({
        data: {
          draftId: draft.id,
          leagueEntryId: currentSeat.leagueEntryId,
          castawayId: castaway.id,
          round,
          overallPick: currentOverallPick,
          pickInRound,
        },
      });

      const isLastPick = currentOverallPick >= totalPicks;
      const updatedDraft = await tx.survivorDraft.update({
        where: { id: draft.id },
        data: isLastPick
          ? {
              status: "COMPLETE",
              currentOverallPick: null,
              completedAt: new Date(),
            }
          : {
              currentOverallPick: currentOverallPick + 1,
            },
        select: {
          id: true,
          status: true,
          currentOverallPick: true,
          completedAt: true,
        },
      });

      return {
        draft: updatedDraft,
        pick: {
          castawayId: castaway.id,
          round,
          overallPick: currentOverallPick,
          pickInRound,
          seat: seatNumber,
        },
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return NextResponse.json(
          {
            error:
              "This pick conflicts with an existing pick. Refresh and try again.",
          },
          { status: 409 }
        );
      }
    }

    if (err instanceof Error) {
      switch (err.message) {
        case "DRAFT_NOT_ACTIVE":
          return NextResponse.json({ error: "Draft is not active." }, { status: 400 });
        case "NOT_YOUR_TURN":
          return NextResponse.json({ error: "It is not your turn." }, { status: 403 });
        case "INVALID_CASTAWAY":
          return NextResponse.json(
            { error: "Castaway is not valid for this league." },
            { status: 400 }
          );
        default:
          break;
      }
    }

    console.error("Failed to submit Survivor draft pick", err);
    return NextResponse.json({ error: "Failed to submit draft pick." }, { status: 500 });
  }
}
