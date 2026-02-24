import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  SURVIVOR_V1_RULES,
  survivorWeekPredictionLockAt,
} from "@/lib/survivor/survivor-rules";
import { survivorEntryCurrencyBalance } from "@/lib/survivor/currency";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "TBD";
  return value.toLocaleString();
}

function formatPoints(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

type DeadlineRow = {
  week: number;
  lockAt: Date | null;
  state: "open" | "locked" | "results";
};

export default async function SurvivorPlayerGuidePage({
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
      startsAt: true,
      startedAt: true,
      members: {
        where: { userId: user.id },
        select: { id: true },
      },
      episodes: {
        orderBy: { week: "asc" },
        select: {
          week: true,
          lockedAt: true,
          survivorMeta: {
            select: {
              isMerge: true,
              lockedAt: true,
            },
          },
        },
      },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;
  if (league.members.length === 0) {
    return <main className="p-6">Join this league to view the player guide.</main>;
  }

  if (league.showType !== "SURVIVOR") {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <div className="rounded-3xl border border-border bg-card p-6">
          <h1 className="text-2xl font-semibold">Player Guide</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This detailed guide is currently available for Survivor leagues.
          </p>
          <Link
            href={`/leagues/${league.id}`}
            className="mt-4 inline-flex rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent"
          >
            Back to league hub
          </Link>
        </div>
      </main>
    );
  }

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  const myEntry = await prisma.leagueEntry.upsert({
    where: {
      leagueId_userId: {
        leagueId: league.id,
        userId: user.id,
      },
    },
    create: {
      leagueId: league.id,
      userId: user.id,
    },
    update: {},
    select: { id: true },
  });

  const [draft, myDraftPickCount, myPredictionCount, myBootOrder, myAdvantages] =
    await Promise.all([
      prisma.survivorDraft.findUnique({
        where: { leagueId: league.id },
        select: {
          status: true,
          picksPerEntry: true,
          totalRounds: true,
          totalPicks: true,
        },
      }),
      prisma.survivorDraftPick.count({
        where: {
          draft: { leagueId: league.id },
          leagueEntryId: myEntry.id,
        },
      }),
      prisma.survivorWeeklyPrediction.count({
        where: {
          leagueId: league.id,
          leagueEntryId: myEntry.id,
        },
      }),
      prisma.survivorBootOrderSubmission.findUnique({
        where: { leagueEntryId: myEntry.id },
        select: {
          id: true,
          submittedAt: true,
          points: true,
        },
      }),
      prisma.survivorOwnedAdvantage.findMany({
        where: {
          leagueId: league.id,
          leagueEntryId: myEntry.id,
        },
        select: {
          id: true,
          status: true,
        },
      }),
    ]);

  const myCurrencyBalance = await survivorEntryCurrencyBalance(
    prisma,
    league.id,
    myEntry.id
  );

  const mergeEpisode = await prisma.episode.findFirst({
    where: {
      leagueId: league.id,
      survivorMeta: { is: { isMerge: true } },
    },
    orderBy: { week: "asc" },
    select: {
      week: true,
      survivorCastawayResults: {
        select: { castawayId: true },
      },
    },
  });

  const mergeCastawayIds = Array.from(
    new Set(mergeEpisode?.survivorCastawayResults.map((row) => row.castawayId) ?? [])
  );

  const final3Count =
    mergeCastawayIds.length > 0
      ? await prisma.survivorEpisodeCastawayResult.count({
          where: {
            leagueId: league.id,
            castawayId: { in: mergeCastawayIds },
            endgamePlacement: { lte: 3 },
          },
        })
      : 0;

  let bootOrderStatusText = "Locked until merge week is marked.";
  if (myBootOrder) {
    bootOrderStatusText = `Submitted on ${formatDateTime(myBootOrder.submittedAt)}.`;
  } else if (mergeEpisode && final3Count >= 3) {
    bootOrderStatusText = "Closed (final three already finalized).";
  } else if (mergeEpisode) {
    bootOrderStatusText = `Open now (opened at merge week ${mergeEpisode.week}).`;
  }

  const activeAdvantages = myAdvantages.filter((row) => row.status === "ACTIVE").length;
  const usedAdvantages = myAdvantages.filter((row) => row.status === "USED").length;

  const episodeByWeek = new Map(league.episodes.map((episode) => [episode.week, episode]));
  const weeksToShow = SURVIVOR_SEASON_WEEKS;

  const deadlines: DeadlineRow[] = Array.from({ length: weeksToShow }, (_, index) => {
    const week = index + 1;
    const episode = episodeByWeek.get(week);
    const lockAt = survivorWeekPredictionLockAt(
      league.startsAt,
      week,
      episode?.lockedAt ?? null
    );
    const state: DeadlineRow["state"] = episode?.survivorMeta?.lockedAt
      ? "results"
      : lockAt && now >= lockAt
        ? "locked"
        : "open";
    return { week, lockAt, state };
  });

  const performanceRows = [
    { label: "Survived episode", points: SURVIVOR_V1_RULES.performance.survived },
    {
      label: "Individual immunity win",
      points: SURVIVOR_V1_RULES.performance.individualImmunityWin,
    },
    {
      label: "Tribe immunity win",
      points: SURVIVOR_V1_RULES.performance.tribeImmunityWin,
    },
    {
      label: "Individual reward win",
      points: SURVIVOR_V1_RULES.performance.individualRewardWin,
    },
    {
      label: "Each confessional",
      points: SURVIVOR_V1_RULES.performance.confessionalPer,
    },
    { label: "Idol/advantage found", points: SURVIVOR_V1_RULES.performance.idolFind },
    {
      label: "Idol played successfully",
      points: SURVIVOR_V1_RULES.performance.idolPlaySuccessful,
    },
    {
      label: "Confessional leader",
      points: SURVIVOR_V1_RULES.performance.confessionalLeader,
    },
    { label: "Eliminated", points: SURVIVOR_V1_RULES.performance.eliminated },
  ];

  const predictionRows = [
    {
      label: "Exact boot castaway (per correct boot pick)",
      points: SURVIVOR_V1_RULES.weeklyPredictions.bootCastawayExact,
    },
    {
      label: "Exact boot vote count",
      points: SURVIVOR_V1_RULES.weeklyPredictions.bootVoteCountExact,
    },
    {
      label: "Exact immunity winner",
      points: SURVIVOR_V1_RULES.weeklyPredictions.immunityWinnerExact,
    },
    {
      label: "Idol played yes/no",
      points: SURVIVOR_V1_RULES.weeklyPredictions.idolPlayedYesNo,
    },
    {
      label: "Safe pick survives",
      points: SURVIVOR_V1_RULES.weeklyPredictions.safePickSurvives,
    },
  ];

  const placementRows = Object.entries(SURVIVOR_V1_RULES.endgamePlacementPoints)
    .map(([placement, points]) => ({
      placement: Number(placement),
      points,
    }))
    .sort((a, b) => a.placement - b.placement);

  return (
    <main className="min-h-[calc(100vh-56px)] bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 pb-14 sm:px-6">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/20 via-background to-secondary/20 p-6 shadow-sm sm:p-8">
          <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-secondary/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_15%,hsl(var(--primary)/0.20),transparent_40%)]" />

          <div className="relative z-10 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-semibold">
                Survivor Player Guide
              </div>
              <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{league.name}</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                Everything players need each week: where points come from, when locks
                happen, and how to win tiebreaks.
              </p>
            </div>

            <Link
              href={`/leagues/${league.id}`}
              className="inline-flex rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-accent"
            >
              Back to league hub
            </Link>
          </div>

          <div className="relative z-10 mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                League state
              </p>
              <p className="mt-1 text-sm font-semibold">{hasStarted ? "Live" : "Pre-season"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Start: {formatDateTime(league.startsAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Draft progress
              </p>
              <p className="mt-1 text-sm font-semibold">
                {myDraftPickCount}/{draft?.picksPerEntry ?? 0} picks
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Status: {draft?.status ?? "NOT_STARTED"}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your currency
              </p>
              <p className="mt-1 text-sm font-semibold">{myCurrencyBalance.toFixed(2)} pts</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Active advantages: {activeAdvantages}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Submission status
              </p>
              <p className="mt-1 text-sm font-semibold">{myPredictionCount} weekly predictions</p>
              <p className="mt-1 text-xs text-muted-foreground">{bootOrderStatusText}</p>
            </div>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <article className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
            <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-gradient-to-bl from-primary/15 to-transparent" />
            <h2 className="text-lg font-semibold">How the season flows</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Follow this path and you will never miss a scoring opportunity.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  1. Snake draft
                </p>
                <p className="mt-1 text-sm">
                  Draft is seat-based snake order. Odd rounds go forward, even rounds
                  reverse. Everyone gets the same number of picks, and extra castaways can
                  remain undrafted.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  2. Weekly prediction
                </p>
                <p className="mt-1 text-sm">
                  Submit once per week: boot pick, vote count, immunity, idol yes/no,
                  and a safe pick. Week 1 has two ordered sets (1st tribal and 2nd tribal):
                  boot pick, boot vote count, immunity winner, and safe pick for each.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  3. Episode scoring
                </p>
                <p className="mt-1 text-sm">
                  Commissioner enters results. Your roster points, prediction points,
                  engagement bonus, and any advantage effects are recomputed.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  4. Merge lock-in
                </p>
                <p className="mt-1 text-sm">
                  At merge, submit one boot-order list from first merge boot to winner.
                  It locks permanently after submit or once final three are known.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background/60 p-3 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  5. Auction and advantages
                </p>
                <p className="mt-1 text-sm">
                  Bid with your points-based currency. Winning bids can grant one-time
                  boosts like Double Episode, Idol Insurance, or Prediction Shield.
                </p>
              </div>
            </div>
          </article>

          <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Player reminders</h2>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Weekly prediction: one submission only.
              </li>
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Confessionals score weekly and are also tracked as a running season total per
                castaway.
              </li>
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Survivor leagues run with 2-8 players. Everyone gets equal draft picks, so
                some castaways may stay undrafted.
              </li>
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Prediction scores are hard-capped at{" "}
                <span className="font-semibold">
                  {SURVIVOR_V1_RULES.weeklyPredictions.maxPoints}
                </span>{" "}
                points.
              </li>
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Last Survivor Standing bonus:{" "}
                <span className="font-semibold">
                  {formatPoints(SURVIVOR_V1_RULES.engagement.lastSurvivorStandingWeekly)}
                </span>{" "}
                each week for entries tied with the most surviving roster castaways.
              </li>
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Leaderboard tiebreak: total correct elimination predictions, then earliest
                league entry creation.
              </li>
              <li className="rounded-xl border border-border bg-background/60 p-3">
                Advantage inventory: {activeAdvantages} active, {usedAdvantages} used.
              </li>
            </ul>
          </article>
        </section>

        <section className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Performance scoring</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Applies to castaways on your roster each week.
            </p>
            <div className="mt-4 space-y-2">
              {performanceRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <span>{row.label}</span>
                  <span
                    className={`font-semibold ${
                      row.points >= 0 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {formatPoints(row.points)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Weekly prediction scoring</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit before lock. Raw points are capped automatically.
            </p>
            <div className="mt-4 space-y-2">
              {predictionRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <span>{row.label}</span>
                  <span className="font-semibold text-primary">{formatPoints(row.points)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
              Weekly prediction max:{" "}
              <span className="font-semibold">
                {SURVIVOR_V1_RULES.weeklyPredictions.maxPoints} points
              </span>
              .
            </div>
          </article>

          <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Boot-order lock-in scoring</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Scored after endgame placements are complete.
            </p>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                <span>Exact position</span>
                <span className="font-semibold text-primary">
                  {formatPoints(SURVIVOR_V1_RULES.bootOrder.exactPosition)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                <span>Off by one</span>
                <span className="font-semibold text-primary">
                  {formatPoints(SURVIVOR_V1_RULES.bootOrder.offByOne)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                <span>Final 3 presence</span>
                <span className="font-semibold text-primary">
                  {formatPoints(SURVIVOR_V1_RULES.bootOrder.final3Presence)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2 text-sm">
                <span>Winner bonus</span>
                <span className="font-semibold text-primary">
                  {formatPoints(SURVIVOR_V1_RULES.bootOrder.winnerBonus)}
                </span>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{bootOrderStatusText}</p>
          </article>

          <article className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Endgame placement points</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Added when a roster castaway receives an endgame placement.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {placementRows.map((row) => (
                <div
                  key={row.placement}
                  className="rounded-xl border border-border bg-background/60 px-3 py-2 text-sm"
                >
                  <p className="text-xs text-muted-foreground">Placement #{row.placement}</p>
                  <p className="font-semibold text-primary">{formatPoints(row.points)}</p>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Prediction lock calendar</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lock time is episode lock if set, otherwise a rolling weekly lock from league
            start time.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {deadlines.map((row) => (
              <div
                key={row.week}
                className="rounded-xl border border-border bg-background/60 px-3 py-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Week {row.week}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      row.state === "results"
                        ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                        : row.state === "locked"
                          ? "bg-muted text-muted-foreground ring-1 ring-border"
                          : "bg-secondary/20 text-secondary-foreground ring-1 ring-secondary/30"
                    }`}
                  >
                    {row.state === "results"
                      ? "Results posted"
                      : row.state === "locked"
                        ? "Locked"
                        : "Open"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lock at: {formatDateTime(row.lockAt)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Advantage effects (V1)</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background/60 p-3 text-sm">
              <p className="font-semibold">Double Episode</p>
              <p className="mt-1 text-muted-foreground">
                Multiplies your weekly subtotal by{" "}
                <span className="font-semibold">
                  x{SURVIVOR_V1_RULES.advantages.doubleEpisodeMultiplier}
                </span>
                .
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-3 text-sm">
              <p className="font-semibold">Idol Insurance</p>
              <p className="mt-1 text-muted-foreground">
                If one of your drafted castaways is eliminated that week, gain{" "}
                <span className="font-semibold">
                  {formatPoints(SURVIVOR_V1_RULES.advantages.idolInsuranceFlat)}
                </span>
                .
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-3 text-sm">
              <p className="font-semibold">Prediction Shield</p>
              <p className="mt-1 text-muted-foreground">
                Raises weekly prediction score to at least{" "}
                <span className="font-semibold">
                  {SURVIVOR_V1_RULES.advantages.predictionShieldFloor}
                </span>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
