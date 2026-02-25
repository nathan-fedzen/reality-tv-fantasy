import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Aurora from "@/components/Aurora";
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
  const auroraColorStops = isSurvivorTheme
    ? ["#3a0d09", "#6f1f10", "#b33a12"]
    : ["#7cff67", "#B19EEF", "#5227FF"];
  const auroraBlend = isSurvivorTheme ? 0.58 : 0.5;
  const auroraAmplitude = isSurvivorTheme ? 1.0 : 1.0;
  const auroraSpeed = isSurvivorTheme ? 0.85 : 1;
  const bgOverlayClass = isSurvivorTheme
    ? "pointer-events-none fixed inset-x-0 bottom-0 top-[56px] bg-gradient-to-br from-orange-950/45 via-background/90 to-red-950/45"
    : "pointer-events-none fixed inset-x-0 bottom-0 top-[56px] bg-gradient-to-br from-background/70 via-background/85 to-background/75";

  let canUseChat = false;
  let currentUserId: string | null = null;

  if (user) {
    currentUserId = user.id;
    const membership = await prisma.leagueMember.findUnique({
      where: {
        leagueId_userId: {
          leagueId,
          userId: user.id,
        },
      },
      select: { id: true },
    });
    canUseChat = !!membership;
  }

  return (
    <div
      className={[
        survivorThemeClass,
        "relative min-h-[calc(100vh-56px)] bg-background",
      ].join(" ")}
    >
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[56px]">
        <Aurora
          colorStops={auroraColorStops}
          blend={auroraBlend}
          amplitude={auroraAmplitude}
          speed={auroraSpeed}
        />
      </div>
      <div className={bgOverlayClass} />

      <div className="relative z-10">{children}</div>
      {canUseChat && currentUserId && (
        <LeagueChatBubble leagueId={leagueId} currentUserId={currentUserId} />
      )}
    </div>
  );
}
