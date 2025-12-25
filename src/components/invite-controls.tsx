"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function InviteControls({
  leagueId,
  isActive,
}: {
  leagueId: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<null | "toggle" | "regen">(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleInvite(nextActive: boolean) {
    setError(null);
    setLoading("toggle");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/invite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoading(null);
    }
  }

  async function regenerate() {
    setError(null);
    const ok = window.confirm(
      "Regenerate invite link?\n\nOld invite links will stop working."
    );
    if (!ok) return;

    setLoading("regen");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/invite`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => toggleInvite(!isActive)}
          disabled={loading !== null}
          className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {loading === "toggle"
            ? "Saving..."
            : isActive
            ? "Disable invite"
            : "Enable invite"}
        </button>

        <button
          type="button"
          onClick={regenerate}
          disabled={loading !== null}
          className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {loading === "regen" ? "Regenerating..." : "Regenerate link"}
        </button>
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
