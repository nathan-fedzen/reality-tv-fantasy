import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeagueVisibility, ShowType } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { RPDR_S18 } from "@/lib/drag-race/s18";
import { SURVIVOR_50 } from "@/lib/survivor/s50";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateLeagueBody = {
  name: string;
  showType: ShowType;
  visibility: LeagueVisibility;
  maxPlayers: number;
};

async function seedDragRaceSeason() {
  // Idempotent: relies on @@unique([seasonKey, name]) on Queen
  await Promise.all(
    RPDR_S18.queens.map((q) =>
      prisma.queen.upsert({
        where: {
          seasonKey_name: {
            seasonKey: RPDR_S18.seasonKey,
            name: q.name,
          },
        },
        update: {},
        create: {
          seasonKey: RPDR_S18.seasonKey,
          name: q.name,
        },
      })
    )
  );
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateLeagueBody;
  try {
    body = (await req.json()) as CreateLeagueBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  const maxPlayers = Number(body.maxPlayers);

  if (!name) {
    return NextResponse.json({ error: "League name is required" }, { status: 400 });
  }
  if (!Object.values(ShowType).includes(body.showType)) {
    return NextResponse.json({ error: "Invalid showType" }, { status: 400 });
  }
  if (!Object.values(LeagueVisibility).includes(body.visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 50) {
    return NextResponse.json({ error: "maxPlayers must be between 2 and 50" }, { status: 400 });
  }
  if (body.showType === "SURVIVOR" && maxPlayers > 8) {
    return NextResponse.json(
      { error: "Survivor leagues support between 2 and 8 players." },
      { status: 400 }
    );
  }

  // Drag Race auto-config
  let seasonKey: string | undefined = undefined;
  let startsAt: Date | undefined = undefined;
  let submissionDeadline: Date | undefined = undefined;

  if (body.showType === "DRAG_RACE") {
    seasonKey = RPDR_S18.seasonKey;
    startsAt = new Date(RPDR_S18.premiereEtIso);
    submissionDeadline = new Date(RPDR_S18.premiereEtIso);

    // Make sure queens exist for this season
    await seedDragRaceSeason();
  }

  if (body.showType === "SURVIVOR") {
    seasonKey = SURVIVOR_50.seasonKey;
  }

  const token = uuidv4();

  const result = await prisma.$transaction(async (tx) => {
    const league = await tx.league.create({
      data: {
        name,
        showType: body.showType,
        visibility: body.visibility,
        maxPlayers,
        createdById: user.id,

        // These are only relevant for DRAG_RACE (safe to pass undefined otherwise)
        seasonKey,
        startsAt,
        submissionDeadline,

        members: {
          create: {
            userId: user.id,
            role: "COMMISSIONER",
          },
        },
      },
      select: { id: true },
    });

    if (body.showType === "SURVIVOR") {
      await tx.survivorCastaway.createMany({
        data: SURVIVOR_50.castaways.map((castaway) => ({
          leagueId: league.id,
          name: castaway.name,
          tribe: castaway.tribe,
        })),
        skipDuplicates: true,
      });
    }

    const invite = await tx.leagueInvite.create({
      data: {
        leagueId: league.id,
        token,
        isActive: true,
      },
      select: { token: true },
    });

    return { leagueId: league.id, inviteToken: invite.token };
  });

  return NextResponse.json({ id: result.leagueId, inviteToken: result.inviteToken }, { status: 201 });
}
