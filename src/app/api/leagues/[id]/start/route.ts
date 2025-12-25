import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const league = await prisma.league.findUnique({
    where: { id },
    select: { id: true, createdById: true, startedAt: true },
  });

  if (!league) {
    return NextResponse.json({ error: "League not found" }, { status: 404 });
  }

  if (league.createdById !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (league.startedAt) {
    return NextResponse.json(
      { error: "League already started" },
      { status: 400 }
    );
  }

  await prisma.league.update({
    where: { id },
    data: { startedAt: new Date() },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
