import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function JoinByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const cleaned = (token ?? "").trim();
  if (!cleaned || cleaned === "undefined") {
    return <main className="p-6">Invalid invite token.</main>;
  }

  // Find invite + league
  const invite = await prisma.leagueInvite.findUnique({
    where: { token: cleaned },
    select: {
      isActive: true,
      expiresAt: true,
      leagueId: true,
      league: { select: { id: true, name: true } },
    },
  });

  if (!invite) {
    return <main className="p-6">Invite not found.</main>;
  }

  if (!invite.isActive) {
    return <main className="p-6">This invite link is no longer active.</main>;
  }

  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return <main className="p-6">This invite link has expired.</main>;
  }

  // Check if already a member
  const existing = await prisma.leagueMember.findUnique({
    where: {
      leagueId_userId: {
        leagueId: invite.leagueId,
        userId: user.id,
      },
    },
    select: { id: true },
  });

  if (!existing) {
    // Optional: check maxPlayers before joining
    const [memberCount, league] = await Promise.all([
      prisma.leagueMember.count({ where: { leagueId: invite.leagueId } }),
      prisma.league.findUnique({
        where: { id: invite.leagueId },
        select: { maxPlayers: true },
      }),
    ]);

    if (league && memberCount >= league.maxPlayers) {
      return <main className="p-6">This league is full.</main>;
    }

    // Add membership
    await prisma.leagueMember.create({
      data: {
        leagueId: invite.leagueId,
        userId: user.id,
        role: "PLAYER",
      },
    });
  }

  // Redirect to the league page
  redirect(`/leagues/${invite.leagueId}`);
}
