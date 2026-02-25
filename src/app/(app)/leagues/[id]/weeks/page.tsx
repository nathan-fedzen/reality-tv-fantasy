import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeaguePageNav from "@/components/league-page-nav";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

export default async function WeeksIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      showType: true,
      createdById: true,
      startsAt: true,
      startedAt: true,
      episodes: {
        select: {
          week: true,
          survivorCastawayResults: { select: { id: true } },
        },
        orderBy: { week: "asc" },
      },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);
  const isCommissioner = league.createdById === user.id;

  const enteredWeeks = new Set(
    league.episodes
      .filter((episode) =>
        league.showType === "SURVIVOR"
          ? episode.survivorCastawayResults.length > 0
          : true
      )
      .map((episode) => episode.week)
  );

  const totalWeeks = league.showType === "SURVIVOR" ? SURVIVOR_SEASON_WEEKS : 20;
  const weeksToShow = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const enteredCount = enteredWeeks.size;
  const pendingCount = Math.max(0, totalWeeks - enteredCount);
  const nextPendingWeek = weeksToShow.find((week) => !enteredWeeks.has(week)) ?? null;

  return (
    <main className="min-h-[calc(100vh-56px)] bg-transparent">
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 pb-12 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
              Weekly Results
            </div>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{league.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasStarted
                ? "League is live. Open any week to view or submit picks and results."
                : "League has not started yet. Weekly result entry is locked until kickoff."}
            </p>
          </div>

          <LeaguePageNav
            leagueId={league.id}
            showType={league.showType}
            isCommissioner={isCommissioner}
            currentPage="weeks"
            className="relative z-10 mt-5"
          />

          <div className="relative z-10 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Format
              </p>
              <p className="mt-1 text-sm font-semibold">
                {league.showType === "SURVIVOR" ? "Survivor season" : "Standard season"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{totalWeeks} weeks total</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Entered
              </p>
              <p className="mt-1 text-sm font-semibold">
                {enteredCount}/{totalWeeks}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Weeks with official results</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Remaining
              </p>
              <p className="mt-1 text-sm font-semibold">{pendingCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {nextPendingWeek ? `Next up: Week ${nextPendingWeek}` : "Season complete"}
              </p>
            </div>
          </div>

          {league.showType === "SURVIVOR" && isCommissioner && (
            <div className="relative z-10 mt-4">
              <Link
                href={`/leagues/${league.id}/commissioner-updates`}
                className="inline-flex rounded-full border border-primary/35 bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/18"
              >
                Open commissioner updates
              </Link>
            </div>
          )}
        </section>

        {!hasStarted && (
          <div className="rounded-2xl border border-border bg-card/70 p-4 text-sm text-muted-foreground shadow-sm">
            Weekly pages are visible now, but result updates are locked until the league starts.
          </div>
        )}

        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Season Timeline</h2>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
              {totalWeeks} weeks
            </span>
          </div>

          <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {weeksToShow.map((week) => {
              const isEntered = enteredWeeks.has(week);
              const isNextPending = !isEntered && nextPendingWeek === week;

              return (
                <li key={week}>
                  <Link
                    href={`/leagues/${league.id}/weeks/${week}`}
                    className={[
                      "group block rounded-2xl border px-4 py-3 transition",
                      isEntered
                        ? "border-primary/25 bg-primary/10 hover:bg-primary/15"
                        : "border-border bg-background/60 hover:bg-accent/40",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-semibold">Week {week}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {isEntered ? "Official results entered" : "Waiting for results"}
                        </p>
                      </div>
                      <span
                        className={[
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          isEntered
                            ? "border border-primary/25 bg-primary/15 text-primary"
                            : "border border-border bg-card text-muted-foreground",
                        ].join(" ")}
                      >
                        {isEntered ? "Entered" : "Not entered"}
                      </span>
                    </div>

                    {isNextPending && (
                      <p className="mt-2 text-xs font-semibold text-primary">Next likely update</p>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
