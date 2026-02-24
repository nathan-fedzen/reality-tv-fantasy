import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeagueChatBubble from "@/components/league-chat-bubble";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return <>{children}</>;
  }

  const membership = await prisma.leagueMember.findUnique({
    where: {
      leagueId_userId: {
        leagueId,
        userId: user.id,
      },
    },
    select: { id: true },
  });

  if (!membership) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <LeagueChatBubble leagueId={leagueId} currentUserId={user.id} />
    </>
  );
}

