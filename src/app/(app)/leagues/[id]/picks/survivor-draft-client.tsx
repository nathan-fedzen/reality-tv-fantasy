"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DraftSeat = {
  seat: number;
  userId: string;
  displayName: string;
};

type DraftPick = {
  overallPick: number;
  round: number;
  pickInRound: number;
  castawayId: string;
  castawayName: string;
  castawayTribe: string | null;
  userId: string;
  displayName: string;
};

type DraftTurn = {
  overallPick: number;
  round: number;
  pickInRound: number;
  seat: number;
  userId: string;
  displayName: string;
} | null;

type Castaway = {
  id: string;
  name: string;
  tribe: string | null;
  draftedBy:
    | {
        overallPick: number;
        round: number;
        pickInRound: number;
        userId: string;
        displayName: string;
      }
    | null;
};

type DraftStateResponse = {
  league: { id: string; name: string };
  viewer: { userId: string; isCommissioner: boolean };
  startChecks: {
    canStart: boolean;
    issues: string[];
    memberCount: number;
    castawayCount: number;
    picksPerEntry: number | null;
  };
  draft: {
    id: string | null;
    status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
    picksPerEntry: number | null;
    totalRounds: number | null;
    totalPicks: number;
    currentOverallPick: number | null;
    startedAt: string | null;
    completedAt: string | null;
    seats: DraftSeat[];
    currentTurn: DraftTurn;
    isMyTurn: boolean;
    picks: DraftPick[];
  };
  castaways: Castaway[];
};

async function readJson<T>(res: Response): Promise<T | null> {
  const raw = await res.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default function SurvivorDraftClient({ leagueId }: { leagueId: string }) {
  const [state, setState] = useState<DraftStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/survivor/draft`, {
      cache: "no-store",
    });
    const data = await readJson<DraftStateResponse & { error?: string }>(res);

    if (!res.ok) {
      throw new Error(data?.error ?? "Failed to load draft room.");
    }

    if (!data) {
      throw new Error("Draft room returned an empty response.");
    }

    setState(data);
  }, [leagueId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadState();
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Failed to load draft room.";
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [loadState]);

  useEffect(() => {
    if (!state || state.draft.status !== "IN_PROGRESS") return;

    const timer = setInterval(() => {
      loadState().catch(() => {
        // Ignore polling errors; user can manually retry by refreshing page.
      });
    }, 5000);

    return () => clearInterval(timer);
  }, [state, loadState]);

  const picksByUser = useMemo(() => {
    if (!state) return new Map<string, DraftPick[]>();

    const map = new Map<string, DraftPick[]>();
    for (const pick of state.draft.picks) {
      const existing = map.get(pick.userId) ?? [];
      existing.push(pick);
      map.set(pick.userId, existing);
    }
    for (const picks of map.values()) {
      picks.sort((a, b) => a.overallPick - b.overallPick);
    }
    return map;
  }, [state]);

  async function startDraft() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/survivor/draft/start`, {
        method: "POST",
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to start draft.");
      }
      setMessage("Draft started.");
      await loadState();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start draft.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function makePick(castawayId: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/survivor/draft/pick`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ castawayId }),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to submit pick.");
      }
      setMessage("Pick submitted.");
      await loadState();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to submit pick.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !state) {
    return (
      <section className="rounded-3xl border border-border bg-card shadow-sm p-5">
        <p className="text-sm text-muted-foreground">Loading draft room...</p>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="rounded-3xl border border-border bg-card shadow-sm p-5">
        <p className="text-sm text-destructive">{error ?? "Draft room unavailable."}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card shadow-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Survivor Snake Draft</h2>
            <p className="text-sm text-muted-foreground">
              Status: {state.draft.status}
            </p>
          </div>

          {state.draft.status === "NOT_STARTED" && state.viewer.isCommissioner && (
            <button
              onClick={startDraft}
              disabled={!state.startChecks.canStart || busy}
              className="rounded-2xl bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {busy ? "Starting..." : "Start Draft"}
            </button>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Members: {state.startChecks.memberCount} · Castaways: {state.startChecks.castawayCount}
          {" · "}
          Picks per entry: {state.draft.picksPerEntry ?? "—"}
        </p>

        {state.draft.currentTurn && (
          <p className="text-sm">
            Current turn:{" "}
            <span className="font-semibold">{state.draft.currentTurn.displayName}</span>
            {" · "}
            Pick #{state.draft.currentTurn.overallPick} (Round {state.draft.currentTurn.round})
          </p>
        )}

        {state.draft.status === "NOT_STARTED" && state.startChecks.issues.length > 0 && (
          <ul className="text-sm text-amber-700 list-disc pl-5 space-y-1">
            {state.startChecks.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}

        {(error || message) && (
          <div className="space-y-1 text-sm">
            {error && <p className="text-destructive">{error}</p>}
            {message && <p className="text-emerald-700">{message}</p>}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card shadow-sm p-5">
        <h3 className="text-sm font-semibold">Draft Order</h3>
        {state.draft.seats.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Seats will appear when draft starts.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {state.draft.seats.map((seat) => (
              <li
                key={seat.seat}
                className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2"
              >
                <span className="font-medium">Seat {seat.seat}</span>
                <span className="truncate text-muted-foreground">{seat.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card shadow-sm p-5">
        <h3 className="text-sm font-semibold">Cast Board</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Select an undrafted castaway when it is your turn.
        </p>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {state.castaways.map((castaway) => {
            const drafted = !!castaway.draftedBy;
            const canPick =
              state.draft.status === "IN_PROGRESS" &&
              state.draft.isMyTurn &&
              !drafted &&
              !busy;

            return (
              <button
                key={castaway.id}
                disabled={!canPick}
                onClick={() => makePick(castaway.id)}
                className="text-left rounded-xl border border-border bg-background/60 px-3 py-2 disabled:opacity-60"
              >
                <div className="font-medium truncate">{castaway.name}</div>
                <div className="text-xs text-muted-foreground">
                  {castaway.tribe ?? "Unassigned"}
                </div>
                {castaway.draftedBy && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Pick #{castaway.draftedBy.overallPick} by {castaway.draftedBy.displayName}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card shadow-sm p-5">
        <h3 className="text-sm font-semibold">Rosters</h3>
        {state.draft.seats.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Rosters populate after draft starts.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {state.draft.seats.map((seat) => {
              const picks = picksByUser.get(seat.userId) ?? [];
              return (
                <div
                  key={seat.seat}
                  className="rounded-xl border border-border bg-background/60 px-3 py-3"
                >
                  <p className="text-sm font-semibold">{seat.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {picks.length}/{state.draft.picksPerEntry ?? 0} picks
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {picks.length === 0 ? (
                      <li className="text-muted-foreground">No picks yet.</li>
                    ) : (
                      picks.map((pick) => (
                        <li key={`${pick.overallPick}-${pick.castawayId}`}>
                          #{pick.overallPick} · {pick.castawayName}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card shadow-sm p-5">
        <h3 className="text-sm font-semibold">Pick History</h3>
        {state.draft.picks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No picks submitted yet.</p>
        ) : (
          <ol className="mt-3 space-y-1 text-sm">
            {state.draft.picks.map((pick) => (
              <li key={`${pick.overallPick}-${pick.castawayId}`}>
                #{pick.overallPick} · {pick.displayName} drafted {pick.castawayName}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
