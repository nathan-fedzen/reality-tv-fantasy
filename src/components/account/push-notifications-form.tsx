"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type PushServerConfig = {
  enabled: boolean;
  publicKey: string | null;
};

type PushSupport = "checking" | "unsupported" | "supported";

function supportsPushNotifications() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function toSubscriptionPayload(subscription: PushSubscription) {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh ?? "";
  const auth = json.keys?.auth ?? "";

  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: {
      p256dh,
      auth,
    },
  };
}

async function fetchServerConfig(): Promise<PushServerConfig> {
  const response = await fetch("/api/notifications/public-key", { cache: "no-store" });
  const json = (await response.json().catch(() => null)) as
    | { enabled?: boolean; publicKey?: string | null }
    | null;

  return {
    enabled: !!json?.enabled,
    publicKey: typeof json?.publicKey === "string" && json.publicKey ? json.publicKey : null,
  };
}

export default function PushNotificationsForm() {
  const [support, setSupport] = useState<PushSupport>("checking");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isConfigured, setIsConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canEnable = useMemo(
    () => support === "supported" && isConfigured && permission !== "denied",
    [isConfigured, permission, support]
  );

  const refresh = useCallback(async () => {
    if (!supportsPushNotifications()) {
      setSupport("unsupported");
      setPermission("default");
      setIsConfigured(false);
      setPublicKey(null);
      setIsSubscribed(false);
      return;
    }

    setSupport("supported");
    setPermission(Notification.permission);

    const config = await fetchServerConfig();
    setIsConfigured(config.enabled);
    setPublicKey(config.publicKey);

    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.getSubscription();
    setIsSubscribed(!!subscription);

    if (subscription && config.enabled) {
      const payload = toSubscriptionPayload(subscription);
      if (payload.keys.p256dh && payload.keys.auth) {
        await fetch("/api/notifications/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEnable = useCallback(async () => {
    if (!canEnable || !publicKey) return;
    setIsBusy(true);
    setMessage(null);
    try {
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      if (permissionResult !== "granted") {
        setMessage("Notifications are blocked. Enable them in browser settings.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        }));

      const payload = toSubscriptionPayload(subscription);
      if (!payload.keys.p256dh || !payload.keys.auth) {
        setMessage("Could not read push subscription keys from this browser.");
        return;
      }

      const response = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(json?.error ?? "Failed to save notification subscription.");
        return;
      }

      setIsSubscribed(true);
      setMessage("Notifications enabled.");
    } catch {
      setMessage("Failed to enable notifications.");
    } finally {
      setIsBusy(false);
    }
  }, [canEnable, publicKey]);

  const onDisable = useCallback(async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      const endpoint = subscription?.endpoint ?? undefined;

      await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(endpoint ? { endpoint } : {}),
      });

      if (subscription) {
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      setMessage("Notifications disabled on this device.");
    } catch {
      setMessage("Failed to disable notifications.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  const onSendTest = useCallback(async () => {
    setIsBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/notifications/test", { method: "POST" });
      const json = (await response.json().catch(() => null)) as
        | { delivered?: boolean; error?: string }
        | null;

      if (!response.ok) {
        setMessage(json?.error ?? "Could not send a test notification.");
        return;
      }

      setMessage(json?.delivered ? "Test notification sent." : "No active subscription yet.");
    } catch {
      setMessage("Could not send a test notification.");
    } finally {
      setIsBusy(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Enable push notifications for league chat and pick reminders.
      </p>

      {support === "unsupported" && (
        <p className="text-sm text-amber-600">
          This browser/device does not support web push notifications.
        </p>
      )}
      {support === "supported" && !isConfigured && (
        <p className="text-sm text-amber-600">
          Push notifications are not configured on the server yet.
        </p>
      )}
      {support === "supported" && permission === "denied" && (
        <p className="text-sm text-amber-600">
          Notifications are blocked in browser settings for this app.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isSubscribed ? (
          <button
            type="button"
            onClick={onEnable}
            disabled={!canEnable || isBusy}
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            {isBusy ? "Enabling..." : "Enable notifications"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onDisable}
              disabled={isBusy}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              {isBusy ? "Saving..." : "Disable notifications"}
            </button>
            <button
              type="button"
              onClick={onSendTest}
              disabled={isBusy}
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              Send test notification
            </button>
          </>
        )}
      </div>

      <div className="rounded-md border border-border/70 bg-background/60 p-3 text-xs text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Phone setup (for push notifications)</p>
        <div>
          <p className="font-medium">iPhone (Safari)</p>
          <ol className="mt-1 list-decimal pl-4 space-y-0.5">
            <li>Open this site in Safari.</li>
            <li>Tap Share, then tap Add to Home Screen.</li>
            <li>Tap Add, then open the app icon from your Home Screen.</li>
            <li>Return here and tap Enable notifications.</li>
          </ol>
        </div>
        <div>
          <p className="font-medium">Android (Chrome)</p>
          <ol className="mt-1 list-decimal pl-4 space-y-0.5">
            <li>Open this site in Chrome.</li>
            <li>Tap the menu (three dots).</li>
            <li>Tap Add to Home screen or Install app.</li>
            <li>Open it from your Home Screen, then tap Enable notifications here.</li>
          </ol>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Status:{" "}
        {isSubscribed
          ? "enabled on this device"
          : support === "unsupported"
            ? "unsupported"
            : "not enabled"}
      </p>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
