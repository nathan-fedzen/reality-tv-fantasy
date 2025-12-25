"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StartLeagueButton({
  leagueId,
}: {
  leagueId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    const ok = window.confirm(
      "Start the league now?\n\nPicks will be locked and revealed to all players."
    );
    if (!ok) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/leagues/${leagueId}/start`, {
        method: "PATCH",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to start league");
      }

      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleStart}
        disabled={loading}
        className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-60"
      >
        {loading ? "Starting..." : "Start league now"}
      </button>

      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
