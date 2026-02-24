import { NextResponse } from "next/server";
import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/notifications/web-push";

export async function GET() {
  const publicKey = getWebPushPublicKey();

  return NextResponse.json({
    enabled: isWebPushConfigured(),
    publicKey,
  });
}
