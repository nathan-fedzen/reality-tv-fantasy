import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeagueChatBubble from "@/components/league-chat-bubble";
import { Cinzel, Marcellus } from "next/font/google";

const survivorBodyFont = Marcellus({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-survivor-body",
  display: "swap",
});

const survivorDisplayFont = Cinzel({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-survivor-display",
  display: "swap",
});

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = await params;
  const user = await getCurrentUser();
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { showType: true },
  });
  const isSurvivorTheme = league?.showType === "SURVIVOR";
  const survivorThemeClass = isSurvivorTheme
    ? `${survivorBodyFont.variable} ${survivorDisplayFont.variable} survivor-theme`
    : "";

  if (!user) {
    return <div className={survivorThemeClass}>{children}</div>;
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
    return <div className={survivorThemeClass}>{children}</div>;
  }

  return (
    <div className={survivorThemeClass}>
      {children}
      <LeagueChatBubble leagueId={leagueId} currentUserId={user.id} />
    </div>
  );
}
