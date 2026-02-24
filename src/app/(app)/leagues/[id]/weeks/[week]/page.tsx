import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DragRaceWeekForm from "@/components/commissioner/drag-race-week-form";
import SurvivorWeekForm from "@/components/commissioner/survivor-week-form";

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

  const episode = await prisma.episode.findUnique({
    where: { leagueId_week: { leagueId: league.id, week: weekNum } },
    include: {
      results: true,
      finalePlacements: true,
      finaleExtras: true,
      survivorMeta: true,
      survivorCastawayResults: true,
    },
  });

  const queens =
    league.seasonKey && league.showType === "DRAG_RACE"
      ? await prisma.queen.findMany({
          where: { seasonKey: league.seasonKey },
          orderBy: { name: "asc" },
        })
      : [];

  const castaways =
    league.showType === "SURVIVOR"
      ? await prisma.survivorCastaway.findMany({
          where: { leagueId: league.id },
          orderBy: { name: "asc" },
          select: { id: true, name: true, tribe: true },
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
      ) : league.showType === "SURVIVOR" ? (
        <div className="mt-6">
          <SurvivorWeekForm
            leagueId={league.id}
            week={weekNum}
            castaways={castaways}
            existingMeta={
              episode?.survivorMeta
                ? {
                    isMerge: episode.survivorMeta.isMerge,
                    isNonElimination: episode.survivorMeta.isNonElimination,
                    bootCastawayId: episode.survivorMeta.bootCastawayId,
                    bootVoteCount: episode.survivorMeta.bootVoteCount,
                    immunityWinnerCastawayId: episode.survivorMeta.immunityWinnerCastawayId,
                  }
                : null
            }
            existingResults={(episode?.survivorCastawayResults ?? []).map((row) => ({
              castawayId: row.castawayId,
              survived: row.survived,
              eliminated: row.eliminated,
              individualImmunityWins: row.individualImmunityWins,
              individualRewardWins: row.individualRewardWins,
              advantagesFound: row.advantagesFound,
              idolsPlayedSuccessfully: row.idolsPlayedSuccessfully,
              votesReceived: row.votesReceived,
              confessionalLeader: row.confessionalLeader,
              endgamePlacement: row.endgamePlacement,
            }))}
            isCommissioner={isCommissioner}
            hasStarted={hasStarted}
          />
        </div>
      ) : (
        <div className="mt-6 rounded-md border p-3 text-sm">
          Weekly results UI for this ruleset is not implemented yet.
        </div>
      )}
    </main>
  );
}
