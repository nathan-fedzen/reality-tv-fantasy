import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireCreator(leagueId: string, userId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, createdById: true },
  });
  if (!league) return { ok: false as const, status: 404, error: "League not found" };
  if (league.createdById !== userId)
    return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const };
}

// GET: fetch current invite (for client if needed)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const auth = await requireCreator(id, user.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const invite = await prisma.leagueInvite.findFirst({
    where: { leagueId: id },
    orderBy: { createdAt: "desc" },
    select: { token: true, isActive: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json({ invite }, { status: 200 });
}

// PATCH: enable/disable current invite (or create if missing and enabling)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const auth = await requireCreator(id, user.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { isActive?: boolean } = {};
  try {
    body = (await req.json()) as any;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.isActive !== "boolean") {
    return NextResponse.json({ error: "isActive must be boolean" }, { status: 400 });
  }

  const current = await prisma.leagueInvite.findFirst({
    where: { leagueId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true },
  });

  if (!current) {
    if (!body.isActive) {
      return NextResponse.json(
        { error: "No invite exists to disable" },
        { status: 400 }
      );
    }

    const created = await prisma.leagueInvite.create({
      data: {
        leagueId: id,
        token: uuidv4(),
        isActive: true,
      },
      select: { token: true, isActive: true, expiresAt: true, createdAt: true },
    });

    return NextResponse.json({ invite: created }, { status: 200 });
  }

  const updated = await prisma.leagueInvite.update({
    where: { id: current.id },
    data: { isActive: body.isActive },
    select: { token: true, isActive: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json({ invite: updated }, { status: 200 });
}

// POST: regenerate invite (deactivate old, create new active token)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const auth = await requireCreator(id, user.id);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  // deactivate existing invites (optional but clean)
  await prisma.leagueInvite.updateMany({
    where: { leagueId: id, isActive: true },
    data: { isActive: false },
  });

  const created = await prisma.leagueInvite.create({
    data: {
      leagueId: id,
      token: uuidv4(),
      isActive: true,
    },
    select: { token: true, isActive: true, expiresAt: true, createdAt: true },
  });

  return NextResponse.json({ invite: created }, { status: 201 });
}
