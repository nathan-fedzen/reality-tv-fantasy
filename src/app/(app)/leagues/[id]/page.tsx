import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CopyButton from "@/components/copy-button";
import DeleteLeagueButton from "@/components/delete-league-button";
import InviteControls from "@/components/invite-controls";
import StartLeagueButton from "@/components/start-league-button";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!id || id === "undefined") {
    return <main className="p-6">Invalid league id.</main>;
  }

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { email: true, name: true } } } },
      invites: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  if (!league) {
    return <main className="p-6">League not found.</main>;
  }

  const invite = league.invites[0] ?? null;
  const inviteToken = invite?.token ?? null;
  const inviteIsActive = invite?.isActive ?? false;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  const inviteUrl = inviteToken ? `${baseUrl}/join/${inviteToken}` : null;

  const isCreator = league.createdById === user.id;

  const now = new Date();
  const hasStarted =
    league.startedAt !== null ||
    (league.startsAt ? now >= league.startsAt : false);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 pb-12">
        {/* HERO */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-6 shadow-sm">
          <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />

          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                🎬 League Hub
              </div>

              <h1 className="mt-3 text-2xl sm:text-3xl font-semibold truncate">
                {league.name}
              </h1>

              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-accent px-2.5 py-1 font-semibold">
                  {league.showType}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 font-semibold">
                  {league.visibility}
                </span>
                <span className="rounded-full bg-muted px-2.5 py-1 font-semibold">
                  {league.members.length}/{league.maxPlayers} members
                </span>
                <span className="rounded-full bg-primary/15 text-primary px-2.5 py-1 font-semibold ring-1 ring-primary/25">
                  {hasStarted ? "Live" : "Pre-Season"}
                </span>
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex flex-wrap gap-2">
              {isCreator && !hasStarted && (
                <StartLeagueButton leagueId={league.id} />
              )}

              {inviteUrl && (
                <CopyButton
                  text={inviteUrl}
                  className="rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent transition"
                />
              )}

              <InviteControls leagueId={league.id} isActive={inviteIsActive} />
            </div>
          </div>

          {/* NAV */}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/leagues/${league.id}`}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-sm font-semibold shadow-sm"
            >
              🏠 Overview
            </Link>
            <Link
              href={`/leagues/${league.id}/leaderboard`}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold hover:bg-accent transition"
            >
              🏆 Leaderboard
            </Link>
            <Link
              href={`/leagues/${league.id}/picks`}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold hover:bg-accent transition"
            >
              🎮 Picks
            </Link>
            <Link
              href={`/leagues/${league.id}/weeks`}
              className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-semibold hover:bg-accent transition"
            >
              📺 Weeks
            </Link>
          </div>
        </div>

        {/* CONTENT */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* MEMBERS */}
          <section className="lg:col-span-2 rounded-3xl border border-border bg-card shadow-sm p-5">
            <h2 className="text-base font-semibold flex items-center gap-2">
              👥 Cast & Members
            </h2>

            <ul className="mt-3 space-y-2 text-sm">
              {league.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2"
                >
                  <span className="truncate">
                    {m.user.name || m.user.email}
                  </span>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {/* INVITES */}
          <aside className="rounded-3xl border border-border bg-card shadow-sm p-5">
            <h2 className="text-base font-semibold flex items-center gap-2">
              🎟️ Invites
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Share the link. Start the chaos.
            </p>

            {!inviteUrl && (
              <p className="mt-3 text-xs text-muted-foreground">
                No invite link yet.
              </p>
            )}
          </aside>
        </div>

        {/* DANGER */}
        {isCreator && (
          <section className="mt-4 rounded-3xl border border-border bg-card shadow-sm p-5">
            <h2 className="text-base font-semibold text-destructive">
              ⚠️ Danger zone
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Delete this league (for cleaning up test leagues).
            </p>
            <div className="mt-3">
              <DeleteLeagueButton
                leagueId={league.id}
                leagueName={league.name}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
