import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SurvivorWeekForm from "@/components/commissioner/survivor-week-form";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

type SurvivorEpisodeWithResults = Prisma.EpisodeGetPayload<{
  select: {
    id: true;
    survivorMeta: {
      select: {
        tribalCount: true;
        tribals: true;
        isMerge: true;
        isNonElimination: true;
        bootCastawayId: true;
        secondaryBootCastawayId: true;
        bootVoteCount: true;
        secondaryBootVoteCount: true;
        immunityWinnerCastawayId: true;
        secondaryImmunityWinnerCastawayId: true;
      };
    };
    survivorCastawayResults: {
      select: {
        castawayId: true;
        survived: true;
        eliminated: true;
        individualImmunityWins: true;
        tribeImmunityWins: true;
        individualRewardWins: true;
        advantagesFound: true;
        idolsPlayedSuccessfully: true;
        votesReceived: true;
        confessionalCount: true;
        confessionalLeader: true;
        endgamePlacement: true;
      };
    };
  };
}>;

export default async function SurvivorCommissionerWeekPage({
  params,
}: {
  params: Promise<{ id: string; week: string }>;
}) {
  const { id: leagueId, week } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const weekNum = Number(week);
  if (!Number.isInteger(weekNum) || weekNum < 1 || weekNum > SURVIVOR_SEASON_WEEKS) {
    return <main className="p-6">Invalid week.</main>;
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      showType: true,
      createdById: true,
      startsAt: true,
      startedAt: true,
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;
  if (league.showType !== "SURVIVOR") {
    return <main className="p-6">Commissioner updates are only available for Survivor leagues.</main>;
  }
  if (league.createdById !== user.id) {
    return <main className="p-6">Only the commissioner can access this page.</main>;
  }

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  let schemaMismatch = false;
  let survivorEpisode: SurvivorEpisodeWithResults | null = null;

  try {
    survivorEpisode = await prisma.episode.findUnique({
      where: { leagueId_week: { leagueId: league.id, week: weekNum } },
      select: {
        id: true,
        survivorMeta: {
          select: {
            tribalCount: true,
            tribals: true,
            isMerge: true,
            isNonElimination: true,
            bootCastawayId: true,
            secondaryBootCastawayId: true,
            bootVoteCount: true,
            secondaryBootVoteCount: true,
            immunityWinnerCastawayId: true,
            secondaryImmunityWinnerCastawayId: true,
          },
        },
        survivorCastawayResults: {
          select: {
            castawayId: true,
            survived: true,
            eliminated: true,
            individualImmunityWins: true,
            tribeImmunityWins: true,
            individualRewardWins: true,
            advantagesFound: true,
            idolsPlayedSuccessfully: true,
            votesReceived: true,
            confessionalCount: true,
            confessionalLeader: true,
            endgamePlacement: true,
          },
        },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2022") {
      schemaMismatch = true;
    } else {
      throw err;
    }
  }

  const castaways = await prisma.survivorCastaway.findMany({
    where: { leagueId: league.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, tribe: true },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Week {weekNum} commissioner update</h1>
          <p className="mt-1 text-sm text-muted-foreground">{league.name}</p>
        </div>
        <div className="flex gap-3">
          <Link className="text-sm underline" href={`/leagues/${league.id}/commissioner-updates`}>
            All commissioner weeks
          </Link>
          <Link className="text-sm underline" href={`/leagues/${league.id}/weeks/${weekNum}`}>
            Player week view
          </Link>
        </div>
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

      {!schemaMismatch && (
        <div className="mt-5">
          <SurvivorWeekForm
            leagueId={league.id}
            week={weekNum}
            castaways={castaways}
            existingMeta={
              survivorEpisode?.survivorMeta
                ? {
                    tribalCount: survivorEpisode.survivorMeta.tribalCount,
                    tribals: survivorEpisode.survivorMeta.tribals,
                    isMerge: survivorEpisode.survivorMeta.isMerge,
                    isNonElimination: survivorEpisode.survivorMeta.isNonElimination,
                    bootCastawayId: survivorEpisode.survivorMeta.bootCastawayId,
                    secondaryBootCastawayId:
                      survivorEpisode.survivorMeta.secondaryBootCastawayId,
                    bootVoteCount: survivorEpisode.survivorMeta.bootVoteCount,
                    secondaryBootVoteCount:
                      survivorEpisode.survivorMeta.secondaryBootVoteCount,
                    immunityWinnerCastawayId:
                      survivorEpisode.survivorMeta.immunityWinnerCastawayId,
                    secondaryImmunityWinnerCastawayId:
                      survivorEpisode.survivorMeta.secondaryImmunityWinnerCastawayId,
                  }
                : null
            }
            existingResults={(survivorEpisode?.survivorCastawayResults ?? []).map((row) => ({
              castawayId: row.castawayId,
              survived: row.survived,
              eliminated: row.eliminated,
              individualImmunityWins: row.individualImmunityWins,
              tribeImmunityWins: row.tribeImmunityWins,
              individualRewardWins: row.individualRewardWins,
              advantagesFound: row.advantagesFound,
              idolsPlayedSuccessfully: row.idolsPlayedSuccessfully,
              votesReceived: row.votesReceived,
              confessionalCount: row.confessionalCount,
              confessionalLeader: row.confessionalLeader,
              endgamePlacement: row.endgamePlacement,
            }))}
            isCommissioner
            hasStarted={hasStarted}
          />
        </div>
      )}
    </main>
  );
}
