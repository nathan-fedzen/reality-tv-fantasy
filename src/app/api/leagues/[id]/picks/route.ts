// src/app/api/leagues/[id]/picks/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { RPDR_S18 } from "@/lib/drag-race/s18";

// Store as strings for Prisma Decimal(3,1) safety (e.g. "2.5")
const SLOT_MULTIPLIERS: Record<number, string> = Object.fromEntries(
  RPDR_S18.multipliers.map((m) => [m.slot, m.value.toFixed(1)])
);

function getRevealAllowed(league: {
  startsAt: Date | null;
  startedAt: Date | null;
}) {
  const now = new Date();
  if (league.startedAt) return true;
  if (!league.startsAt) return false; // if missing, default to hidden
  return now >= league.startsAt;
}

function getCanEdit(league: {
  startsAt: Date | null;
  submissionDeadline: Date | null;
  startedAt: Date | null;
}) {
  const now = new Date();

  // If timing not configured, treat as locked
  if (!league.submissionDeadline || !league.startsAt) return false;

  // Lock if deadline passed OR league started early OR premiere reached
  return (
    now < league.submissionDeadline &&
    !league.startedAt &&
    now < league.startsAt
  );
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
      createdById: true,
      seasonKey: true,
      startsAt: true,
      submissionDeadline: true,
      startedAt: true,
    },
  });

  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });

  // If seasonKey isn't configured, don't crash on queen lookup; return empty queens.
  const queens = league.seasonKey
    ? await prisma.queen.findMany({
        where: { seasonKey: league.seasonKey },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const revealAllowed = getRevealAllowed(league);
  const isCommissioner = user.id === league.createdById;

  // Always return current user's entry (create if missing)
  const myEntry = await prisma.leagueEntry.upsert({
    where: { leagueId_userId: { leagueId, userId: user.id } },
    create: { leagueId, userId: user.id },
    update: {},
    select: {
      id: true,
      userId: true,
      picks: { select: { slot: true, queenId: true, multiplier: true } },
    },
  });

  // Only commissioner OR reveal can see all entries
  let entries: Array<{
    userId: string;
    picks: Array<{ slot: number; queenId: string; multiplier: any }>;
  }> = [];

  if (isCommissioner || revealAllowed) {
    entries = await prisma.leagueEntry.findMany({
      where: { leagueId },
      select: {
        userId: true,
        picks: { select: { slot: true, queenId: true, multiplier: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  return NextResponse.json({
    league: {
      id: league.id,
      seasonKey: league.seasonKey,
      startsAt: league.startsAt,
      submissionDeadline: league.submissionDeadline,
      startedAt: league.startedAt,
      revealAllowed,
      canEdit: getCanEdit(league),
      isCommissioner,
    },
    queens,
    myEntry,
    entries, // empty for non-commissioner pre-reveal
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      createdById: true,
      seasonKey: true,
      startsAt: true,
      submissionDeadline: true,
      startedAt: true,
    },
  });

  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });

  // DRAG_RACE leagues should have these, but schema allows null -> enforce.
  if (!league.seasonKey || !league.startsAt || !league.submissionDeadline) {
    return NextResponse.json(
      { error: "League timing is not configured." },
      { status: 400 }
    );
  }

  if (!getCanEdit(league)) {
    return NextResponse.json({ error: "Picks are locked." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const picks = body?.picks as Array<{ slot: number; queenId: string }> | undefined;

  if (!Array.isArray(picks) || picks.length !== 4) {
    return NextResponse.json({ error: "Expected exactly 4 picks." }, { status: 400 });
  }

  // Validate slots 1-4 and uniqueness
  const slots = picks.map((p) => p.slot);
  const queenIds = picks.map((p) => p.queenId);

  const validSlots = [1, 2, 3, 4];
  const slotsOk = slots.length === 4 && validSlots.every((s) => slots.includes(s));

  const uniqueSlots = new Set(slots).size === 4;
  const uniqueQueens = new Set(queenIds).size === 4;

  if (!slotsOk || !uniqueSlots) {
    return NextResponse.json({ error: "Slots must be 1,2,3,4 (unique)." }, { status: 400 });
  }
  if (!uniqueQueens) {
    return NextResponse.json({ error: "Queens must be unique across slots." }, { status: 400 });
  }

  // Ensure slot -> multiplier exists (defensive)
  for (const p of picks) {
    if (!SLOT_MULTIPLIERS[p.slot]) {
      return NextResponse.json({ error: `Invalid slot: ${p.slot}` }, { status: 400 });
    }
  }

  // Ensure queens belong to this season
  const seasonQueens = await prisma.queen.findMany({
    where: { seasonKey: league.seasonKey, id: { in: queenIds } },
    select: { id: true },
  });

  if (seasonQueens.length !== 4) {
    return NextResponse.json({ error: "One or more queens are invalid for this season." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.leagueEntry.upsert({
      where: { leagueId_userId: { leagueId, userId: user.id } },
      create: { leagueId, userId: user.id },
      update: {},
      select: { id: true },
    });

    // Replace picks atomically
    await tx.leagueEntryPick.deleteMany({ where: { entryId: entry.id } });

    await tx.leagueEntryPick.createMany({
      data: picks.map((p) => ({
        entryId: entry.id,
        slot: p.slot,
        queenId: p.queenId,
        multiplier: SLOT_MULTIPLIERS[p.slot], // REQUIRED by schema
      })),
    });

    const updated = await tx.leagueEntry.findUnique({
      where: { id: entry.id },
      select: {
        id: true,
        userId: true,
        picks: { select: { slot: true, queenId: true, multiplier: true } },
      },
    });

    return updated;
  });

  return NextResponse.json({ ok: true, entry: result });
}
