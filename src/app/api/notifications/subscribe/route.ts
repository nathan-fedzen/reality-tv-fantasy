import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  isWebPushConfigured,
  removePushSubscription,
  upsertPushSubscription,
  type PushSubscriptionInput,
} from "@/lib/notifications/web-push";

function jsonError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function isValidSubscriptionPayload(value: unknown): value is PushSubscriptionInput {
  if (!value || typeof value !== "object") return false;
  const candidate = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (typeof candidate.endpoint !== "string" || candidate.endpoint.length < 1) return false;
  if (!candidate.endpoint.startsWith("https://")) return false;
  if (!candidate.keys || typeof candidate.keys !== "object") return false;
  if (typeof candidate.keys.p256dh !== "string" || candidate.keys.p256dh.length < 1) return false;
  if (typeof candidate.keys.auth !== "string" || candidate.keys.auth.length < 1) return false;
  return true;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);
  if (!isWebPushConfigured()) {
    return jsonError(
      "Push notifications are not configured. Missing WEB_PUSH_PUBLIC_KEY/WEB_PUSH_PRIVATE_KEY.",
      503
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;
  if (!isValidSubscriptionPayload(body)) {
    return jsonError("Invalid push subscription payload.");
  }

  await upsertPushSubscription(user.id, body, req.headers.get("user-agent") ?? undefined);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Unauthorized", 401);

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  const endpoint =
    body && typeof body.endpoint === "string" && body.endpoint.trim()
      ? body.endpoint.trim()
      : undefined;

  await removePushSubscription(user.id, endpoint);
  return NextResponse.json({ ok: true });
}
