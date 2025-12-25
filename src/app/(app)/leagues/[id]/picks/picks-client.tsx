"use client";

import { useMemo, useState } from "react";

type Queen = { id: string; name: string };
type Pick = { slot: number; queenId: string };

type Entry = {
  userId: string;
  user: { name: string | null; email: string | null };
  picks: Pick[];
};

const MULTIPLIERS: Record<number, number> = {
  1: 2.5,
  2: 2.0,
  3: 1.5,
  4: 1.0,
};

function normalizeMyPicks(picks: Pick[]): Pick[] {
  const bySlot = new Map(picks.map((p) => [p.slot, p.queenId]));
  return [1, 2, 3, 4].map((slot) => ({
    slot,
    queenId: bySlot.get(slot) ?? "",
  }));
}

function displayNameForEntry(e: Entry) {
  return e.user?.name || e.user?.email || e.userId;
}

export default function PicksClient({
  leagueId,
  queens,
  myPicks,
  canEdit,
  revealAllowed,
  isCommissioner,
  entries,
}: {
  leagueId: string;
  queens: Queen[];
  myPicks: Pick[];
  canEdit: boolean;
  revealAllowed: boolean;
  isCommissioner: boolean;
  entries: Entry[];
}) {
  const [draft, setDraft] = useState<Pick[]>(() => normalizeMyPicks(myPicks));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const selectedQueenIds = useMemo(
    () => new Set(draft.map((d) => d.queenId).filter(Boolean)),
    [draft]
  );

  function setSlot(slot: number, queenId: string) {
    setError(null);
    setOkMsg(null);
    setDraft((prev) =>
      prev.map((p) => (p.slot === slot ? { ...p, queenId } : p))
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOkMsg(null);

    try {
      if (!canEdit) throw new Error("Picks are locked.");

      if (draft.some((p) => !p.queenId)) {
        throw new Error("Select a queen for all 4 slots.");
      }
      const unique = new Set(draft.map((p) => p.queenId));
      if (unique.size !== 4) throw new Error("Each slot must be a different queen.");

      const res = await fetch(`/api/leagues/${leagueId}/picks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: draft }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save picks.");

      setOkMsg("Saved!");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  const canViewAll = isCommissioner || revealAllowed;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-semibold">Your 4 Picks</h2>
            <p className="text-sm text-muted-foreground">
              Slots apply multipliers: 2.5x / 2.0x / 1.5x / 1.0x
            </p>

            {!canEdit ? (
              <p className="text-sm mt-2 text-amber-600">
                Picks are locked (deadline passed or league started/premiered).
              </p>
            ) : (
              <p className="text-sm mt-2 text-muted-foreground">
                You can edit until the submission deadline.
              </p>
            )}
          </div>

          <button
            onClick={save}
            disabled={!canEdit || saving}
            className="px-3 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Picks"}
          </button>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}
        {okMsg && <div className="text-sm text-green-600">{okMsg}</div>}

        <div className="grid gap-3">
          {draft.map((p) => (
            <div key={p.slot} className="flex items-center gap-3">
              <div className="w-36 text-sm font-medium">
                Slot {p.slot}{" "}
                <span className="text-muted-foreground">
                  ({MULTIPLIERS[p.slot]}x)
                </span>
              </div>

              <select
                value={p.queenId}
                onChange={(e) => setSlot(p.slot, e.target.value)}
                disabled={!canEdit}
                className="flex-1 border rounded px-2 py-2"
              >
                <option value="">Select a queen…</option>
                {queens.map((q) => {
                  const usedElsewhere = q.id !== p.queenId && selectedQueenIds.has(q.id);
                  return (
                    <option key={q.id} value={q.id} disabled={usedElsewhere}>
                      {q.name}
                    </option>
                  );
                })}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">League Picks</h2>
          <div className="text-xs text-muted-foreground">
            {isCommissioner
              ? "Commissioner view"
              : revealAllowed
              ? "Revealed"
              : "Hidden until reveal"}
          </div>
        </div>

        {!canViewAll ? (
          <p className="text-sm text-muted-foreground">
            Picks are hidden until reveal. You can only see your picks right now.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="grid gap-3">
            {entries.map((e) => (
              <div key={e.userId} className="rounded border p-3">
                <div className="text-sm font-medium">{displayNameForEntry(e)}</div>
                <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                  {[1, 2, 3, 4].map((slot) => {
                    const pick = e.picks.find((x) => x.slot === slot);
                    const queenName =
                      queens.find((q) => q.id === pick?.queenId)?.name ?? "—";
                    return (
                      <div key={slot}>
                        Slot {slot} ({MULTIPLIERS[slot]}x):{" "}
                        <span className="text-foreground">{queenName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
