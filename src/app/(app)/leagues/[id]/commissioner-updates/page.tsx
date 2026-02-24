import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const SURVIVOR_SEASON_WEEKS = 13;

export default async function SurvivorCommissionerUpdatesIndexPage({
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
      episodes: {
        where: { week: { lte: SURVIVOR_SEASON_WEEKS } },
        orderBy: { week: "asc" },
        select: {
          week: true,
          survivorCastawayResults: {
            select: { id: true, eliminated: true },
          },
        },
      },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;
  if (league.showType !== "SURVIVOR") {
    return <main className="p-6">Commissioner updates are only available for Survivor leagues.</main>;
  }
  if (league.createdById !== user.id) {
    return <main className="p-6">Only the commissioner can access updates.</main>;
  }

  const episodeByWeek = new Map(league.episodes.map((episode) => [episode.week, episode]));

  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Commissioner updates</h1>
          <p className="mt-1 text-sm text-muted-foreground">{league.name}</p>
        </div>
        <Link className="text-sm underline" href={`/leagues/${league.id}/weeks`}>
          Back to weeks
        </Link>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Select a week to enter official Survivor results. This season is set to 13 weeks.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: SURVIVOR_SEASON_WEEKS }, (_, index) => index + 1).map((week) => {
          const episode = episodeByWeek.get(week);
          const eliminationCount =
            episode?.survivorCastawayResults.filter((row) => row.eliminated).length ?? 0;
          const resultsEntered = (episode?.survivorCastawayResults.length ?? 0) > 0;
          return (
            <Link
              key={week}
              href={`/leagues/${league.id}/commissioner-updates/${week}`}
              className="rounded-xl border border-border bg-card p-4 transition hover:bg-accent/40"
            >
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold">Week {week}</p>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {resultsEntered ? "Entered" : "Not entered"}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Eliminations entered: {eliminationCount}
              </p>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
