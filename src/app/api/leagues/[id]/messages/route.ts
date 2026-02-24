import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendWebPushToUsers } from "@/lib/notifications/web-push";

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

function forbidden(error = "Forbidden") {
  return NextResponse.json({ error }, { status: 403 });
}

function schemaNotReady() {
  return NextResponse.json(
    {
      error:
        "League chat is not ready in this environment yet. Run `npx prisma migrate deploy` and redeploy.",
    },
    { status: 503 }
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leagueId } = await params;
    if (!leagueId) return badRequest("Invalid league id.");

    const membership = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (!membership) return forbidden();

    const url = new URL(req.url);
    const limitRaw = Number(url.searchParams.get("limit") ?? 60);
    const limit = Number.isInteger(limitRaw)
      ? Math.max(1, Math.min(200, limitRaw))
      : 60;

    const messages = await prisma.leagueMessage.findMany({
      where: {
        leagueId,
        channel: "GENERAL",
        episodeId: null,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorMemberId: true,
        author: {
          select: {
            userId: true,
            user: {
              select: {
                displayName: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      messages: messages.reverse().map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        authorMemberId: message.authorMemberId,
        authorUserId: message.author.userId,
        authorName:
          message.author.user.displayName ??
          message.author.user.name ??
          message.author.user.email ??
          "Player",
      })),
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      return schemaNotReady();
    }
    return NextResponse.json({ error: "Failed to load chat." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: leagueId } = await params;
    if (!leagueId) return badRequest("Invalid league id.");

    const membership = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    if (!membership) return forbidden();

    const json = (await req.json().catch(() => null)) as
      | { body?: string }
      | null;
    const body = (json?.body ?? "").trim();

    if (!body) return badRequest("Message cannot be empty.");
    if (body.length > 1000) {
      return badRequest("Message is too long (max 1000 characters).");
    }

    const created = await prisma.leagueMessage.create({
      data: {
        leagueId,
        authorMemberId: membership.id,
        channel: "GENERAL",
        body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorMemberId: true,
      },
    });

    const authorName = user.displayName ?? user.name ?? user.email ?? "Player";
    const bodyPreview = body.length > 120 ? `${body.slice(0, 120)}...` : body;

    try {
      const leagueRecipients = await prisma.league.findUnique({
        where: { id: leagueId },
        select: {
          name: true,
          members: {
            where: { userId: { not: user.id } },
            select: { userId: true },
          },
        },
      });

      const recipientIds = Array.from(
        new Set((leagueRecipients?.members ?? []).map((member) => member.userId))
      );

      if (recipientIds.length > 0) {
        await sendWebPushToUsers({
          userIds: recipientIds,
          payload: {
            title: `${leagueRecipients?.name ?? "League"} chat`,
            body: `${authorName}: ${bodyPreview}`,
            url: `/leagues/${leagueId}`,
            tag: `league-chat-${leagueId}`,
          },
        });
      }
    } catch {
      // Keep chat posting resilient even if push delivery fails.
    }

    return NextResponse.json({
      ok: true,
      message: created,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2021") {
      return schemaNotReady();
    }
    return NextResponse.json({ error: "Failed to send message." }, { status: 500 });
  }
}
