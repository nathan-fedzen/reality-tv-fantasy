import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DragRaceWeekForm from "@/components/commissioner/drag-race-week-form";

export default async function WeekPage({
  params,
}: {
  params: Promise<{ id: string; week: string }>;
}) {
  const { id, week } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const weekNum = Number(week);
  if (!Number.isInteger(weekNum) || weekNum < 1) {
    return <main className="p-6">Invalid week.</main>;
  }

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      showType: true,
      seasonKey: true,
      startsAt: true,
      startedAt: true,
      createdById: true,
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  const isCommissioner = league.createdById === user.id;

  // Load existing episode + results (if any)
  const episode = await prisma.episode.findUnique({
    where: { leagueId_week: { leagueId: league.id, week: weekNum } },
    include: {
      results: true,
      finalePlacements: true,
      finaleExtras: true,
    },
  });

  // Load queens for the season (Drag Race)
  const queens =
    league.seasonKey
      ? await prisma.queen.findMany({
        where: { seasonKey: league.seasonKey },
        orderBy: { name: "asc" },
      })
      : [];

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Week {weekNum}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{league.name}</p>
        </div>
        <Link className="text-sm underline" href={`/leagues/${league.id}/weeks`}>
          All weeks
        </Link>
      </div>

      {!hasStarted && (
        <div className="mt-4 rounded-md border p-3 text-sm">
          Results entry is locked until the league starts.
        </div>
      )}

      {/* Ruleset switch (MVP: Drag Race only implemented) */}
      {league.showType === "DRAG_RACE" ? (
        <div className="mt-6">
          <DragRaceWeekForm
            leagueId={league.id}
            week={weekNum}
            queens={queens.map((q) => ({ id: q.id, name: q.name }))}
            existingResults={episode?.results ?? []}
            episodeType={episode?.episodeType ?? "REGULAR"}
            existingFinalePlacements={episode?.finalePlacements ?? []}
            existingFinaleExtras={episode?.finaleExtras ?? []}
            isCommissioner={isCommissioner}
            hasStarted={hasStarted}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-md border p-3 text-sm">
          Weekly results UI for this ruleset isn’t implemented yet.
        </div>
      )}
    </main>
  );
}
