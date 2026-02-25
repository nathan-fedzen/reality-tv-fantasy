import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LeaguePageNav from "@/components/league-page-nav";
import SurvivorVisualBoard from "@/components/survivor/survivor-visual-board";

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
};

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
            <>
              <div className="mt-4 grid grid-cols-1 gap-2 md:hidden">
                {rankedSurvivors.map((survivor) => (
                  <article
                    key={survivor.id}
                    className={[
                      "rounded-2xl border px-3 py-3",
                      survivor.eliminated
                        ? "border-border bg-background/45 opacity-65 grayscale"
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
                      <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] font-semibold">
                        {survivor.confessionalTotal} conf
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      <span>Votes: {survivor.votesReceivedTotal}</span>
                      <span>Ind imm: {survivor.individualImmunityTotal}</span>
                      <span>Tribe imm: {survivor.tribeImmunityTotal}</span>
                      <span>Reward: {survivor.rewardTotal}</span>
                      <span>Found: {survivor.advantagesFoundTotal}</span>
                      <span>Played: {survivor.idolsPlayedTotal}</span>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Survivor</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Confessionals</th>
                      <th className="px-3 py-2">Votes Recv.</th>
                      <th className="px-3 py-2">Immunity (Ind/Tribe)</th>
                      <th className="px-3 py-2">Reward</th>
                      <th className="px-3 py-2">Found / Played</th>
                      <th className="px-3 py-2">Idol Net</th>
                      <th className="px-3 py-2">Leader Weeks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rankedSurvivors.map((survivor) => (
                      <tr
                        key={survivor.id}
                        className={[
                          survivor.eliminated ? "bg-background/35 text-muted-foreground" : "",
                        ].join(" ")}
                      >
                        <td className="px-3 py-2 font-semibold">#{survivor.confessionalRank}</td>
                        <td className="px-3 py-2">
                          <div
                            className={[
                              "font-semibold",
                              survivor.eliminated ? "line-through opacity-80" : "",
                            ].join(" ")}
                          >
                            {survivor.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {survivor.tribe ?? "Unassigned"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {survivor.eliminated ? (
                            <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                              OUT{survivor.eliminatedWeek ? ` (W${survivor.eliminatedWeek})` : ""}
                            </span>
                          ) : (
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums">
                          {survivor.confessionalTotal}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{survivor.votesReceivedTotal}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {survivor.individualImmunityTotal} / {survivor.tribeImmunityTotal}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{survivor.rewardTotal}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {survivor.advantagesFoundTotal} / {survivor.idolsPlayedTotal}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={[
                              "rounded-full px-2 py-0.5 text-xs font-semibold",
                              survivor.idolNet > 0
                                ? "border border-amber-500/30 bg-amber-500/15 text-amber-200"
                                : "border border-border bg-background text-muted-foreground",
                            ].join(" ")}
                          >
                            {survivor.idolNet > 0 ? `+${survivor.idolNet}` : survivor.idolNet}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{survivor.confessionalLeaderWeeks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
