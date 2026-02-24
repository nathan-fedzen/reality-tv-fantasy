import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type UseAdvantagePayload = {
  week: number;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; advantageId: string }> }
) {
  const { id: leagueId, advantageId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: UseAdvantagePayload;
  try {
    body = (await req.json()) as UseAdvantagePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const week = Number(body.week);
  if (!Number.isInteger(week) || week < 1) {
    return NextResponse.json({ error: "week must be a positive integer." }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      showType: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json({ error: "Survivor-only route." }, { status: 400 });
  }
  if (league.members.length === 0) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const advantage = await tx.survivorOwnedAdvantage.findFirst({
        where: {
          id: advantageId,
          leagueId,
          leagueEntry: { userId: user.id },
        },
        select: {
          id: true,
          advantageType: true,
          status: true,
          lastAppliedEpisodeId: true,
        },
      });
      if (!advantage) throw new Error("ADVANTAGE_NOT_FOUND");
      if (advantage.status !== "ACTIVE") throw new Error("ADVANTAGE_NOT_ACTIVE");

      const episode = await tx.episode.upsert({
        where: { leagueId_week: { leagueId, week } },
        create: { leagueId, week },
        update: {},
        select: { id: true },
      });

      if (advantage.lastAppliedEpisodeId === episode.id) {
        throw new Error("ALREADY_APPLIED_TO_WEEK");
      }

      const updated = await tx.survivorOwnedAdvantage.update({
        where: { id: advantage.id },
        data: {
          status: "USED",
          usedAt: new Date(),
          lastAppliedEpisodeId: episode.id,
          effectConfig: {
            kind: advantage.advantageType,
            week,
          },
        },
        select: {
          id: true,
          advantageType: true,
          status: true,
          usedAt: true,
          lastAppliedEpisodeId: true,
        },
      });

      return updated;
    });

    return NextResponse.json({
      ok: true,
      advantage: result,
      message: "Advantage applied to this week.",
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "ADVANTAGE_NOT_FOUND":
          return NextResponse.json({ error: "Advantage not found." }, { status: 404 });
        case "ADVANTAGE_NOT_ACTIVE":
          return NextResponse.json({ error: "Advantage is not active." }, { status: 400 });
        case "ALREADY_APPLIED_TO_WEEK":
          return NextResponse.json(
            { error: "Advantage already applied to this week." },
            { status: 400 }
          );
        default:
          break;
      }
    }

    return NextResponse.json({ error: "Failed to use advantage." }, { status: 500 });
  }
}

