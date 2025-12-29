"use client";

import { useMemo, useState } from "react";

type Queen = { id: string; name: string };
type Pick = { slot: number; queenId: string };

type Entry = {
  userId: string;
  user: { displayName: string | null; name: string | null; email: string | null };
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
  return e.user?.displayName || e.user?.name || e.user?.email || e.userId;
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
    setDraft((prev) => prev.map((p) => (p.slot === slot ? { ...p, queenId } : p)));
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
      if (unique.size !== 4) {
        throw new Error("Each slot must be a different queen.");
      }

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
    <div className="space-y-6">
      {/* MY PICKS */}
      <section className="rounded-3xl border border-border bg-card shadow-sm p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold flex items-center gap-2">
              🎯 Your Picks
            </h2>
            <p className="text-sm text-muted-foreground">
              Multipliers: 2.5× / 2.0× / 1.5× / 1.0×
            </p>

            {!canEdit ? (
              <p className="text-sm mt-2 text-amber-600">Picks are locked.</p>
            ) : (
              <p className="text-sm mt-2 text-muted-foreground">
                You can edit until the deadline.
              </p>
            )}
          </div>

          {/* Keep a small action on desktop, but don’t force layout on mobile */}
          <button
            onClick={save}
            disabled={!canEdit || saving}
            className="hidden sm:inline-flex rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold shadow-sm hover:shadow-md hover:-translate-y-0.5 transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Picks"}
          </button>
        </div>

        {(error || okMsg) && (
          <div className="mt-3 space-y-1">
            {error && <div className="text-sm text-destructive">{error}</div>}
            {okMsg && <div className="text-sm text-success">{okMsg}</div>}
          </div>
        )}

        {/* Mobile-first: stacked slot cards */}
        <div className="mt-4 space-y-3">
          {draft.map((p) => (
            <div
              key={p.slot}
              className="rounded-2xl border border-border bg-background/40 p-3 sm:p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">
                  Slot {p.slot}
                  <span className="ml-2 text-xs font-semibold text-muted-foreground">
                    ({MULTIPLIERS[p.slot]}×)
                  </span>
                </div>
              </div>

              <div className="relative mt-2">
                <select
                  value={p.queenId}
                  onChange={(e) => setSlot(p.slot, e.target.value)}
                  disabled={!canEdit}
                  className="w-full appearance-none rounded-xl border border-border bg-background px-3 pr-12 py-2 text-sm"
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

                {/* Custom dropdown caret */}
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  fill="currentColor"
                >
                  <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
                </svg>
              </div>

            </div>
          ))}
        </div>

        {/* Mobile save button lives under the fields */}
        <div className="mt-4 sm:hidden">
          <button
            onClick={save}
            disabled={!canEdit || saving}
            className="w-full rounded-2xl bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold shadow-sm transition disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Picks"}
          </button>
        </div>
      </section>

      {/* LEAGUE PICKS */}
      <section className="rounded-3xl border border-border bg-card shadow-sm p-4 sm:p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            👥 League Picks
          </h2>
          <span className="text-xs text-muted-foreground">
            {isCommissioner
              ? "Commissioner view"
              : revealAllowed
                ? "Revealed"
                : "Hidden until reveal"}
          </span>
        </div>

        {!canViewAll ? (
          <p className="text-sm text-muted-foreground">
            Picks are hidden until reveal.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="grid gap-3">
            {entries.map((e) => (
              <div
                key={e.userId}
                className="rounded-2xl border border-border bg-background/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">
                      {displayNameForEntry(e)}
                    </div>
                    {e.user?.email && (
                      <div className="text-xs text-muted-foreground truncate">
                        {e.user.email}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  {[1, 2, 3, 4].map((slot) => {
                    const pick = e.picks.find((x) => x.slot === slot);
                    const queenName =
                      queens.find((q) => q.id === pick?.queenId)?.name ?? "—";

                    return (
                      <div
                        key={slot}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/50 px-3 py-2 text-sm"
                      >
                        <div className="text-xs font-semibold text-muted-foreground">
                          Slot {slot}{" "}
                          <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                            {MULTIPLIERS[slot]}×
                          </span>
                        </div>

                        <div className="truncate text-right font-medium max-w-[65%]">
                          {queenName}
                        </div>
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
