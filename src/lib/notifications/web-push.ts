import "server-only";

import webpush from "web-push";
import { prisma } from "@/lib/prisma";

type VapidConfig = {
  publicKey: string;
  privateKey: string;
  subject: string;
};

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type PushSubscriptionInput = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

let hasConfiguredWebPush = false;

function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY?.trim() ?? "";
  const subject =
    process.env.WEB_PUSH_SUBJECT?.trim() || "mailto:support@realitytvfantasy.app";

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function ensureWebPushConfigured() {
  if (hasConfiguredWebPush) return true;
  const config = getVapidConfig();
  if (!config) return false;
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  hasConfiguredWebPush = true;
  return true;
}

function getWebPushErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

function toWebPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}): webpush.PushSubscription {
  return {
    endpoint: input.endpoint,
    keys: {
      p256dh: input.p256dh,
      auth: input.auth,
    },
  };
}

export function isWebPushConfigured() {
  return !!getVapidConfig();
}

export function getWebPushPublicKey() {
  return getVapidConfig()?.publicKey ?? null;
}

export async function upsertPushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  userAgent?: string
) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
    update: {
      userId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
  });
}

export async function removePushSubscription(userId: string, endpoint?: string) {
  await prisma.pushSubscription.deleteMany({
    where: endpoint ? { userId, endpoint } : { userId },
  });
}

export async function sendWebPushToUsers(params: {
  userIds: string[];
  payload: PushPayload;
}) {
  const uniqueUserIds = Array.from(new Set(params.userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) {
    return { deliveredUserIds: [] as string[], attemptedSubscriptions: 0 };
  }

  if (!ensureWebPushConfigured()) {
    return { deliveredUserIds: [] as string[], attemptedSubscriptions: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: uniqueUserIds } },
    select: {
      id: true,
      userId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });

  if (subscriptions.length === 0) {
    return { deliveredUserIds: [] as string[], attemptedSubscriptions: 0 };
  }

  const deliveredUserIds = new Set<string>();
  const staleSubscriptionIds: string[] = [];
  const payloadJson = JSON.stringify(params.payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          toWebPushSubscription({
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          }),
          payloadJson
        );
        deliveredUserIds.add(subscription.userId);
      } catch (error) {
        const status = getWebPushErrorStatus(error);
        if (status === 404 || status === 410) {
          staleSubscriptionIds.push(subscription.id);
        }
      }
    })
  );

  if (staleSubscriptionIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: staleSubscriptionIds } },
    });
  }

  return {
    deliveredUserIds: Array.from(deliveredUserIds),
    attemptedSubscriptions: subscriptions.length,
  };
}
