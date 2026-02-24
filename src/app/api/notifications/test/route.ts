import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendWebPushToUsers } from "@/lib/notifications/web-push";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await sendWebPushToUsers({
    userIds: [user.id],
    payload: {
      title: "Reality TV Fantasy",
      body: "Push notifications are enabled on this device.",
      url: "/account",
      tag: "notifications-test",
    },
  });

  return NextResponse.json({
    ok: true,
    delivered: result.deliveredUserIds.includes(user.id),
    attemptedSubscriptions: result.attemptedSubscriptions,
  });
}
