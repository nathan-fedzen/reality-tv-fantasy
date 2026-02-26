import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeaguePageNav from "@/components/league-page-nav";
import SurvivorVisualBoard from "@/components/survivor/survivor-visual-board";
import {
  SURVIVOR_V1_RULES,
  survivorEndgamePlacementPoints,
} from "@/lib/survivor/survivor-rules";

type CastawaySummary = {
  id: string;
  name: string;
  tribe: string | null;
  confessionalTotal: number;
  individualImmunityTotal: number;
  tribeImmunityTotal: number;
  rewardTotal: number;
  votesReceivedTotal: number;
  advantagesFoundTotal: number;
  idolsPlayedTotal: number;
  idolNet: number;
  confessionalLeaderWeeks: number;
  episodesTracked: number;
  eliminated: boolean;
  eliminatedWeek: number | null;
  endgamePlacement: number | null;
  lastUpdatedWeek: number | null;
  fantasyPointsTotal: number;
  fantasyPointsSurvived: number;
  fantasyPointsEliminated: number;
  fantasyPointsIndividualImmunity: number;
  fantasyPointsTribeImmunity: number;
  fantasyPointsReward: number;
  fantasyPointsConfessionals: number;
  fantasyPointsAdvantageFind: number;
  fantasyPointsIdolPlay: number;
  fantasyPointsConfessionalLeader: number;
  fantasyPointsEndgamePlacement: number;
};

function formatPoints(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export default async function SurvivorStatsPage({
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
      startsAt: true,
      startedAt: true,
      members: {
        where: { userId: user.id },
        select: { id: true },
      },
      survivorCastaways: {
        select: {
          id: true,
          name: true,
          tribe: true,
          totalConfessionals: true,
        },
        orderBy: { name: "asc" },
      },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;
  if (league.showType !== "SURVIVOR") {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Survivor Stats</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This tracker is only available for Survivor leagues.
          </p>
        </div>
      </main>
    );
  }
  if (league.members.length === 0) {
    return <main className="p-6">Join this league to view Survivor stats.</main>;
  }

  const isCommissioner = league.createdById === user.id;
  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  const resultRows = await prisma.survivorEpisodeCastawayResult.findMany({
    where: { leagueId: league.id },
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
      episode: {
        select: { week: true },
      },
    },
  });

  const summaryByCastawayId = new Map<string, CastawaySummary>(
    league.survivorCastaways.map((castaway) => [
      castaway.id,
      {
        id: castaway.id,
        name: castaway.name,
        tribe: castaway.tribe,
        confessionalTotal: 0,
        individualImmunityTotal: 0,
        tribeImmunityTotal: 0,
        rewardTotal: 0,
        votesReceivedTotal: 0,
        advantagesFoundTotal: 0,
        idolsPlayedTotal: 0,
        idolNet: 0,
        confessionalLeaderWeeks: 0,
        episodesTracked: 0,
        eliminated: false,
        eliminatedWeek: null,
        endgamePlacement: null,
        lastUpdatedWeek: null,
        fantasyPointsTotal: 0,
        fantasyPointsSurvived: 0,
        fantasyPointsEliminated: 0,
        fantasyPointsIndividualImmunity: 0,
        fantasyPointsTribeImmunity: 0,
        fantasyPointsReward: 0,
        fantasyPointsConfessionals: 0,
        fantasyPointsAdvantageFind: 0,
        fantasyPointsIdolPlay: 0,
        fantasyPointsConfessionalLeader: 0,
        fantasyPointsEndgamePlacement: 0,
      },
    ])
  );

  let latestWeekWithResults = 0;
  for (const row of resultRows) {
    const summary = summaryByCastawayId.get(row.castawayId);
    if (!summary) continue;

    summary.episodesTracked += 1;
    summary.confessionalTotal += row.confessionalCount;
    summary.individualImmunityTotal += row.individualImmunityWins;
    summary.tribeImmunityTotal += row.tribeImmunityWins;
    summary.rewardTotal += row.individualRewardWins;
    summary.votesReceivedTotal += row.votesReceived;
    summary.advantagesFoundTotal += row.advantagesFound;
    summary.idolsPlayedTotal += row.idolsPlayedSuccessfully;
    summary.idolNet += row.advantagesFound - row.idolsPlayedSuccessfully;
    summary.confessionalLeaderWeeks += row.confessionalLeader ? 1 : 0;
    const pointsSurvived =
      row.survived && !row.eliminated ? SURVIVOR_V1_RULES.performance.survived : 0;
    const pointsEliminated = row.eliminated ? SURVIVOR_V1_RULES.performance.eliminated : 0;
    const pointsIndividualImmunity =
      row.individualImmunityWins * SURVIVOR_V1_RULES.performance.individualImmunityWin;
    const pointsTribeImmunity =
      row.tribeImmunityWins * SURVIVOR_V1_RULES.performance.tribeImmunityWin;
    const pointsReward =
      row.individualRewardWins * SURVIVOR_V1_RULES.performance.individualRewardWin;
    const pointsConfessionals =
      row.confessionalCount * SURVIVOR_V1_RULES.performance.confessionalPer;
    const pointsAdvantageFind = row.advantagesFound * SURVIVOR_V1_RULES.performance.idolFind;
    const pointsIdolPlay =
      row.idolsPlayedSuccessfully * SURVIVOR_V1_RULES.performance.idolPlaySuccessful;
    const pointsConfessionalLeader = row.confessionalLeader
      ? SURVIVOR_V1_RULES.performance.confessionalLeader
      : 0;
    const pointsEndgamePlacement = survivorEndgamePlacementPoints(row.endgamePlacement);

    summary.fantasyPointsSurvived += pointsSurvived;
    summary.fantasyPointsEliminated += pointsEliminated;
    summary.fantasyPointsIndividualImmunity += pointsIndividualImmunity;
    summary.fantasyPointsTribeImmunity += pointsTribeImmunity;
    summary.fantasyPointsReward += pointsReward;
    summary.fantasyPointsConfessionals += pointsConfessionals;
    summary.fantasyPointsAdvantageFind += pointsAdvantageFind;
    summary.fantasyPointsIdolPlay += pointsIdolPlay;
    summary.fantasyPointsConfessionalLeader += pointsConfessionalLeader;
    summary.fantasyPointsEndgamePlacement += pointsEndgamePlacement;
    summary.fantasyPointsTotal +=
      pointsSurvived +
      pointsEliminated +
      pointsIndividualImmunity +
      pointsTribeImmunity +
      pointsReward +
      pointsConfessionals +
      pointsAdvantageFind +
      pointsIdolPlay +
      pointsConfessionalLeader +
      pointsEndgamePlacement;

    if (row.eliminated) {
      summary.eliminated = true;
      if (summary.eliminatedWeek === null || row.episode.week < summary.eliminatedWeek) {
        summary.eliminatedWeek = row.episode.week;
      }
    }

    if (row.endgamePlacement != null) {
      if (summary.endgamePlacement == null || row.endgamePlacement < summary.endgamePlacement) {
        summary.endgamePlacement = row.endgamePlacement;
      }
    }

    if (summary.lastUpdatedWeek === null || row.episode.week > summary.lastUpdatedWeek) {
      summary.lastUpdatedWeek = row.episode.week;
    }
    if (row.episode.week > latestWeekWithResults) latestWeekWithResults = row.episode.week;
  }

  for (const castaway of league.survivorCastaways) {
    const summary = summaryByCastawayId.get(castaway.id);
    if (!summary) continue;
    summary.confessionalTotal = Math.max(summary.confessionalTotal, castaway.totalConfessionals);
  }

  const survivors = Array.from(summaryByCastawayId.values()).sort((a, b) => {
    if (b.confessionalTotal !== a.confessionalTotal) {
      return b.confessionalTotal - a.confessionalTotal;
    }
    if (a.eliminated !== b.eliminated) {
      return a.eliminated ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });

  const rankedSurvivors = survivors.map((survivor) => ({
    ...survivor,
    confessionalRank:
      survivors.findIndex((row) => row.confessionalTotal === survivor.confessionalTotal) + 1,
  }));

  const activeSurvivorCount = rankedSurvivors.filter((row) => !row.eliminated).length;
  const eliminatedSurvivorCount = rankedSurvivors.length - activeSurvivorCount;
  const likelyIdolHolders = rankedSurvivors.filter((row) => !row.eliminated && row.idolNet > 0);
  return (
    <main className="min-h-[calc(100vh-56px)] bg-transparent">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 pb-12 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/14 via-background to-secondary/14 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-primary/18 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-secondary/18 blur-3xl" />

          <div className="relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
              Survivor Tracker
            </div>
            <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{league.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Weekly cast performance, confessionals leaderboard, and live idol/advantage
              watchlist.
            </p>
          </div>

          <LeaguePageNav
            leagueId={league.id}
            showType={league.showType}
            isCommissioner={isCommissioner}
            currentPage="survivors"
            className="relative z-10 mt-5"
          />

          <div className="relative z-10 mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                League state
              </p>
              <p className="mt-1 text-sm font-semibold">{hasStarted ? "Live" : "Pre-season"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest scored week: {latestWeekWithResults > 0 ? latestWeekWithResults : "None"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Active survivors
              </p>
              <p className="mt-1 text-sm font-semibold">{activeSurvivorCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {eliminatedSurvivorCount} eliminated
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Idol watch
              </p>
              <p className="mt-1 text-sm font-semibold">{likelyIdolHolders.length} likely holders</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Added on find, removed when played or eliminated
              </p>
            </div>
          </div>
        </section>

        {likelyIdolHolders.length > 0 && (
          <section className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-semibold">Idol Watch</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Active survivors with unresolved idol/advantage finds.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {likelyIdolHolders.map((survivor) => (
                <span
                  key={`idol-${survivor.id}`}
                  className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold"
                >
                  {survivor.name} ({survivor.idolNet})
                </span>
              ))}
            </div>
          </section>
        )}

        {rankedSurvivors.length > 0 && <SurvivorVisualBoard survivors={rankedSurvivors} />}

        <section className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Survivor Statboard</h2>
            <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
              Ranked by confessionals
            </span>
          </div>

          {rankedSurvivors.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No castaways are seeded yet for this league.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {rankedSurvivors.map((survivor) => (
                <article
                  key={survivor.id}
                  className={[
                    "rounded-2xl border px-4 py-3",
                    survivor.eliminated
                      ? "border-border bg-background/45 opacity-75"
                      : "border-border bg-background/70",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p
                        className={[
                          "text-sm font-semibold",
                          survivor.eliminated ? "line-through" : "",
                        ].join(" ")}
                      >
                        #{survivor.confessionalRank} {survivor.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {survivor.tribe ?? "Unassigned"} |{" "}
                        {survivor.eliminated
                          ? `Eliminated${survivor.eliminatedWeek ? ` W${survivor.eliminatedWeek}` : ""}`
                          : "Active"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Season fantasy points
                      </p>
                      <p className="text-base font-semibold tabular-nums">
                        {formatPoints(survivor.fantasyPointsTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Conf: {survivor.confessionalTotal}</span>
                    <span>Votes: {survivor.votesReceivedTotal}</span>
                    <span>
                      Imm: {survivor.individualImmunityTotal + survivor.tribeImmunityTotal}
                    </span>
                    <span>Reward: {survivor.rewardTotal}</span>
                    <span>
                      Found/Played: {survivor.advantagesFoundTotal}/{survivor.idolsPlayedTotal}
                    </span>
                    <span>Leader weeks: {survivor.confessionalLeaderWeeks}</span>
                  </div>

                  <details className="mt-3 rounded-xl border border-border/70 bg-card/60 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold">
                      Scoring breakdown (season)
                    </summary>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>Survived: {formatPoints(survivor.fantasyPointsSurvived)}</span>
                      <span>Eliminated: {formatPoints(survivor.fantasyPointsEliminated)}</span>
                      <span>
                        Ind immunity: {formatPoints(survivor.fantasyPointsIndividualImmunity)}
                      </span>
                      <span>
                        Tribe immunity: {formatPoints(survivor.fantasyPointsTribeImmunity)}
                      </span>
                      <span>Reward wins: {formatPoints(survivor.fantasyPointsReward)}</span>
                      <span>
                        Confessionals: {formatPoints(survivor.fantasyPointsConfessionals)}
                      </span>
                      <span>
                        Advantage finds: {formatPoints(survivor.fantasyPointsAdvantageFind)}
                      </span>
                      <span>Idol plays: {formatPoints(survivor.fantasyPointsIdolPlay)}</span>
                      <span>
                        Confessional leader: {formatPoints(survivor.fantasyPointsConfessionalLeader)}
                      </span>
                      <span>
                        Endgame placement: {formatPoints(survivor.fantasyPointsEndgamePlacement)}
                      </span>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
