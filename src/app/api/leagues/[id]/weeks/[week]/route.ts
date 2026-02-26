import { NextResponse } from "next/server";
import { Prisma, ShowType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recomputeDragRaceWeekScores } from "@/lib/scoring/drag-race";
import { recomputeSurvivorWeekScores } from "@/lib/scoring/survivor";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";
import { sendWebPushToUsers } from "@/lib/notifications/web-push";

type DragRaceWeekPayload = {
  miniWinners: string[];
  mainWinners: string[];
  lipsyncWinner: string;
  eliminatedQueenId: string | null;
};

type SurvivorCastawayResultPayload = {
  castawayId: string;
  individualImmunityWins: number;
  tribeImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalCount: number;
  endgamePlacement: number | null;
};

type SurvivorTribalMetaPayload = {
  eliminationType?: "VOTE" | "MEDEVAC" | string | null;
  bootCastawayId?: string | null;
  bootVoteCount?: number | null;
  immunityWinnerCastawayId?: string | null;
  immunityType?: "INDIVIDUAL" | "TRIBE" | string | null;
  immunityWinnerCastawayIds?: string[] | null;
  immunityWinningTribes?: string[] | null;
};

type SurvivorWeekPayload = {
  recomputeOnly?: boolean;
  configureOnly?: boolean;
  tribalCount?: number | null;
  tribals?: SurvivorTribalMetaPayload[];
  isMerge: boolean;
  isNonElimination: boolean;
  bootCastawayId?: string | null;
  secondaryBootCastawayId?: string | null;
  bootVoteCount?: number | null;
  secondaryBootVoteCount?: number | null;
  immunityWinnerCastawayId?: string | null;
  secondaryImmunityWinnerCastawayId?: string | null;
  results: SurvivorCastawayResultPayload[];
};

type NormalizedSurvivorTribalMeta = {
  eliminationType: "VOTE" | "MEDEVAC";
  bootCastawayId: string | null;
  bootVoteCount: number | null;
  immunityType: "INDIVIDUAL" | "TRIBE";
  immunityWinnerCastawayId: string | null;
  immunityWinnerCastawayIds: string[];
  immunityWinningTribes: string[];
};

function parseNonNegativeInt(input: unknown) {
  const n = Number(input);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function cleanId(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(out));
}

function normalizeTribalResults(body: SurvivorWeekPayload) {
  if (Array.isArray(body.tribals) && body.tribals.length > 0) {
    return body.tribals.map((tribal) => {
      const eliminationType =
        tribal.eliminationType === "MEDEVAC" ? ("MEDEVAC" as const) : ("VOTE" as const);
      const immunityWinnerCastawayIds = (() => {
        const winnerIds = cleanStringArray(tribal.immunityWinnerCastawayIds);
        if (winnerIds.length > 0) return winnerIds;
        const single = cleanId(tribal.immunityWinnerCastawayId);
        return single ? [single] : [];
      })();

      const normalized: NormalizedSurvivorTribalMeta = {
        eliminationType,
        bootCastawayId: cleanId(tribal.bootCastawayId) || null,
        bootVoteCount:
          tribal.bootVoteCount == null ? null : parseNonNegativeInt(tribal.bootVoteCount),
        immunityType:
          tribal.immunityType === "TRIBE" ? ("TRIBE" as const) : ("INDIVIDUAL" as const),
        immunityWinnerCastawayIds,
        immunityWinningTribes: cleanStringArray(tribal.immunityWinningTribes),
        immunityWinnerCastawayId: cleanId(tribal.immunityWinnerCastawayId) || null,
      };

      if (eliminationType === "MEDEVAC") {
        return {
          ...normalized,
          bootVoteCount: null,
          immunityType: "INDIVIDUAL" as const,
          immunityWinnerCastawayIds: [],
          immunityWinningTribes: [],
          immunityWinnerCastawayId: null,
        };
      }

      return normalized;
    });
  }

  const first: NormalizedSurvivorTribalMeta = {
    eliminationType: "VOTE",
    bootCastawayId: cleanId(body.bootCastawayId) || null,
    bootVoteCount: body.bootVoteCount == null ? null : parseNonNegativeInt(body.bootVoteCount),
    immunityType: "INDIVIDUAL",
    immunityWinnerCastawayIds: cleanId(body.immunityWinnerCastawayId)
      ? [cleanId(body.immunityWinnerCastawayId)]
      : [],
    immunityWinningTribes: [],
    immunityWinnerCastawayId: cleanId(body.immunityWinnerCastawayId) || null,
  };
  const second: NormalizedSurvivorTribalMeta = {
    eliminationType: "VOTE",
    bootCastawayId: cleanId(body.secondaryBootCastawayId) || null,
    bootVoteCount:
      body.secondaryBootVoteCount == null
        ? null
        : parseNonNegativeInt(body.secondaryBootVoteCount),
    immunityType: "INDIVIDUAL",
    immunityWinnerCastawayIds: cleanId(body.secondaryImmunityWinnerCastawayId)
      ? [cleanId(body.secondaryImmunityWinnerCastawayId)]
      : [],
    immunityWinningTribes: [],
    immunityWinnerCastawayId: cleanId(body.secondaryImmunityWinnerCastawayId) || null,
  };

  const out = [first];
  if (
    second.bootCastawayId ||
    second.bootVoteCount != null ||
    second.immunityWinnerCastawayId ||
    second.immunityWinnerCastawayIds.length > 0 ||
    second.immunityWinningTribes.length > 0
  ) {
    out.push(second);
  }

  return out;
}

type RankSnapshot = {
  rankByUserId: Map<string, number>;
};

const WEEK_RESULTS_NOTIFICATION_KIND = "WEEK_RESULTS_POSTED";

function toNumber(value: Prisma.Decimal | null | undefined) {
  if (value == null) return 0;
  return Number(value.toString());
}

function predictedBootCastawayIds(input: {
  tribals: Prisma.JsonValue | null;
  bootCastawayId: string | null;
  secondaryBootCastawayId: string | null;
}) {
  const fromTribals = new Set<string>();
  if (Array.isArray(input.tribals)) {
    for (const row of input.tribals) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const castawayId = (row as Record<string, unknown>).bootCastawayId;
      if (typeof castawayId !== "string") continue;
      const trimmed = castawayId.trim();
      if (trimmed) fromTribals.add(trimmed);
    }
  }

  if (fromTribals.size > 0) return Array.from(fromTribals);

  return Array.from(
    new Set(
      [input.bootCastawayId, input.secondaryBootCastawayId]
        .filter((value): value is string => !!value)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

function countCorrectEliminationPredictions(
  predictions: Array<{
    leagueEntryId: string;
    tribals: Prisma.JsonValue | null;
    bootCastawayId: string | null;
    secondaryBootCastawayId: string | null;
    episode: {
      survivorCastawayResults: Array<{ castawayId: string }>;
    };
  }>
) {
  const result = new Map<string, number>();

  for (const prediction of predictions) {
    const predictedBoots = predictedBootCastawayIds({
      tribals: prediction.tribals,
      bootCastawayId: prediction.bootCastawayId,
      secondaryBootCastawayId: prediction.secondaryBootCastawayId,
    });
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

async function computeLeagueRankSnapshot(
  tx: Prisma.TransactionClient,
  leagueId: string,
  showType: ShowType
) {
  const entries = await tx.leagueEntry.findMany({
    where: { leagueId },
    select: {
      id: true,
      userId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const totals = await tx.leagueEntryScore.groupBy({
    by: ["leagueEntryId"],
    where: {
      leagueEntry: { leagueId },
    },
    _sum: { points: true },
  });
  const totalByEntryId = new Map(
    totals.map((row) => [row.leagueEntryId, toNumber(row._sum.points)])
  );

  const correctPredictionsByEntryId =
    showType === "SURVIVOR"
      ? countCorrectEliminationPredictions(
          await tx.survivorWeeklyPrediction.findMany({
            where: { leagueId },
            select: {
              leagueEntryId: true,
              tribals: true,
              bootCastawayId: true,
              secondaryBootCastawayId: true,
              episode: {
                select: {
                  survivorCastawayResults: {
                    where: { eliminated: true },
                    select: { castawayId: true },
                  },
                },
              },
            },
          })
        )
      : new Map<string, number>();

  const rows = entries.map((entry) => ({
    entryId: entry.id,
    userId: entry.userId,
    createdAt: entry.createdAt,
    points: totalByEntryId.get(entry.id) ?? 0,
    correctPredictions: correctPredictionsByEntryId.get(entry.id) ?? 0,
  }));

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (showType === "SURVIVOR" && b.correctPredictions !== a.correctPredictions) {
      return b.correctPredictions - a.correctPredictions;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  let rank = 0;
  let lastPoints: number | null = null;
  let lastCorrectPredictions: number | null = null;
  const rankByUserId = new Map<string, number>();

  rows.forEach((row, index) => {
    if (
      lastPoints === null ||
      row.points !== lastPoints ||
      (showType === "SURVIVOR" && row.correctPredictions !== lastCorrectPredictions)
    ) {
      rank = index + 1;
      lastPoints = row.points;
      lastCorrectPredictions = row.correctPredictions;
    }
    rankByUserId.set(row.userId, rank);
  });

  return {
    rankByUserId,
  };
}

function buildWeekResultsNotificationBody(input: {
  week: number;
  beforeRank: number | null;
  afterRank: number | null;
}) {
  const parts = [`Week ${input.week} results are posted.`];

  if (input.afterRank == null) {
    parts.push("Check the leaderboard for updated standings.");
    return parts.join(" ");
  }

  if (input.beforeRank == null) {
    parts.push(`You are now #${input.afterRank} on the leaderboard.`);
  } else if (input.afterRank < input.beforeRank) {
    parts.push(`You moved up ${input.beforeRank - input.afterRank} spot(s) to #${input.afterRank}.`);
  } else if (input.afterRank > input.beforeRank) {
    parts.push(`You moved down ${input.afterRank - input.beforeRank} spot(s) to #${input.afterRank}.`);
  } else {
    parts.push(`You stayed at #${input.afterRank}.`);
  }

  if (input.afterRank === 1 && input.beforeRank !== 1) {
    parts.push("You moved into 1st place.");
  }

  return parts.join(" ");
}

async function sendWeekResultsPostedNotifications(input: {
  leagueId: string;
  leagueName: string;
  week: number;
  showType: ShowType;
  beforeSnapshot: RankSnapshot;
  afterSnapshot: RankSnapshot;
}) {
  const members = await prisma.leagueMember.findMany({
    where: { leagueId: input.leagueId },
    select: { userId: true },
  });
  const userIds = Array.from(new Set(members.map((member) => member.userId)));
  if (userIds.length === 0) return;

  const dedupeByUserId = new Map(
    userIds.map((userId) => [
      userId,
      `week-results:${input.showType.toLowerCase()}:${input.leagueId}:week-${input.week}:${userId}`,
    ])
  );
  const existing = await prisma.notificationDelivery.findMany({
    where: { dedupeKey: { in: Array.from(dedupeByUserId.values()) } },
    select: { dedupeKey: true },
  });
  const sentKeys = new Set(existing.map((row) => row.dedupeKey));

  const deliveries: Array<{ userId: string; dedupeKey: string }> = [];
  const title = `${input.leagueName}: Week ${input.week} results posted`;
  const tag = `week-results-${input.leagueId}-w${input.week}`;
  const url = `/leagues/${input.leagueId}/leaderboard`;

  await Promise.all(
    userIds.map(async (userId) => {
      const dedupeKey = dedupeByUserId.get(userId);
      if (!dedupeKey || sentKeys.has(dedupeKey)) return;

      const beforeRank = input.beforeSnapshot.rankByUserId.get(userId) ?? null;
      const afterRank = input.afterSnapshot.rankByUserId.get(userId) ?? null;
      const body = buildWeekResultsNotificationBody({
        week: input.week,
        beforeRank,
        afterRank,
      });

      const pushResult = await sendWebPushToUsers({
        userIds: [userId],
        payload: {
          title,
          body,
          url,
          tag,
        },
      });
      if (pushResult.deliveredUserIds.includes(userId)) {
        deliveries.push({ userId, dedupeKey });
      }
    })
  );

  if (deliveries.length > 0) {
    await prisma.notificationDelivery.createMany({
      data: deliveries.map((delivery) => ({
        userId: delivery.userId,
        kind: WEEK_RESULTS_NOTIFICATION_KIND,
        dedupeKey: delivery.dedupeKey,
      })),
      skipDuplicates: true,
    });
  }
}

async function recalculateConfessionalLeaders(
  tx: Prisma.TransactionClient,
  leagueId: string
) {
  const episodes = await tx.episode.findMany({
    where: { leagueId },
    orderBy: { week: "asc" },
    select: {
      id: true,
      survivorCastawayResults: {
        select: {
          castawayId: true,
          confessionalCount: true,
        },
      },
    },
  });

  const cumulativeByCastawayId = new Map<string, number>();

  for (const episode of episodes) {
    for (const row of episode.survivorCastawayResults) {
      cumulativeByCastawayId.set(
        row.castawayId,
        (cumulativeByCastawayId.get(row.castawayId) ?? 0) + row.confessionalCount
      );
    }

    if (episode.survivorCastawayResults.length === 0) continue;

    let maxTotal = 0;
    for (const row of episode.survivorCastawayResults) {
      const total = cumulativeByCastawayId.get(row.castawayId) ?? 0;
      if (total > maxTotal) maxTotal = total;
    }

    const leaderIds =
      maxTotal > 0
        ? episode.survivorCastawayResults
            .filter((row) => (cumulativeByCastawayId.get(row.castawayId) ?? 0) === maxTotal)
            .map((row) => row.castawayId)
        : [];

    await tx.survivorEpisodeCastawayResult.updateMany({
      where: { episodeId: episode.id },
      data: { confessionalLeader: false },
    });

    if (leaderIds.length > 0) {
      await tx.survivorEpisodeCastawayResult.updateMany({
        where: {
          episodeId: episode.id,
          castawayId: { in: leaderIds },
        },
        data: { confessionalLeader: true },
      });
    }
  }
}

async function recalculateEliminationPlacements(
  tx: Prisma.TransactionClient,
  leagueId: string
) {
  const [castawayCount, episodes] = await Promise.all([
    tx.survivorCastaway.count({ where: { leagueId } }),
    tx.episode.findMany({
      where: { leagueId },
      orderBy: { week: "asc" },
      select: {
        week: true,
        survivorMeta: {
          select: {
            tribals: true,
            bootCastawayId: true,
            secondaryBootCastawayId: true,
          },
        },
        survivorCastawayResults: {
          where: { eliminated: true },
          select: { castawayId: true },
        },
      },
    }),
  ]);

  if (castawayCount <= 0) return;

  const eliminationOrder: string[] = [];
  const seen = new Set<string>();

  for (const episode of episodes) {
    const eliminatedIds = episode.survivorCastawayResults.map((row) => row.castawayId);
    if (eliminatedIds.length === 0) continue;

    const eliminatedSet = new Set(eliminatedIds);
    const orderedForEpisode: string[] = [];

    if (Array.isArray(episode.survivorMeta?.tribals)) {
      for (const row of episode.survivorMeta.tribals) {
        if (!row || typeof row !== "object" || Array.isArray(row)) continue;
        const bootCastawayId = (row as Record<string, unknown>).bootCastawayId;
        if (typeof bootCastawayId !== "string") continue;
        const castawayId = bootCastawayId.trim();
        if (!castawayId || !eliminatedSet.has(castawayId)) continue;
        if (!orderedForEpisode.includes(castawayId)) orderedForEpisode.push(castawayId);
      }
    }

    const firstBoot = episode.survivorMeta?.bootCastawayId?.trim() ?? "";
    if (firstBoot && eliminatedSet.has(firstBoot) && !orderedForEpisode.includes(firstBoot)) {
      orderedForEpisode.push(firstBoot);
    }
    const secondBoot = episode.survivorMeta?.secondaryBootCastawayId?.trim() ?? "";
    if (secondBoot && eliminatedSet.has(secondBoot) && !orderedForEpisode.includes(secondBoot)) {
      orderedForEpisode.push(secondBoot);
    }

    for (const castawayId of eliminatedIds.sort((a, b) => a.localeCompare(b))) {
      if (!orderedForEpisode.includes(castawayId)) orderedForEpisode.push(castawayId);
    }

    for (const castawayId of orderedForEpisode) {
      if (seen.has(castawayId)) continue;
      seen.add(castawayId);
      eliminationOrder.push(castawayId);
    }
  }

  if (eliminationOrder.length === 0) {
    await tx.survivorEpisodeCastawayResult.updateMany({
      where: { leagueId, eliminated: true },
      data: { endgamePlacement: null },
    });
    return;
  }

  const eliminationPlacementByCastaway = new Map<string, number>();
  eliminationOrder.forEach((castawayId, index) => {
    eliminationPlacementByCastaway.set(castawayId, castawayCount - index);
  });

  const eliminatedCastawayIds = Array.from(eliminationPlacementByCastaway.keys());
  await tx.survivorEpisodeCastawayResult.updateMany({
    where: {
      leagueId,
      eliminated: true,
      castawayId: {
        notIn: eliminatedCastawayIds,
      },
    },
    data: {
      endgamePlacement: null,
    },
  });

  await Promise.all(
    eliminatedCastawayIds.map((castawayId) =>
      tx.survivorEpisodeCastawayResult.updateMany({
        where: {
          leagueId,
          castawayId,
          eliminated: true,
        },
        data: {
          endgamePlacement: eliminationPlacementByCastaway.get(castawayId) ?? null,
        },
      })
    )
  );
}

function prismaErrorToResponse(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2022") {
      const meta =
        err.meta && typeof err.meta === "object" ? ` (${JSON.stringify(err.meta)})` : "";
      return NextResponse.json(
        {
          error:
            `Database schema is behind this deployment (missing column). Run \`npx prisma migrate deploy\` on production and redeploy.${meta}`,
          prismaCode: err.code,
        },
        { status: 500 }
      );
    }

    if (err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "A referenced record was not found for this save operation. Refresh and try again.",
          prismaCode: err.code,
        },
        { status: 400 }
      );
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error:
          "Database connection failed. Verify production DATABASE_URL/DIRECT_URL credentials.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; week: string }> }
) {
  const { id, week } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weekNum = Number(week);
  if (!Number.isInteger(weekNum) || weekNum < 1) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id },
    select: { showType: true },
  });
  if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
  if (league.showType === "SURVIVOR" && weekNum > SURVIVOR_SEASON_WEEKS) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }

  const episode =
    league.showType === "SURVIVOR"
      ? await prisma.episode.findUnique({
          where: { leagueId_week: { leagueId: id, week: weekNum } },
          select: {
            id: true,
            week: true,
            leagueId: true,
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
                lockedAt: true,
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
        })
      : await prisma.episode.findUnique({
          where: { leagueId_week: { leagueId: id, week: weekNum } },
          select: {
            id: true,
            week: true,
            leagueId: true,
            episodeType: true,
            results: true,
          },
        });

  return NextResponse.json({ episode });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; week: string }> }
) {
  try {
    const { id, week } = await params;

    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const weekNum = Number(week);
    if (!Number.isInteger(weekNum) || weekNum < 1) {
      return NextResponse.json({ error: "Invalid week" }, { status: 400 });
    }

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        showType: true,
        seasonKey: true,
        createdById: true,
        startsAt: true,
        startedAt: true,
      },
    });

    if (!league) return NextResponse.json({ error: "League not found" }, { status: 404 });
    if (league.showType === "SURVIVOR" && weekNum > SURVIVOR_SEASON_WEEKS) {
      return NextResponse.json({ error: "Invalid week" }, { status: 400 });
    }
    const isSurvivorFinaleWeek =
      league.showType === "SURVIVOR" && weekNum === SURVIVOR_SEASON_WEEKS;

    const isCommissioner = league.createdById === user.id;
    if (!isCommissioner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date();
    const hasStarted =
      league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

    if (!hasStarted) {
      return NextResponse.json({ error: "League not started" }, { status: 400 });
    }

    if (league.showType === "DRAG_RACE") {
      const body = (await req.json()) as DragRaceWeekPayload;

      if (!Array.isArray(body.miniWinners) || body.miniWinners.length < 1) {
        return NextResponse.json({ error: "Mini winners required" }, { status: 400 });
      }
      if (!Array.isArray(body.mainWinners) || body.mainWinners.length < 1) {
        return NextResponse.json({ error: "Main winners required" }, { status: 400 });
      }
      if (!body.lipsyncWinner) {
        return NextResponse.json({ error: "Lip sync winner required" }, { status: 400 });
      }

      if (!league.seasonKey) {
        return NextResponse.json({ error: "League seasonKey missing" }, { status: 400 });
      }

      const submittedIds = new Set<string>([
        ...body.miniWinners,
        ...body.mainWinners,
        body.lipsyncWinner,
        ...(body.eliminatedQueenId ? [body.eliminatedQueenId] : []),
      ]);

      const validQueens = await prisma.queen.findMany({
        where: { seasonKey: league.seasonKey, id: { in: Array.from(submittedIds) } },
        select: { id: true },
      });

      if (validQueens.length !== submittedIds.size) {
        return NextResponse.json({ error: "Invalid queen in payload" }, { status: 400 });
      }

      const resultRows = [
        ...body.miniWinners.map((queenId) => ({ type: "mini", queenId })),
        ...body.mainWinners.map((queenId) => ({ type: "main", queenId })),
        { type: "lipsync", queenId: body.lipsyncWinner },
        { type: "elimination", queenId: body.eliminatedQueenId },
      ];

      const savedWeek = await prisma.$transaction(async (tx) => {
        const beforeSnapshot = await computeLeagueRankSnapshot(tx, league.id, league.showType);
        const upserted = await tx.episode.upsert({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          create: { leagueId: league.id, week: weekNum },
          update: {},
          select: { id: true },
        });

        await tx.episodeResult.deleteMany({ where: { episodeId: upserted.id } });
        await tx.episodeResult.createMany({
          data: resultRows.map((r) => ({
            episodeId: upserted.id,
            type: r.type,
            queenId: r.queenId,
          })),
        });

        await recomputeDragRaceWeekScores(tx, league.id, upserted.id);
        const afterSnapshot = await computeLeagueRankSnapshot(tx, league.id, league.showType);
        return { episodeId: upserted.id, beforeSnapshot, afterSnapshot };
      });

      try {
        await sendWeekResultsPostedNotifications({
          leagueId: league.id,
          leagueName: league.name,
          week: weekNum,
          showType: league.showType,
          beforeSnapshot: savedWeek.beforeSnapshot,
          afterSnapshot: savedWeek.afterSnapshot,
        });
      } catch {
        // Keep weekly result submission resilient if push delivery fails.
      }

      return NextResponse.json({ ok: true, episodeId: savedWeek.episodeId });
    }

    if (league.showType === "SURVIVOR") {
      const body = (await req.json()) as SurvivorWeekPayload;

      if (body.recomputeOnly) {
        const existingEpisode = await prisma.episode.findUnique({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          select: { id: true },
        });

        if (!existingEpisode) {
          return NextResponse.json(
            { error: "No saved results exist for this week yet." },
            { status: 400 }
          );
        }

        await prisma.$transaction(async (tx) => {
          await recalculateConfessionalLeaders(tx, league.id);
          await recalculateEliminationPlacements(tx, league.id);
          await recomputeSurvivorWeekScores(tx, league.id, existingEpisode.id);
        });
        return NextResponse.json({
          ok: true,
          episodeId: existingEpisode.id,
          message: "Week scores recomputed.",
        });
      }

      const requestedTribalCount =
        body.tribalCount == null ? null : parseNonNegativeInt(body.tribalCount);
      if (
        body.tribalCount != null &&
        (requestedTribalCount == null || requestedTribalCount < 1 || requestedTribalCount > 6)
      ) {
        return NextResponse.json(
          { error: "tribalCount must be an integer between 1 and 6." },
          { status: 400 }
        );
      }

      const normalizedTribals = normalizeTribalResults(body);
      const defaultTribalCount = weekNum === 1 ? 2 : 1;
      const tribalCount = Math.max(
        1,
        requestedTribalCount ??
          (normalizedTribals.length > 0 ? normalizedTribals.length : defaultTribalCount)
      );

      if (body.configureOnly) {
        if (normalizedTribals.length > 0 && normalizedTribals.length !== tribalCount) {
          return NextResponse.json(
            { error: "Configured tribal count does not match provided tribal rows." },
            { status: 400 }
          );
        }

        const configTribals =
          normalizedTribals.length > 0
            ? normalizedTribals
            : Array.from({ length: tribalCount }, () => ({
                eliminationType: "VOTE" as const,
                bootCastawayId: null,
                bootVoteCount: null,
                immunityType: "INDIVIDUAL" as const,
                immunityWinnerCastawayIds: [] as string[],
                immunityWinningTribes: [] as string[],
                immunityWinnerCastawayId: null,
              }));

        const firstTribal = configTribals[0] ?? null;
        const secondTribal = configTribals[1] ?? null;

        const configuredEpisode = await prisma.$transaction(async (tx) => {
          const episodeForWeek = await tx.episode.upsert({
            where: { leagueId_week: { leagueId: league.id, week: weekNum } },
            create: { leagueId: league.id, week: weekNum },
            update: {},
            select: { id: true },
          });

          await tx.survivorEpisodeMeta.upsert({
            where: { episodeId: episodeForWeek.id },
            create: {
              leagueId: league.id,
              episodeId: episodeForWeek.id,
              tribalCount,
              tribals: configTribals as unknown as Prisma.InputJsonValue,
              isMerge: !!body.isMerge,
              isNonElimination: !!body.isNonElimination,
              bootCastawayId: firstTribal?.bootCastawayId ?? null,
              secondaryBootCastawayId: secondTribal?.bootCastawayId ?? null,
              bootVoteCount: firstTribal?.bootVoteCount ?? null,
              secondaryBootVoteCount: secondTribal?.bootVoteCount ?? null,
              immunityWinnerCastawayId:
                firstTribal?.immunityWinnerCastawayIds[0] ??
                firstTribal?.immunityWinnerCastawayId ??
                null,
              secondaryImmunityWinnerCastawayId:
                secondTribal?.immunityWinnerCastawayIds[0] ??
                secondTribal?.immunityWinnerCastawayId ??
                null,
              lockedAt: null,
            },
            update: {
              tribalCount,
              tribals: configTribals as unknown as Prisma.InputJsonValue,
              isMerge: !!body.isMerge,
              isNonElimination: !!body.isNonElimination,
              bootCastawayId: firstTribal?.bootCastawayId ?? null,
              secondaryBootCastawayId: secondTribal?.bootCastawayId ?? null,
              bootVoteCount: firstTribal?.bootVoteCount ?? null,
              secondaryBootVoteCount: secondTribal?.bootVoteCount ?? null,
              immunityWinnerCastawayId:
                firstTribal?.immunityWinnerCastawayIds[0] ??
                firstTribal?.immunityWinnerCastawayId ??
                null,
              secondaryImmunityWinnerCastawayId:
                secondTribal?.immunityWinnerCastawayIds[0] ??
                secondTribal?.immunityWinnerCastawayId ??
                null,
              lockedAt: null,
            },
          });

          return episodeForWeek;
        });

        return NextResponse.json({
          ok: true,
          episodeId: configuredEpisode.id,
          tribalCount,
          message: "Week tribal configuration saved.",
        });
      }

      if (!Array.isArray(body.results) || body.results.length === 0) {
        return NextResponse.json(
          { error: "At least one castaway result is required." },
          { status: 400 }
        );
      }

      const castawayIdsInPayload = body.results.map((r) => (r.castawayId ?? "").trim());
      if (castawayIdsInPayload.some((idValue) => !idValue)) {
        return NextResponse.json({ error: "castawayId is required for each row." }, { status: 400 });
      }
      if (new Set(castawayIdsInPayload).size !== castawayIdsInPayload.length) {
        return NextResponse.json(
          { error: "Duplicate castaway rows are not allowed." },
          { status: 400 }
        );
      }

      const idsToValidate = new Set<string>(castawayIdsInPayload);
      for (const tribal of normalizedTribals) {
        if (tribal.bootCastawayId) idsToValidate.add(tribal.bootCastawayId);
        if (tribal.immunityWinnerCastawayId) idsToValidate.add(tribal.immunityWinnerCastawayId);
        for (const winnerId of tribal.immunityWinnerCastawayIds) {
          idsToValidate.add(winnerId);
        }
      }

      const validCastaways = await prisma.survivorCastaway.findMany({
        where: { leagueId: league.id, id: { in: Array.from(idsToValidate) } },
        select: { id: true, tribe: true },
      });
      if (validCastaways.length !== idsToValidate.size) {
        return NextResponse.json(
          { error: "Payload includes castaway(s) not in this league." },
          { status: 400 }
        );
      }
      const castawayTribeById = new Map(validCastaways.map((castaway) => [castaway.id, castaway.tribe]));
      const validTribes = new Set(
        validCastaways
          .map((castaway) => castaway.tribe)
          .filter((tribe): tribe is string => typeof tribe === "string" && tribe.trim().length > 0)
      );

      const parsedResults: Array<{
        castawayId: string;
        individualImmunityWins: number;
        tribeImmunityWins: number;
        individualRewardWins: number;
        advantagesFound: number;
        idolsPlayedSuccessfully: number;
        votesReceived: number;
        confessionalCount: number;
        endgamePlacement: number | null;
      }> = [];

      for (const row of body.results) {
        const individualImmunityWins = parseNonNegativeInt(row.individualImmunityWins);
        const tribeImmunityWins = parseNonNegativeInt(row.tribeImmunityWins);
        const individualRewardWins = parseNonNegativeInt(row.individualRewardWins);
        const advantagesFound = parseNonNegativeInt(row.advantagesFound);
        const idolsPlayedSuccessfully = parseNonNegativeInt(row.idolsPlayedSuccessfully);
        const votesReceived = parseNonNegativeInt(row.votesReceived);
        const confessionalCount = parseNonNegativeInt(row.confessionalCount);

        if (
          individualImmunityWins == null ||
          tribeImmunityWins == null ||
          individualRewardWins == null ||
          advantagesFound == null ||
          idolsPlayedSuccessfully == null ||
          votesReceived == null ||
          confessionalCount == null
        ) {
          return NextResponse.json(
            { error: "Numeric Survivor stats must be non-negative integers." },
            { status: 400 }
          );
        }

        let endgamePlacement: number | null = null;
        if (
          isSurvivorFinaleWeek &&
          row.endgamePlacement != null &&
          row.endgamePlacement !== 0
        ) {
          const parsedPlacement = Number(row.endgamePlacement);
          if (!Number.isInteger(parsedPlacement) || parsedPlacement < 1 || parsedPlacement > 20) {
            return NextResponse.json(
              { error: "endgamePlacement must be an integer between 1 and 20." },
              { status: 400 }
            );
          }
          endgamePlacement = parsedPlacement;
        }

        parsedResults.push({
          castawayId: row.castawayId.trim(),
          individualImmunityWins,
          tribeImmunityWins,
          individualRewardWins,
          advantagesFound,
          idolsPlayedSuccessfully,
          votesReceived,
          confessionalCount,
          endgamePlacement,
        });
      }

      if (normalizedTribals.length !== tribalCount) {
        return NextResponse.json(
          { error: "Tribal row count must match tribalCount." },
          { status: 400 }
        );
      }

      if (!!body.isNonElimination) {
        if (normalizedTribals.some((tribal) => tribal.bootCastawayId != null)) {
          return NextResponse.json(
            { error: "Non-elimination weeks cannot have boot castaways in tribal rows." },
            { status: 400 }
          );
        }
      } else {
        const bootSet = new Set<string>();
        for (let tribalIndex = 0; tribalIndex < normalizedTribals.length; tribalIndex += 1) {
          const tribal = normalizedTribals[tribalIndex];
          if (!tribal.bootCastawayId) {
            return NextResponse.json(
              { error: `Tribal ${tribalIndex + 1} boot castaway is required.` },
              { status: 400 }
            );
          }
          if (tribal.eliminationType !== "MEDEVAC") {
            if (tribal.bootVoteCount == null) {
              return NextResponse.json(
                { error: `Tribal ${tribalIndex + 1} boot vote count is required.` },
                { status: 400 }
              );
            }
            if (tribal.immunityType === "TRIBE") {
              if (tribal.immunityWinningTribes.length === 0) {
                return NextResponse.json(
                  {
                    error: `Tribal ${tribalIndex + 1} needs at least one winning tribe when immunity type is tribe.`,
                  },
                  { status: 400 }
                );
              }
              for (const tribe of tribal.immunityWinningTribes) {
                if (!validTribes.has(tribe)) {
                  return NextResponse.json(
                    {
                      error: `Tribal ${tribalIndex + 1} includes an unknown winning tribe (${tribe}).`,
                    },
                    { status: 400 }
                  );
                }
              }
            } else if (tribal.immunityWinnerCastawayIds.length === 0) {
              return NextResponse.json(
                {
                  error: `Tribal ${tribalIndex + 1} needs at least one immunity winner when immunity type is individual.`,
                },
                { status: 400 }
              );
            }
          }
          if (bootSet.has(tribal.bootCastawayId)) {
            return NextResponse.json(
              { error: "Boot castaways must be unique across tribal rows." },
              { status: 400 }
            );
          }
          bootSet.add(tribal.bootCastawayId);
          if (!castawayIdsInPayload.includes(tribal.bootCastawayId)) {
            return NextResponse.json(
              {
                error: `Tribal ${tribalIndex + 1} boot castaway must be included in castaway outcomes.`,
              },
              { status: 400 }
            );
          }
        }
      }

      const individualImmunityWinsByCastaway = new Map<string, number>();
      const tribeImmunityWinsByCastaway = new Map<string, number>();
      for (const row of parsedResults) {
        individualImmunityWinsByCastaway.set(row.castawayId, 0);
        tribeImmunityWinsByCastaway.set(row.castawayId, 0);
      }

      for (const tribal of normalizedTribals) {
        if (tribal.eliminationType === "MEDEVAC") continue;
        if (tribal.immunityType === "TRIBE") {
          const winningTribes = new Set(tribal.immunityWinningTribes);
          for (const row of parsedResults) {
            const tribe = castawayTribeById.get(row.castawayId) ?? null;
            if (!tribe || !winningTribes.has(tribe)) continue;
            tribeImmunityWinsByCastaway.set(
              row.castawayId,
              (tribeImmunityWinsByCastaway.get(row.castawayId) ?? 0) + 1
            );
          }
        } else {
          for (const winnerId of tribal.immunityWinnerCastawayIds) {
            individualImmunityWinsByCastaway.set(
              winnerId,
              (individualImmunityWinsByCastaway.get(winnerId) ?? 0) + 1
            );
          }
        }
      }

      const shouldAutoApplyImmunity = normalizedTribals.some(
        (tribal) =>
          tribal.eliminationType !== "MEDEVAC" &&
          ((tribal.immunityType === "TRIBE" && tribal.immunityWinningTribes.length > 0) ||
            (tribal.immunityType === "INDIVIDUAL" && tribal.immunityWinnerCastawayIds.length > 0))
      );

      const bootCastawayIdSet = new Set<string>(
        body.isNonElimination
          ? []
          : normalizedTribals
              .map((tribal) => tribal.bootCastawayId)
              .filter((castawayId): castawayId is string => castawayId != null)
      );

      const sanitizedResults: Array<{
        castawayId: string;
        survived: boolean;
        eliminated: boolean;
        individualImmunityWins: number;
        tribeImmunityWins: number;
        individualRewardWins: number;
        advantagesFound: number;
        idolsPlayedSuccessfully: number;
        votesReceived: number;
        confessionalCount: number;
        endgamePlacement: number | null;
      }> = parsedResults.map((row) => {
        const eliminated = bootCastawayIdSet.has(row.castawayId);
        return {
          ...row,
          individualImmunityWins: shouldAutoApplyImmunity
            ? individualImmunityWinsByCastaway.get(row.castawayId) ?? 0
            : row.individualImmunityWins,
          tribeImmunityWins: shouldAutoApplyImmunity
            ? tribeImmunityWinsByCastaway.get(row.castawayId) ?? 0
            : row.tribeImmunityWins,
          eliminated,
          survived: !eliminated,
        };
      });

      const savedWeek = await prisma.$transaction(async (tx) => {
        const beforeSnapshot = await computeLeagueRankSnapshot(tx, league.id, league.showType);
        const episodeForWeek = await tx.episode.upsert({
          where: { leagueId_week: { leagueId: league.id, week: weekNum } },
          create: { leagueId: league.id, week: weekNum },
          update: {},
          select: { id: true },
        });

        const firstTribal = normalizedTribals[0] ?? null;
        const secondTribal = normalizedTribals[1] ?? null;

        await tx.survivorEpisodeMeta.upsert({
          where: { episodeId: episodeForWeek.id },
          create: {
            leagueId: league.id,
            episodeId: episodeForWeek.id,
            tribalCount,
            tribals: normalizedTribals as unknown as Prisma.InputJsonValue,
            isMerge: !!body.isMerge,
            isNonElimination: !!body.isNonElimination,
            bootCastawayId: firstTribal?.bootCastawayId ?? null,
            secondaryBootCastawayId: secondTribal?.bootCastawayId ?? null,
            bootVoteCount: firstTribal?.bootVoteCount ?? null,
            secondaryBootVoteCount: secondTribal?.bootVoteCount ?? null,
            immunityWinnerCastawayId:
              firstTribal?.immunityWinnerCastawayIds[0] ??
              firstTribal?.immunityWinnerCastawayId ??
              null,
            secondaryImmunityWinnerCastawayId:
              secondTribal?.immunityWinnerCastawayIds[0] ??
              secondTribal?.immunityWinnerCastawayId ??
              null,
            lockedAt: new Date(),
          },
          update: {
            tribalCount,
            tribals: normalizedTribals as unknown as Prisma.InputJsonValue,
            isMerge: !!body.isMerge,
            isNonElimination: !!body.isNonElimination,
            bootCastawayId: firstTribal?.bootCastawayId ?? null,
            secondaryBootCastawayId: secondTribal?.bootCastawayId ?? null,
            bootVoteCount: firstTribal?.bootVoteCount ?? null,
            secondaryBootVoteCount: secondTribal?.bootVoteCount ?? null,
            immunityWinnerCastawayId:
              firstTribal?.immunityWinnerCastawayIds[0] ??
              firstTribal?.immunityWinnerCastawayId ??
              null,
            secondaryImmunityWinnerCastawayId:
              secondTribal?.immunityWinnerCastawayIds[0] ??
              secondTribal?.immunityWinnerCastawayId ??
              null,
            lockedAt: new Date(),
          },
        });

        await tx.survivorEpisodeCastawayResult.deleteMany({
          where: { episodeId: episodeForWeek.id },
        });
        await tx.survivorEpisodeCastawayResult.createMany({
          data: sanitizedResults.map((row) => ({
            leagueId: league.id,
            episodeId: episodeForWeek.id,
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
            endgamePlacement: row.endgamePlacement,
          })),
        });

        await recalculateConfessionalLeaders(tx, league.id);

        await tx.survivorCastaway.updateMany({
          where: { leagueId: league.id },
          data: { totalConfessionals: 0 },
        });

        const confessionalTotals = await tx.survivorEpisodeCastawayResult.groupBy({
          by: ["castawayId"],
          where: { leagueId: league.id },
          _sum: { confessionalCount: true },
        });

        await Promise.all(
          confessionalTotals.map((row) =>
            tx.survivorCastaway.update({
              where: { id: row.castawayId },
              data: { totalConfessionals: row._sum.confessionalCount ?? 0 },
            })
          )
        );

        await recalculateEliminationPlacements(tx, league.id);
        await recomputeSurvivorWeekScores(tx, league.id, episodeForWeek.id);
        const afterSnapshot = await computeLeagueRankSnapshot(tx, league.id, league.showType);
        return { episodeId: episodeForWeek.id, beforeSnapshot, afterSnapshot };
      });

      try {
        await sendWeekResultsPostedNotifications({
          leagueId: league.id,
          leagueName: league.name,
          week: weekNum,
          showType: league.showType,
          beforeSnapshot: savedWeek.beforeSnapshot,
          afterSnapshot: savedWeek.afterSnapshot,
        });
      } catch {
        // Keep weekly result submission resilient if push delivery fails.
      }

      return NextResponse.json({
        ok: true,
        episodeId: savedWeek.episodeId,
        message: "Survivor week saved and scores recomputed.",
      });
    }

    return NextResponse.json({ error: "Ruleset not implemented" }, { status: 400 });
  } catch (err) {
    console.error("Week PUT error", err);
    return prismaErrorToResponse(err);
  }
}
