import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import DragRaceWeekForm from "@/components/commissioner/drag-race-week-form";
import SurvivorWeekForm from "@/components/commissioner/survivor-week-form";

type DragEpisodeWithResults = Prisma.EpisodeGetPayload<{
  select: {
    id: true;
    episodeType: true;
    results: true;
    finalePlacements: true;
    finaleExtras: true;
  };
}>;

type SurvivorEpisodeWithResults = Prisma.EpisodeGetPayload<{
  select: {
    id: true;
    survivorMeta: {
      select: {
        isMerge: true;
        isNonElimination: true;
        bootCastawayId: true;
        bootVoteCount: true;
        immunityWinnerCastawayId: true;
      };
    };
    survivorCastawayResults: {
      select: {
        castawayId: true;
        survived: true;
        eliminated: true;
        individualImmunityWins: true;
        individualRewardWins: true;
        advantagesFound: true;
        idolsPlayedSuccessfully: true;
        votesReceived: true;
        confessionalLeader: true;
        endgamePlacement: true;
      };
    };
  };
}>;

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

  let schemaMismatch = false;
  let dragEpisode: DragEpisodeWithResults | null = null;
  let survivorEpisode: SurvivorEpisodeWithResults | null = null;

  try {
    if (league.showType === "DRAG_RACE") {
      dragEpisode = await prisma.episode.findUnique({
        where: { leagueId_week: { leagueId: league.id, week: weekNum } },
        select: {
          id: true,
          episodeType: true,
          results: true,
          finalePlacements: true,
          finaleExtras: true,
        },
      });
    }

    if (league.showType === "SURVIVOR") {
      survivorEpisode = await prisma.episode.findUnique({
        where: { leagueId_week: { leagueId: league.id, week: weekNum } },
        select: {
          id: true,
          survivorMeta: {
            select: {
              isMerge: true,
              isNonElimination: true,
              bootCastawayId: true,
              bootVoteCount: true,
              immunityWinnerCastawayId: true,
            },
          },
          survivorCastawayResults: {
            select: {
              castawayId: true,
              survived: true,
              eliminated: true,
              individualImmunityWins: true,
              individualRewardWins: true,
              advantagesFound: true,
              idolsPlayedSuccessfully: true,
              votesReceived: true,
              confessionalLeader: true,
              endgamePlacement: true,
            },
          },
        },
      });
    }
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      schemaMismatch = true;
    } else {
      throw err;
    }
  }

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

      {schemaMismatch && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          This environment is missing one or more database columns for weekly results.
          Run `npx prisma migrate deploy` for production, then redeploy.
        </div>
      )}

      {!schemaMismatch && league.showType === "DRAG_RACE" ? (
        <div className="mt-6">
          <DragRaceWeekForm
            leagueId={league.id}
            week={weekNum}
            queens={queens.map((q) => ({ id: q.id, name: q.name }))}
            existingResults={dragEpisode?.results ?? []}
            episodeType={dragEpisode?.episodeType ?? "REGULAR"}
            existingFinalePlacements={dragEpisode?.finalePlacements ?? []}
            existingFinaleExtras={dragEpisode?.finaleExtras ?? []}
            isCommissioner={isCommissioner}
            hasStarted={hasStarted}
          />
        </div>
      ) : !schemaMismatch && league.showType === "SURVIVOR" ? (
        <div className="mt-6">
          <SurvivorWeekForm
            leagueId={league.id}
            week={weekNum}
            castaways={castaways}
            existingMeta={
              survivorEpisode?.survivorMeta
                ? {
                    isMerge: survivorEpisode.survivorMeta.isMerge,
                    isNonElimination: survivorEpisode.survivorMeta.isNonElimination,
                    bootCastawayId: survivorEpisode.survivorMeta.bootCastawayId,
                    bootVoteCount: survivorEpisode.survivorMeta.bootVoteCount,
                    immunityWinnerCastawayId:
                      survivorEpisode.survivorMeta.immunityWinnerCastawayId,
                  }
                : null
            }
            existingResults={(survivorEpisode?.survivorCastawayResults ?? []).map((row) => ({
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
