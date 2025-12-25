"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteLeagueButton({
  leagueId,
  leagueName,
}: {
  leagueId: string;
  leagueName: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);

    const ok = window.confirm(
      `Delete league "${leagueName}"?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Delete failed (${res.status})`);
      }

      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "Delete failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onDelete}
        disabled={loading}
        className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"
      >
        {loading ? "Deleting..." : "Delete league"}
      </button>

      {error && <div className="text-xs text-red-600">{error}</div>}
    </div>
  );
}
