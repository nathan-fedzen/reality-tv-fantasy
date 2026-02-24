"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConfettiBurst from "@/components/confetti-burst";
import {
  getPickInRound,
  getRoundForOverallPick,
  getSnakeSeatForOverallPick,
} from "@/lib/survivor/draft-engine";

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
    undraftedCastawayCount: number;
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

type DraftQueueItem = {
  overallPick: number;
  round: number;
  pickInRound: number;
  seat: number;
  userId: string;
  displayName: string;
  isCurrent: boolean;
  isMine: boolean;
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
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tribeFilter, setTribeFilter] = useState("ALL");
  const [showDrafted, setShowDrafted] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [confettiKey, setConfettiKey] = useState("draft-init");

  const initializedRef = useRef(false);
  const prevPickCountRef = useRef(0);
  const prevMyPickCountRef = useRef(0);

  const loadState = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      try {
        if (silent) setSyncing(true);

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

        const totalPicks = data.draft.picks.length;
        const myPicks = data.draft.picks.filter(
          (pick) => pick.userId === data.viewer.userId
        ).length;

        if (initializedRef.current && totalPicks > prevPickCountRef.current) {
          const latest = data.draft.picks[data.draft.picks.length - 1];
          if (latest) {
            setActivity(
              `New pick: #${latest.overallPick} ${latest.displayName} drafted ${latest.castawayName}.`
            );
          }
        }

        if (initializedRef.current && myPicks > prevMyPickCountRef.current) {
          setConfettiKey(`${Date.now()}-${myPicks}`);
        }

        prevPickCountRef.current = totalPicks;
        prevMyPickCountRef.current = myPicks;
        initializedRef.current = true;

        setState(data);
        setLastSyncedAt(new Date());
        setError(null);
      } finally {
        if (silent) setSyncing(false);
      }
    },
    [leagueId]
  );

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

    const intervalMs = state.draft.isMyTurn ? 2200 : 5000;
    const timer = setInterval(() => {
      loadState({ silent: true }).catch(() => {
        setSyncing(false);
      });
    }, intervalMs);

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

  const tribeOptions = useMemo(() => {
    if (!state) return [] as string[];
    const unique = new Set<string>();
    for (const castaway of state.castaways) {
      if (castaway.tribe) unique.add(castaway.tribe);
    }
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
  }, [state]);

  const filteredCastaways = useMemo(() => {
    if (!state) return [] as Castaway[];

    const q = search.trim().toLowerCase();
    const out = state.castaways.filter((castaway) => {
      if (!showDrafted && castaway.draftedBy) return false;
      if (tribeFilter !== "ALL" && (castaway.tribe ?? "Unassigned") !== tribeFilter) {
        return false;
      }
      if (!q) return true;

      const haystack = `${castaway.name} ${castaway.tribe ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });

    out.sort((a, b) => {
      const aDrafted = a.draftedBy ? 1 : 0;
      const bDrafted = b.draftedBy ? 1 : 0;
      if (aDrafted !== bDrafted) return aDrafted - bDrafted;
      return a.name.localeCompare(b.name);
    });

    return out;
  }, [state, search, showDrafted, tribeFilter]);

  const mySeat = useMemo(() => {
    if (!state) return null;
    return state.draft.seats.find((seat) => seat.userId === state.viewer.userId) ?? null;
  }, [state]);

  const myPicks = useMemo(() => {
    if (!state) return [] as DraftPick[];
    return picksByUser.get(state.viewer.userId) ?? [];
  }, [state, picksByUser]);

  const turnQueue = useMemo(() => {
    if (
      !state ||
      state.draft.status !== "IN_PROGRESS" ||
      !state.draft.currentOverallPick ||
      state.draft.seats.length === 0
    ) {
      return [] as DraftQueueItem[];
    }

    const bySeat = new Map(state.draft.seats.map((seat) => [seat.seat, seat]));
    const end = Math.min(state.draft.totalPicks, state.draft.currentOverallPick + 11);
    const out: DraftQueueItem[] = [];

    for (let overallPick = state.draft.currentOverallPick; overallPick <= end; overallPick += 1) {
      const seat = getSnakeSeatForOverallPick(state.draft.seats.length, overallPick);
      const seatRow = bySeat.get(seat);
      if (!seatRow) continue;

      out.push({
        overallPick,
        round: getRoundForOverallPick(state.draft.seats.length, overallPick),
        pickInRound: getPickInRound(state.draft.seats.length, overallPick),
        seat,
        userId: seatRow.userId,
        displayName: seatRow.displayName,
        isCurrent: overallPick === state.draft.currentOverallPick,
        isMine: seatRow.userId === state.viewer.userId,
      });
    }

    return out;
  }, [state]);

  const draftProgress = useMemo(() => {
    if (!state) return 0;
    if (state.draft.totalPicks <= 0) return 0;
    return Math.min(100, Math.round((state.draft.picks.length / state.draft.totalPicks) * 100));
  }, [state]);

  const lastSyncText = useMemo(() => {
    if (!lastSyncedAt) return "Never";
    return lastSyncedAt.toLocaleTimeString();
  }, [lastSyncedAt]);

  async function refreshNow() {
    setError(null);
    setMessage(null);

    try {
      await loadState({ silent: true });
      setMessage("Draft room refreshed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to refresh draft room.";
      setError(msg);
    }
  }

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
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">Loading draft room...</p>
      </section>
    );
  }

  if (!state) {
    return (
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-destructive">{error ?? "Draft room unavailable."}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm">
        <ConfettiBurst triggerKey={confettiKey} count={26} />

        <div className="pointer-events-none absolute -top-10 -right-16 h-44 w-44 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-16 h-44 w-44 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative z-10 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Survivor Snake Draft</h2>
              <p className="text-sm text-muted-foreground">Status: {state.draft.status}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={refreshNow}
                disabled={busy || syncing}
                className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
              >
                {syncing ? "Syncing..." : "Refresh"}
              </button>

              {state.draft.status === "NOT_STARTED" && state.viewer.isCommissioner && (
                <button
                  onClick={startDraft}
                  disabled={!state.startChecks.canStart || busy}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Starting..." : "Start Draft"}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>
              Members: {state.startChecks.memberCount} | Castaways: {state.startChecks.castawayCount}
              {" | "}
              Picks per entry: {state.draft.picksPerEntry ?? "-"} | Undrafted leftovers: {state.startChecks.undraftedCastawayCount}
            </p>
            <p>
              Picks made: {state.draft.picks.length}/{state.draft.totalPicks} ({draftProgress}%) | Last sync: {lastSyncText}
            </p>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-background/70 ring-1 ring-border">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-pink-500 to-violet-500 transition-all"
              style={{ width: `${draftProgress}%` }}
            />
          </div>

          {state.draft.currentTurn && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                state.draft.isMyTurn
                  ? "border-emerald-400/50 bg-emerald-500/10"
                  : "border-border bg-background/50"
              }`}
            >
              <p className="font-semibold">
                {state.draft.isMyTurn ? "Your turn to draft." : `Current turn: ${state.draft.currentTurn.displayName}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Pick #{state.draft.currentTurn.overallPick} - Round {state.draft.currentTurn.round} - Seat {state.draft.currentTurn.seat}
              </p>
            </div>
          )}

          {state.draft.status === "NOT_STARTED" && state.startChecks.issues.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
              {state.startChecks.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          {(activity || error || message) && (
            <div className="space-y-1 text-sm">
              {activity && <p className="text-cyan-700">{activity}</p>}
              {error && <p className="text-destructive">{error}</p>}
              {message && <p className="text-emerald-700">{message}</p>}
            </div>
          )}
        </div>
      </section>

      {turnQueue.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <h3 className="text-sm font-semibold">On Deck</h3>
          <p className="mt-1 text-xs text-muted-foreground">Live queue for the next picks in snake order.</p>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {turnQueue.map((item) => (
              <div
                key={item.overallPick}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  item.isCurrent
                    ? "border-primary/50 bg-primary/10"
                    : item.isMine
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-border bg-background/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">#{item.overallPick}</span>
                  <span className="text-xs text-muted-foreground">R{item.round} P{item.pickInRound}</span>
                </div>
                <p className="mt-1 truncate font-medium">{item.displayName}</p>
                <p className="text-xs text-muted-foreground">Seat {item.seat}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Cast Board</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Search and filter castaways, then draft when it is your turn.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search castaway"
            className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none ring-0 focus:border-primary/60"
          />
          <select
            value={tribeFilter}
            onChange={(e) => setTribeFilter(e.target.value)}
            className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none ring-0 focus:border-primary/60"
          >
            <option value="ALL">All tribes</option>
            <option value="Unassigned">Unassigned</option>
            {tribeOptions.map((tribe) => (
              <option key={tribe} value={tribe}>
                {tribe}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={showDrafted}
              onChange={(e) => setShowDrafted(e.target.checked)}
            />
            Show drafted
          </label>

          <div className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
            Showing {filteredCastaways.length} of {state.castaways.length}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCastaways.map((castaway) => {
            const drafted = !!castaway.draftedBy;
            const draftedByMe = castaway.draftedBy?.userId === state.viewer.userId;
            const canPick =
              state.draft.status === "IN_PROGRESS" && state.draft.isMyTurn && !drafted && !busy;

            return (
              <button
                key={castaway.id}
                disabled={!canPick}
                onClick={() => makePick(castaway.id)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  canPick
                    ? "border-primary/50 bg-gradient-to-br from-primary/15 to-violet-500/10 hover:-translate-y-0.5 hover:border-primary"
                    : draftedByMe
                      ? "border-emerald-500/35 bg-emerald-500/10"
                      : "border-border bg-background/60"
                } disabled:cursor-not-allowed disabled:opacity-80`}
              >
                <div className="truncate font-medium">{castaway.name}</div>
                <div className="text-xs text-muted-foreground">{castaway.tribe ?? "Unassigned"}</div>

                {castaway.draftedBy ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Pick #{castaway.draftedBy.overallPick} by {castaway.draftedBy.displayName}
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-emerald-700">Available</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">Draft Order</h3>
          {mySeat && (
            <p className="text-xs text-muted-foreground">
              You are Seat {mySeat.seat} with {myPicks.length}/{state.draft.picksPerEntry ?? 0} picks.
            </p>
          )}
        </div>

        {state.draft.seats.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Seats will appear when draft starts.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {state.draft.seats.map((seat) => {
              const isCurrent = state.draft.currentTurn?.seat === seat.seat;
              const isMe = seat.userId === state.viewer.userId;

              return (
                <li
                  key={seat.seat}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                    isCurrent
                      ? "border-primary/50 bg-primary/10"
                      : isMe
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : "border-border bg-background/60"
                  }`}
                >
                  <span className="font-medium">Seat {seat.seat}</span>
                  <span className="truncate text-muted-foreground">{seat.displayName}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Rosters</h3>
        {state.draft.seats.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Rosters populate after draft starts.</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {state.draft.seats.map((seat) => {
              const picks = picksByUser.get(seat.userId) ?? [];
              const pct = state.draft.picksPerEntry
                ? Math.round((picks.length / state.draft.picksPerEntry) * 100)
                : 0;

              return (
                <div
                  key={seat.seat}
                  className="rounded-xl border border-border bg-background/60 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{seat.displayName}</p>
                    <p className="text-xs text-muted-foreground">
                      {picks.length}/{state.draft.picksPerEntry ?? 0}
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-background/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-violet-500"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {picks.length === 0 ? (
                      <li className="text-muted-foreground">No picks yet.</li>
                    ) : (
                      picks.map((pick) => (
                        <li key={`${pick.overallPick}-${pick.castawayId}`}>
                          #{pick.overallPick} - {pick.castawayName}
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

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h3 className="text-sm font-semibold">Pick History</h3>
        {state.draft.picks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No picks submitted yet.</p>
        ) : (
          <ol className="mt-3 space-y-1 text-sm">
            {state.draft.picks.map((pick) => (
              <li key={`${pick.overallPick}-${pick.castawayId}`}>
                #{pick.overallPick} - {pick.displayName} drafted {pick.castawayName}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
