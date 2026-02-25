import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import CopyButton from "@/components/copy-button";
import DeleteLeagueButton from "@/components/delete-league-button";
import InviteControls from "@/components/invite-controls";
import LeaguePageNav from "@/components/league-page-nav";
import StartLeagueButton from "@/components/start-league-button";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

function toNumber(d: Prisma.Decimal | null | undefined) {
  if (d == null) return 0;
  return Number(d.toString());
}

function userLabel(user: {
  displayName: string | null;
  name: string | null;
  email: string | null;
}) {
  return user.displayName ?? user.name ?? user.email ?? "Unknown";
}

type SurvivorTiebreakPrediction = {
  leagueEntryId: string;
  tribals: Prisma.JsonValue | null;
  bootCastawayId: string | null;
  secondaryBootCastawayId: string | null;
  episode: {
    survivorCastawayResults: Array<{ castawayId: string }>;
  };
};

function predictedBootCastawayIds(prediction: SurvivorTiebreakPrediction) {
  const fromTribals = new Set<string>();
  if (Array.isArray(prediction.tribals)) {
    for (const row of prediction.tribals) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const castawayId = (row as Record<string, unknown>).bootCastawayId;
      if (typeof castawayId !== "string") continue;
      const trimmed = castawayId.trim();
      if (trimmed) fromTribals.add(trimmed);
    }
  }

  if (fromTribals.size > 0) {
    return Array.from(fromTribals);
  }

  return Array.from(
    new Set(
      [prediction.bootCastawayId, prediction.secondaryBootCastawayId]
        .filter((value): value is string => !!value)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function countCorrectEliminationPredictions(
  predictions: SurvivorTiebreakPrediction[]
) {
  const result = new Map<string, number>();

  for (const prediction of predictions) {
    const predictedBoots = predictedBootCastawayIds(prediction);
    if (predictedBoots.length === 0) continue;

    const actualBoots = new Set(
      prediction.episode.survivorCastawayResults.map((row) => row.castawayId)
    );
    const hits = predictedBoots.filter((castawayId) => actualBoots.has(castawayId)).length;
    if (hits === 0) continue;

    result.set(
      prediction.leagueEntryId,
      (result.get(prediction.leagueEntryId) ?? 0) + hits
    );
  }

  return result;
}

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
      members: {
        include: { user: { select: { displayName: true, email: true, name: true } } },
      },
      invites: { take: 1, orderBy: { createdAt: "desc" } },
      survivorCastaways: {
        select: { id: true, name: true, tribe: true },
        orderBy: { name: "asc" },
      },
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
  const isSurvivor = league.showType === "SURVIVOR";

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  const [
    allEntries,
    groupedScores,
    myEntry,
    eliminatedRows,
    survivorPredictions,
    survivorEpisodes,
  ] =
    await Promise.all([
      prisma.leagueEntry.findMany({
        where: { leagueId: id },
        select: { id: true, userId: true, createdAt: true },
      }),
      prisma.leagueEntryScore.groupBy({
        by: ["leagueEntryId"],
        where: { leagueEntry: { leagueId: id } },
        _sum: { points: true },
      }),
      prisma.leagueEntry.findUnique({
        where: { leagueId_userId: { leagueId: id, userId: user.id } },
        select: { id: true },
      }),
      isSurvivor
        ? prisma.survivorEpisodeCastawayResult.findMany({
            where: { leagueId: id, eliminated: true },
            select: { castawayId: true },
            distinct: ["castawayId"],
          })
        : Promise.resolve([]),
      isSurvivor
        ? prisma.survivorWeeklyPrediction.findMany({
            where: {
              leagueId: id,
            },
            select: {
              leagueEntryId: true,
              tribals: true,
              bootCastawayId: true,
              secondaryBootCastawayId: true,
              episode: {
                select: {
                  week: true,
                  survivorCastawayResults: {
                    where: { eliminated: true },
                    select: { castawayId: true },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      isSurvivor
        ? prisma.episode.findMany({
            where: {
              leagueId: id,
              week: { lte: SURVIVOR_SEASON_WEEKS },
            },
            select: {
              week: true,
              survivorCastawayResults: {
                select: { id: true },
                take: 1,
              },
            },
          })
        : Promise.resolve([]),
    ]);

  const myDraftPicks =
    isSurvivor && myEntry
      ? await prisma.survivorDraftPick.findMany({
          where: { leagueEntryId: myEntry.id },
          select: {
            castawayId: true,
            castaway: { select: { name: true } },
          },
          orderBy: { overallPick: "asc" },
        })
      : [];

  const totalsByEntryId = new Map(
    groupedScores.map((row) => [row.leagueEntryId, toNumber(row._sum.points)])
  );
  const correctBootByEntryId = isSurvivor
    ? countCorrectEliminationPredictions(survivorPredictions)
    : new Map<string, number>();

  const rankedEntries = allEntries
    .map((entry) => ({
      entryId: entry.id,
      createdAt: entry.createdAt,
      points: totalsByEntryId.get(entry.id) ?? 0,
      correctBoots: correctBootByEntryId.get(entry.id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (isSurvivor && b.correctBoots !== a.correctBoots) {
        return b.correctBoots - a.correctBoots;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

  const rankedWithPlace = rankedEntries.reduce<
    Array<(typeof rankedEntries)[number] & { rank: number }>
  >((acc, entry) => {
    const previous = acc[acc.length - 1];
    const sameRankAsPrevious =
      !!previous &&
      entry.points === previous.points &&
      (!isSurvivor || entry.correctBoots === previous.correctBoots);

    acc.push({
      ...entry,
      rank: sameRankAsPrevious ? previous.rank : acc.length + 1,
    });
    return acc;
  }, []);

  const eliminatedCastawayIds = new Set(eliminatedRows.map((row) => row.castawayId));
  const myStanding = myEntry
    ? rankedWithPlace.find((row) => row.entryId === myEntry.id) ?? null
    : null;
  const mySurvivors = myDraftPicks.map((pick) => ({
    castawayId: pick.castawayId,
    name: pick.castaway.name,
    eliminated: eliminatedCastawayIds.has(pick.castawayId),
  }));
  const myAliveSurvivors = mySurvivors.filter((survivor) => !survivor.eliminated);
  const myEliminatedSurvivors = mySurvivors.filter((survivor) => survivor.eliminated);
  const weeklySubmissionTracker = isSurvivor
    ? (() => {
        const memberRows = league.members
          .map((member) => ({
            userId: member.userId,
            name: userLabel(member.user),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const enteredWeeks = new Set(
          survivorEpisodes
            .filter((episode) => episode.survivorCastawayResults.length > 0)
            .map((episode) => episode.week)
        );

        const targetWeek =
          Array.from({ length: SURVIVOR_SEASON_WEEKS }, (_, i) => i + 1).find(
            (weekNum) => !enteredWeeks.has(weekNum)
          ) ?? null;

        if (targetWeek === null) {
          return {
            week: null,
            submittedNames: [] as string[],
            pendingNames: [] as string[],
            submittedCount: 0,
            totalCount: memberRows.length,
            seasonComplete: true,
          };
        }

        const entryUserById = new Map(allEntries.map((entry) => [entry.id, entry.userId]));
        const submittedUserIds = new Set<string>();
        for (const prediction of survivorPredictions) {
          if (prediction.episode.week !== targetWeek) continue;
          const userId = entryUserById.get(prediction.leagueEntryId);
          if (userId) submittedUserIds.add(userId);
        }

        const submittedNames: string[] = [];
        const pendingNames: string[] = [];
        for (const member of memberRows) {
          if (submittedUserIds.has(member.userId)) {
            submittedNames.push(member.name);
          } else {
            pendingNames.push(member.name);
          }
        }

        return {
          week: targetWeek,
          submittedNames,
          pendingNames,
          submittedCount: submittedNames.length,
          totalCount: memberRows.length,
          seasonComplete: false,
        };
      })()
    : null;

  return (
    <main className="min-h-[calc(100vh-56px)] bg-transparent">
      <div className="mx-auto max-w-5xl px-4 py-8 pb-12 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-6 shadow-sm">
          <div className="pointer-events-none absolute -right-16 -top-16 -z-10 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 -z-10 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />

          <div className="space-y-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-semibold ring-1 ring-border">
                League Hub
              </div>

              <h1 className="mt-3 break-words text-2xl font-semibold leading-tight sm:text-3xl">
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
                <span className="rounded-full bg-primary/15 px-2.5 py-1 font-semibold text-primary ring-1 ring-primary/25">
                  {hasStarted ? "Live" : "Pre-Season"}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {isCreator && !hasStarted && <StartLeagueButton leagueId={league.id} />}

            {inviteUrl && (
              <CopyButton
                text={inviteUrl}
                className="rounded-2xl border border-border bg-card px-4 py-2 text-sm font-semibold transition hover:bg-accent"
              />
            )}

            <InviteControls leagueId={league.id} isActive={inviteIsActive} />
          </div>

          <LeaguePageNav
            leagueId={league.id}
            showType={league.showType}
            isCommissioner={isCreator}
            currentPage="overview"
            className="mt-5"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <aside className="order-1 flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm lg:order-2">
            {league.showType === "SURVIVOR" && (
              <section className="order-1 rounded-2xl border border-primary/25 bg-primary/10 p-4 shadow-sm lg:order-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  New for players
                </p>
                <p className="mt-1 text-sm">
                  Scoring, deadlines, tiebreaks, and strategy reminders in one place.
                </p>
                <Link
                  href={`/leagues/${league.id}/guide`}
                  className="mt-3 inline-flex rounded-full border border-primary/30 bg-background px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-accent"
                >
                  Open Survivor Player Guide
                </Link>
              </section>
            )}

            <div className="order-2 rounded-2xl border border-border bg-background/60 p-3 lg:order-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your standing
              </p>

              {!myStanding ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Join this league to appear on the leaderboard.
                </p>
              ) : (
                <>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-border bg-card px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Place
                      </div>
                      <div className="text-lg font-semibold">#{myStanding.rank}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Points
                      </div>
                      <div className="text-lg font-semibold">{myStanding.points.toFixed(2)}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-card px-2 py-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Players
                      </div>
                      <div className="text-lg font-semibold">{rankedWithPlace.length}</div>
                    </div>
                  </div>

                  {isSurvivor && (
                    <>
                      <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-emerald-300">Alive</span>
                          <span className="font-semibold">{myAliveSurvivors.length}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {myAliveSurvivors.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No active survivors</span>
                          ) : (
                            myAliveSurvivors.map((survivor) => (
                              <span
                                key={`alive-${survivor.castawayId}`}
                                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs"
                              >
                                {survivor.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-2 rounded-xl border border-border bg-card px-3 py-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-destructive">Eliminated</span>
                          <span className="font-semibold">{myEliminatedSurvivors.length}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {myEliminatedSurvivors.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None yet</span>
                          ) : (
                            myEliminatedSurvivors.map((survivor) => (
                              <span
                                key={`out-${survivor.castawayId}`}
                                className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs line-through"
                              >
                                {survivor.name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  <Link
                    href={`/leagues/${league.id}/leaderboard`}
                    className="mt-3 inline-flex rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold transition hover:bg-accent"
                  >
                    Open full leaderboard
                  </Link>
                </>
              )}

              {isSurvivor && weeklySubmissionTracker && (
                <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold">Weekly picks status</span>
                    <span className="font-semibold text-muted-foreground">
                      {weeklySubmissionTracker.seasonComplete
                        ? "Season complete"
                        : `Week ${weeklySubmissionTracker.week}`}
                    </span>
                  </div>

                  {weeklySubmissionTracker.seasonComplete ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      All season weeks already have official results.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {weeklySubmissionTracker.submittedCount}/
                        {weeklySubmissionTracker.totalCount} players submitted.
                        Resets to the next week when commissioner saves results.
                      </p>

                      <div className="mt-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          Submitted
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {weeklySubmissionTracker.submittedNames.length === 0 ? (
                            <span className="text-xs text-muted-foreground">No submissions yet</span>
                          ) : (
                            weeklySubmissionTracker.submittedNames.map((name) => (
                              <span
                                key={`submitted-${name}`}
                                className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs"
                              >
                                {name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="mt-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                          Not submitted
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {weeklySubmissionTracker.pendingNames.length === 0 ? (
                            <span className="text-xs text-muted-foreground">Everyone submitted</span>
                          ) : (
                            weeklySubmissionTracker.pendingNames.map((name) => (
                              <span
                                key={`pending-${name}`}
                                className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs"
                              >
                                {name}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>

          <section className="order-2 rounded-3xl border border-border bg-card p-5 shadow-sm lg:order-1 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-base font-semibold">Cast and Members</h2>

            <ul className="mt-3 space-y-2 text-sm">
              {league.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2"
                >
                  <span className="truncate">{userLabel(m.user)}</span>
                  <span className="text-xs font-semibold text-muted-foreground">{m.role}</span>
                </li>
              ))}
            </ul>

            {league.showType === "SURVIVOR" && (
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  Survivor 50 Cast ({league.survivorCastaways.length})
                </h3>

                {league.survivorCastaways.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">No castaways seeded yet.</p>
                ) : (
                  <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    {league.survivorCastaways.map((castaway) => {
                      const isEliminated = eliminatedCastawayIds.has(castaway.id);

                      return (
                        <li
                          key={castaway.id}
                          className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2"
                        >
                          <span
                            className={[
                              "truncate",
                              isEliminated ? "text-muted-foreground line-through opacity-70" : "",
                            ].join(" ")}
                          >
                            {castaway.name}
                          </span>
                          <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <span>{castaway.tribe ?? "Unassigned"}</span>
                            {isEliminated && (
                              <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                                OUT
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </section>
        </div>

        {isCreator && (
          <section className="mt-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold text-destructive">Danger zone</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Delete this league (for cleaning up test leagues).
            </p>
            <div className="mt-3">
              <DeleteLeagueButton leagueId={league.id} leagueName={league.name} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
