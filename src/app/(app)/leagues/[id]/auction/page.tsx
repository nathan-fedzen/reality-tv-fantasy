import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeaguePageNav from "@/components/league-page-nav";
import AuctionPageClient from "./auction-page-client";

export default async function SurvivorAuctionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      showType: true,
      createdById: true,
      survivorAuctionActivatedAt: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;
  if (league.showType !== "SURVIVOR") {
    return <main className="p-6">Auction House is only available for Survivor leagues.</main>;
  }
  if (league.members.length === 0) {
    return <main className="p-6">You are not a member of this league.</main>;
  }

  const isCommissioner = league.createdById === user.id;

  return (
    <main className="min-h-[calc(100vh-56px)] bg-transparent">
      <div className="mx-auto max-w-5xl px-4 py-8 pb-12 sm:px-6 space-y-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-6 shadow-sm">
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />

          <div className="relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                Survivor Auction
              </div>
              <h1 className="mt-2 text-2xl sm:text-3xl font-semibold">
                Auction House - {league.name}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Bid with league currency and manage your advantages.
              </p>
            </div>
          </div>

          <LeaguePageNav
            leagueId={league.id}
            showType={league.showType}
            isCommissioner={isCommissioner}
            currentPage="auction"
            className="relative z-10 mt-5"
          />
        </div>

        <AuctionPageClient
          leagueId={league.id}
          isCommissioner={isCommissioner}
          initialActivatedAtIso={league.survivorAuctionActivatedAt?.toISOString() ?? null}
        />
      </div>
    </main>
  );
}
