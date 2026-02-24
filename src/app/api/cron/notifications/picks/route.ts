import { NextResponse } from "next/server";
import { ShowType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWebPushToUsers } from "@/lib/notifications/web-push";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";
import { survivorWeekPredictionLockAt } from "@/lib/survivor/survivor-rules";

const REMINDER_WINDOWS = [
  {
    label: "EARLY_24_TO_48_HOURS",
    minMs: 24 * 60 * 60 * 1000,
    maxMs: 48 * 60 * 60 * 1000,
    dragRaceTitleSuffix: "picks lock tomorrow",
    dragRaceBody: "Your league picks lock in about a day. Submit before lock.",
    survivorTitleSuffix: "weekly picks lock tomorrow",
    survivorBody: "Your weekly Survivor prediction locks in about a day.",
  },
  {
    label: "LATE_2_TO_4_HOURS",
    minMs: 2 * 60 * 60 * 1000,
    maxMs: 4 * 60 * 60 * 1000,
    dragRaceTitleSuffix: "picks lock tonight",
    dragRaceBody: "Your league picks lock in a few hours. Submit now.",
    survivorTitleSuffix: "weekly picks lock soon",
    survivorBody: "Your weekly Survivor prediction locks in a few hours.",
  },
] as const;

const DELIVERY_KIND = "PICKS_REMINDER";

function isCronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";

  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const fromHeader = req.headers.get("x-cron-secret")?.trim();

  return bearer === secret || fromHeader === secret;
}

function activeReminderWindows(lockAt: Date, now: Date) {
  const diffMs = lockAt.getTime() - now.getTime();
  if (diffMs <= 0) return [];

  return REMINDER_WINDOWS.filter((window) => diffMs <= window.maxMs && diffMs >= window.minMs);
}

async function sendWithDedupe(params: {
  recipients: Array<{ userId: string; dedupeKey: string }>;
  payload: { title: string; body: string; url: string; tag: string };
}) {
  if (params.recipients.length === 0) {
    return { eligibleCount: 0, deliveredCount: 0 };
  }

  const dedupeKeys = params.recipients.map((recipient) => recipient.dedupeKey);
  const alreadySent = await prisma.notificationDelivery.findMany({
    where: { dedupeKey: { in: dedupeKeys } },
    select: { dedupeKey: true },
  });
  const sentKeys = new Set(alreadySent.map((row) => row.dedupeKey));
  const eligible = params.recipients.filter((recipient) => !sentKeys.has(recipient.dedupeKey));

  if (eligible.length === 0) {
    return { eligibleCount: 0, deliveredCount: 0 };
  }

  const pushResult = await sendWebPushToUsers({
    userIds: eligible.map((recipient) => recipient.userId),
    payload: params.payload,
  });
  const deliveredIds = new Set(pushResult.deliveredUserIds);
  const deliveredRows = eligible.filter((recipient) => deliveredIds.has(recipient.userId));

  if (deliveredRows.length > 0) {
    await prisma.notificationDelivery.createMany({
      data: deliveredRows.map((recipient) => ({
        userId: recipient.userId,
        kind: DELIVERY_KIND,
        dedupeKey: recipient.dedupeKey,
      })),
      skipDuplicates: true,
    });
  }

  return { eligibleCount: eligible.length, deliveredCount: deliveredRows.length };
}

async function processDragRacePickReminders(now: Date) {
  const searchUntil = new Date(now.getTime() + REMINDER_WINDOWS[0].maxMs);

  const leagues = await prisma.league.findMany({
    where: {
      showType: ShowType.DRAG_RACE,
      startedAt: null,
      startsAt: { not: null },
      submissionDeadline: {
        not: null,
        lte: searchUntil,
      },
    },
    select: {
      id: true,
      name: true,
      startsAt: true,
      submissionDeadline: true,
      members: {
        select: { userId: true },
      },
      entries: {
        select: {
          userId: true,
          picks: {
            select: { id: true },
          },
        },
      },
    },
  });

  let eligibleCount = 0;
  let deliveredCount = 0;

  for (const league of leagues) {
    if (!league.startsAt || !league.submissionDeadline) continue;
    const lockAt = new Date(
      Math.min(league.submissionDeadline.getTime(), league.startsAt.getTime())
    );
    const windows = activeReminderWindows(lockAt, now);
    if (windows.length === 0) continue;

    const completeUserIds = new Set(
      league.entries.filter((entry) => entry.picks.length >= 4).map((entry) => entry.userId)
    );
    const missingUserIds = league.members
      .map((member) => member.userId)
      .filter((userId) => !completeUserIds.has(userId));
    if (missingUserIds.length === 0) continue;

    for (const window of windows) {
      const result = await sendWithDedupe({
        recipients: missingUserIds.map((userId) => ({
          userId,
          dedupeKey: `picks:drag-race:${league.id}:${lockAt.toISOString()}:${window.label}:${userId}`,
        })),
        payload: {
          title: `${league.name}: ${window.dragRaceTitleSuffix}`,
          body: window.dragRaceBody,
          url: `/leagues/${league.id}/picks`,
          tag: `drag-race-picks-${league.id}-${window.label}`,
        },
      });

      eligibleCount += result.eligibleCount;
      deliveredCount += result.deliveredCount;
    }
  }

  return { eligibleCount, deliveredCount };
}

async function processSurvivorPickReminders(now: Date) {
  const leagues = await prisma.league.findMany({
    where: {
      showType: ShowType.SURVIVOR,
      startsAt: { not: null },
    },
    select: {
      id: true,
      name: true,
      startsAt: true,
      members: {
        select: { userId: true },
      },
      episodes: {
        select: {
          week: true,
          lockedAt: true,
        },
      },
    },
  });

  let eligibleCount = 0;
  let deliveredCount = 0;

  for (const league of leagues) {
    if (!league.startsAt || league.members.length === 0) continue;
    const episodeLockByWeek = new Map(league.episodes.map((episode) => [episode.week, episode.lockedAt]));
    const memberUserIds = league.members.map((member) => member.userId);

    for (let week = 1; week <= SURVIVOR_SEASON_WEEKS; week += 1) {
      const lockAt = survivorWeekPredictionLockAt(
        league.startsAt,
        week,
        episodeLockByWeek.get(week) ?? null
      );
      if (!lockAt) continue;
      const windows = activeReminderWindows(lockAt, now);
      if (windows.length === 0) continue;

      const entries = await prisma.leagueEntry.findMany({
        where: {
          leagueId: league.id,
          userId: { in: memberUserIds },
        },
        select: {
          userId: true,
          survivorPredictions: {
            where: {
              episode: { week },
            },
            select: { id: true },
            take: 1,
          },
        },
      });

      const submitted = new Set(
        entries
          .filter((entry) => entry.survivorPredictions.length > 0)
          .map((entry) => entry.userId)
      );
      const missingUserIds = memberUserIds.filter((userId) => !submitted.has(userId));
      if (missingUserIds.length === 0) continue;

      for (const window of windows) {
        const result = await sendWithDedupe({
          recipients: missingUserIds.map((userId) => ({
            userId,
            dedupeKey: `picks:survivor:${league.id}:week-${week}:${lockAt.toISOString()}:${window.label}:${userId}`,
          })),
          payload: {
            title: `${league.name}: week ${week} ${window.survivorTitleSuffix}`,
            body: window.survivorBody,
            url: `/leagues/${league.id}/weeks/${week}`,
            tag: `survivor-picks-${league.id}-w${week}-${window.label}`,
          },
        });

        eligibleCount += result.eligibleCount;
        deliveredCount += result.deliveredCount;
      }
    }
  }

  return { eligibleCount, deliveredCount };
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const [dragRace, survivor] = await Promise.all([
    processDragRacePickReminders(now),
    processSurvivorPickReminders(now),
  ]);

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    windows: REMINDER_WINDOWS.map((window) => ({
      label: window.label,
      minHoursBeforeLock: Math.round(window.minMs / (60 * 60 * 1000)),
      maxHoursBeforeLock: Math.round(window.maxMs / (60 * 60 * 1000)),
    })),
    totals: {
      eligibleCount: dragRace.eligibleCount + survivor.eligibleCount,
      deliveredCount: dragRace.deliveredCount + survivor.deliveredCount,
    },
    dragRace,
    survivor,
  });
}
