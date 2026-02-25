import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Aurora from "@/components/Aurora";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

function RoleBadge({ role }: { role: string }) {
  const isCommissioner = role.toLowerCase() === "commissioner";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        "ring-1 ring-inset",
        isCommissioner
          ? "bg-primary/15 text-primary ring-primary/25"
          : "bg-secondary/15 text-secondary ring-secondary/25",
      ].join(" ")}
    >
      <span aria-hidden>{isCommissioner ? "👑" : "🎮"}</span>
      {isCommissioner ? "COMMISSIONER" : "PLAYER"}
    </span>
  );
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await prisma.leagueMember.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      joinedAt: true,
      league: {
        select: {
          id: true,
          name: true,
          showType: true,
          visibility: true,
          maxPlayers: true,
          updatedAt: true,
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { league: { updatedAt: "desc" } },
  });

  const leagues = memberships.map((m) => ({
    ...m.league,
    myRole: m.role,
    joinedAt: m.joinedAt,
  }));

  return (
    <main className="relative min-h-[calc(100vh-56px)] bg-background">
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[56px]">
        <Aurora
          colorStops={["#7cff67", "#B19EEF", "#5227FF"]}
          blend={0.5}
          amplitude={1.0}
          speed={1}
        />
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[56px] bg-gradient-to-br from-background/70 via-background/85 to-background/75" />
      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 pb-12 sm:px-6">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your leagues and quick links.
            </p>
          </div>

          <LogoutButton className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:shadow-sm transition hover:-translate-y-0.5" />
        </div>

        {/* Hero panel */}
        <div className="mt-6 relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background/80 to-secondary/12 p-6 shadow-sm">
          {/* “sparkles” */}
          <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/15 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                <span aria-hidden>🎬</span> Game Night Mode
              </div>
              <h2 className="mt-3 text-xl font-semibold">
                Ready to stir the pot?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground max-w-prose">
                Jump into a league, invite friends, and start tracking weekly chaos.
              </p>
            </div>

            <Link
              href="/leagues/new"
              className="inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-sm
                         hover:shadow-md hover:-translate-y-0.5 transition active:translate-y-0"
            >
              ➕ Create a league
            </Link>
          </div>
        </div>

        {/* Grid */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Leagues */}
          <section className="lg:col-span-2 rounded-3xl border border-border bg-card shadow-sm">
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Your leagues</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tap a league to view standings, invites, and weekly results.
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {leagues.length} total
                </span>
              </div>

              {leagues.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4">
                  <div className="text-sm text-muted-foreground">
                    You’re not in any leagues yet.
                  </div>
                  <div className="mt-3">
                    <Link
                      href="/leagues/new"
                      className="inline-flex items-center rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold
                                 hover:shadow-sm hover:-translate-y-0.5 transition"
                    >
                      ➕ Create a league
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="mt-4 space-y-3">
                  {leagues.map((league) => (
                    <li key={league.id}>
                      <Link
                        href={`/leagues/${league.id}`}
                        className={[
                          "group block rounded-2xl border border-border bg-background/60 p-4",
                          "transition hover:-translate-y-0.5 hover:shadow-md hover:bg-background",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {/* accent bar */}
                            <div className="mb-3 h-1 w-16 rounded-full bg-gradient-to-r from-primary to-secondary opacity-80" />

                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-semibold truncate">
                                {league.name}
                              </div>
                              <RoleBadge role={league.myRole} />
                            </div>

                            <div className="mt-2 text-xs text-muted-foreground">
                              {league.showType} • {league.visibility} •{" "}
                              {league._count.members}/{league.maxPlayers} members
                            </div>
                          </div>

                          <span
                            className={[
                              "shrink-0 text-xs font-semibold",
                              "bg-gradient-to-r from-primary via-secondary to-primary bg-[length:200%_100%]",
                              "bg-clip-text text-transparent",
                              "group-hover:animate-[shimmer_1.6s_linear_infinite]",
                            ].join(" ")}
                          >
                            View →
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Quick actions */}
          <aside className="rounded-3xl border border-border bg-card shadow-sm">
            <div className="p-5">
              <h3 className="text-base font-semibold">Quick actions</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                The essentials.
              </p>

              <div className="mt-4 grid gap-2">
                <Link
                  href="/leagues/new"
                  className="inline-flex items-center justify-center rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold
                             shadow-sm hover:shadow-md hover:-translate-y-0.5 transition active:translate-y-0"
                >
                  ➕ Create league
                </Link>

                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-2xl border border-border bg-background/60 px-4 py-2 text-sm font-semibold
                             hover:bg-background hover:shadow-sm transition"
                >
                  🎲 Refresh vibe
                </Link>
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-background/60 p-4 text-sm">
                <div className="font-semibold">Pro tip</div>
                <p className="mt-1 text-muted-foreground">
                  Commissioner power move: invite everyone first, then reveal the
                  rules.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* shimmer keyframes (scoped, no config needed) */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </main>
  );
}
