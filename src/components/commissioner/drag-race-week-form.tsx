"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type QueenOption = { id: string; name: string };
type ExistingResult = { id: string; type: string; queenId: string | null };

// NEW: finale model shapes coming from Prisma include
type ExistingFinalePlacement = { id: string; queenId: string; place: number };
type ExistingFinaleExtra = {
  id: string;
  queenId: string;
  miniWins: number;
  mainWins: number;
  lipsyncWins: number;
};

type EpisodeType = "REGULAR" | "FINALE";

export default function DragRaceWeekForm(props: {
  leagueId: string;
  week: number;
  queens: QueenOption[];
  existingResults: ExistingResult[];

  // ✅ NEW
  episodeType: EpisodeType;
  existingFinalePlacements: ExistingFinalePlacement[];
  existingFinaleExtras: ExistingFinaleExtra[];

  isCommissioner: boolean;
  hasStarted: boolean;
}) {
  const {
    leagueId,
    week,
    queens,
    existingResults,
    episodeType,
    existingFinalePlacements,
    existingFinaleExtras,
    isCommissioner,
    hasStarted,
  } = props;

  const disabled = !hasStarted || !isCommissioner;
  const [isPending, startTransition] = useTransition();

  // ----------------------------
  // Regular-week existing parsing
  // ----------------------------
  const existing = useMemo(() => {
    const mini = existingResults
      .filter((r) => r.type === "mini")
      .map((r) => r.queenId!)
      .filter(Boolean);

    const main = existingResults
      .filter((r) => r.type === "main")
      .map((r) => r.queenId!)
      .filter(Boolean);

    const lipsync = existingResults.find((r) => r.type === "lipsync")?.queenId ?? "";
    const elim = existingResults.find((r) => r.type === "elimination")?.queenId ?? null;

    return { mini, main, lipsync, elim };
  }, [existingResults]);

  const [miniWinners, setMiniWinners] = useState<string[]>(
    existing.mini.length ? existing.mini : [""]
  );
  const [mainWinners, setMainWinners] = useState<string[]>(
    existing.main.length ? existing.main : [""]
  );
  const [lipsyncWinner, setLipsyncWinner] = useState<string>(existing.lipsync || "");
  const [noElimination, setNoElimination] = useState<boolean>(existing.elim === null);
  const [eliminatedQueenId, setEliminatedQueenId] = useState<string>(existing.elim ?? "");
  const [message, setMessage] = useState<string>("");

  function updateAt(setter: (v: string[]) => void, arr: string[], idx: number, val: string) {
    const next = [...arr];
    next[idx] = val;
    setter(next);
  }

  function addWinner(setter: (v: string[]) => void, arr: string[]) {
    setter([...arr, ""]);
  }

  async function onSaveRegular() {
    setMessage("");

    const mini = miniWinners.filter(Boolean);
    const main = mainWinners.filter(Boolean);

    if (mini.length < 1) return setMessage("Mini challenge requires at least 1 winner.");
    if (main.length < 1) return setMessage("Main challenge requires at least 1 winner.");
    if (!lipsyncWinner) return setMessage("Lip sync winner is required.");

    const payload = {
      miniWinners: mini,
      mainWinners: main,
      lipsyncWinner,
      eliminatedQueenId: noElimination ? null : (eliminatedQueenId || null),
    };

    startTransition(async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${week}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json?.error || "Failed to save results.");
        return;
      }

      setMessage("Saved. Scores were recalculated.");
      window.location.reload();
    });
  }

  // ----------------------------
  // Finale state + helpers
  // ----------------------------
  const existingPlacementByPlace = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of existingFinalePlacements) map.set(p.place, p.queenId);
    return map;
  }, [existingFinalePlacements]);

  const existingExtrasByQueen = useMemo(() => {
    const map = new Map<string, ExistingFinaleExtra>();
    for (const e of existingFinaleExtras) map.set(e.queenId, e);
    return map;
  }, [existingFinaleExtras]);

  const [place1, setPlace1] = useState(existingPlacementByPlace.get(1) ?? "");
  const [place2, setPlace2] = useState(existingPlacementByPlace.get(2) ?? "");
  const [place3, setPlace3] = useState(existingPlacementByPlace.get(3) ?? "");
  const [place4, setPlace4] = useState(existingPlacementByPlace.get(4) ?? "");

  function initialExtra(qid: string) {
    const e = existingExtrasByQueen.get(qid);
    return {
      miniWins: e?.miniWins ?? 0,
      mainWins: e?.mainWins ?? 0,
      lipsyncWins: e?.lipsyncWins ?? 0,
    };
  }

  // Keep extras keyed by queenId
  const [extras, setExtras] = useState<Record<string, { miniWins: number; mainWins: number; lipsyncWins: number }>>(
    () => {
      const init: Record<string, { miniWins: number; mainWins: number; lipsyncWins: number }> = {};
      for (const q of [place1, place2, place3, place4].filter(Boolean)) {
        init[q] = initialExtra(q);
      }
      return init;
    }
  );

  function syncExtrasForSelection(nextQueenIds: string[]) {
    setExtras((prev) => {
      const next: typeof prev = { ...prev };
      // add missing
      for (const qid of nextQueenIds) {
        if (!next[qid]) next[qid] = initialExtra(qid);
      }
      // remove unselected
      for (const key of Object.keys(next)) {
        if (!nextQueenIds.includes(key)) delete next[key];
      }
      return next;
    });
  }

  function setPlace(which: 1 | 2 | 3 | 4, qid: string) {
    if (which === 1) setPlace1(qid);
    if (which === 2) setPlace2(qid);
    if (which === 3) setPlace3(qid);
    if (which === 4) setPlace4(qid);

    const next = [
      which === 1 ? qid : place1,
      which === 2 ? qid : place2,
      which === 3 ? qid : place3,
      which === 4 ? qid : place4,
    ].filter(Boolean);

    syncExtrasForSelection(next);
  }

  function validateFinale(): { placements: { queenId: string; place: number }[] } | null {
    const ids = [place1, place2, place3, place4];

    if (ids.some((x) => !x)) {
      setMessage("Finale requires selecting all 4 placements (1st–4th).");
      return null;
    }

    const uniq = new Set(ids);
    if (uniq.size !== 4) {
      setMessage("Placements must be 4 different queens (no duplicates).");
      return null;
    }

    return {
      placements: [
        { queenId: place1, place: 1 },
        { queenId: place2, place: 2 },
        { queenId: place3, place: 3 },
        { queenId: place4, place: 4 },
      ],
    };
  }

  async function onConvertToFinale() {
    setMessage("");

    startTransition(async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${week}/finale`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json?.error || "Failed to convert week to finale.");
        return;
      }

      setMessage("Converted to finale. Reloading…");
      window.location.reload();
    });
  }

  async function onSaveFinale(finalize: boolean) {
    setMessage("");

    const v = validateFinale();
    if (!v) return;

    const selected = v.placements.map((p) => p.queenId);

    const payload = {
      placements: v.placements,
      extras: selected.map((queenId) => ({
        queenId,
        miniWins: extras[queenId]?.miniWins ?? 0,
        mainWins: extras[queenId]?.mainWins ?? 0,
        lipsyncWins: extras[queenId]?.lipsyncWins ?? 0,
      })),
      finalize,
    };

    startTransition(async () => {
      const res = await fetch(`/api/leagues/${leagueId}/weeks/${week}/finale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(json?.error || "Failed to save finale.");
        return;
      }

      setMessage(finalize ? "Finale saved. Season complete!" : "Finale saved. Scores recalculated.");
      window.location.reload();
    });
  }

  // ----------------------------
  // Read-only view for non-commissioners
  // ----------------------------
  if (!isCommissioner) {
    return (
      <div className="rounded-md border p-3 text-sm">
        <div className="font-medium">Results</div>
        {!hasStarted && (
          <p className="mt-2 text-xs text-muted-foreground">
            Results will be available once the league starts.
          </p>
        )}

        {hasStarted && episodeType === "FINALE" && existingFinalePlacements.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">Finale results not entered yet.</p>
        )}

        {hasStarted && episodeType === "FINALE" && existingFinalePlacements.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {[1, 2, 3, 4].map((place) => {
              const qid = existingPlacementByPlace.get(place);
              return (
                <li key={place}>
                  <span className="font-medium">{place}:</span>{" "}
                  {qid ? queens.find((q) => q.id === qid)?.name || "—" : "—"}
                </li>
              );
            })}
          </ul>
        )}

        {hasStarted && episodeType !== "FINALE" && existingResults.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">No results entered yet.</p>
        )}

        {hasStarted && episodeType !== "FINALE" && existingResults.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <span className="font-medium">Mini:</span>{" "}
              {existing.mini
                .map((id) => queens.find((q) => q.id === id)?.name)
                .filter(Boolean)
                .join(", ")}
            </li>
            <li>
              <span className="font-medium">Main:</span>{" "}
              {existing.main
                .map((id) => queens.find((q) => q.id === id)?.name)
                .filter(Boolean)
                .join(", ")}
            </li>
            <li>
              <span className="font-medium">Lip sync winner:</span>{" "}
              {queens.find((q) => q.id === existing.lipsync)?.name || "—"}
            </li>
            <li>
              <span className="font-medium">Eliminated:</span>{" "}
              {existing.elim === null
                ? "No elimination"
                : queens.find((q) => q.id === existing.elim)?.name || "—"}
            </li>
          </ul>
        )}
      </div>
    );
  }

  // ----------------------------
  // Commissioner view
  // ----------------------------
  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">
          {episodeType === "FINALE" ? "Commissioner finale update" : "Commissioner weekly update"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Saving will recalculate scores for Week {week}.
        </p>
      </div>

      {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

      {episodeType !== "FINALE" ? (
        <>
          {/* Regular UI */}
          <section className="space-y-2">
            <div className="text-sm font-medium">Mini challenge winner(s)</div>
            {miniWinners.map((val, idx) => (
              <select
                key={`mini-${idx}`}
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={val}
                onChange={(e) => updateAt(setMiniWinners, miniWinners, idx, e.target.value)}
                disabled={disabled || isPending}
              >
                <option value="">Select a queen…</option>
                {queens.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => addWinner(setMiniWinners, miniWinners)}
              disabled={disabled || isPending}
            >
              Add mini winner
            </Button>
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium">Main challenge winner(s)</div>
            {mainWinners.map((val, idx) => (
              <select
                key={`main-${idx}`}
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={val}
                onChange={(e) => updateAt(setMainWinners, mainWinners, idx, e.target.value)}
                disabled={disabled || isPending}
              >
                <option value="">Select a queen…</option>
                {queens.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            ))}
            <Button
              type="button"
              variant="secondary"
              onClick={() => addWinner(setMainWinners, mainWinners)}
              disabled={disabled || isPending}
            >
              Add main winner
            </Button>
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium">Lip sync winner (exactly 1)</div>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={lipsyncWinner}
              onChange={(e) => setLipsyncWinner(e.target.value)}
              disabled={disabled || isPending}
            >
              <option value="">Select a queen…</option>
              {queens.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium">Elimination</div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={noElimination}
                onChange={(e) => setNoElimination(e.target.checked)}
                disabled={disabled || isPending}
              />
              No queen was eliminated
            </label>

            {!noElimination && (
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={eliminatedQueenId}
                onChange={(e) => setEliminatedQueenId(e.target.value)}
                disabled={disabled || isPending}
              >
                <option value="">Select eliminated queen…</option>
                {queens.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}
          </section>

          <div className="flex gap-2">
            <Button onClick={onSaveRegular} disabled={disabled || isPending}>
              {isPending ? "Saving…" : "Save results"}
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={onConvertToFinale}
              disabled={disabled || isPending}
            >
              Convert to Finale
            </Button>
          </div>

          {!hasStarted && (
            <p className="text-xs text-muted-foreground">Locked until league start.</p>
          )}
        </>
      ) : (
        <>
          {/* Finale UI */}
          <section className="space-y-2">
            <div className="text-sm font-medium">Final 4 placements (ordered)</div>

            {([1, 2, 3, 4] as const).map((place) => {
              const value = place === 1 ? place1 : place === 2 ? place2 : place === 3 ? place3 : place4;
              return (
                <select
                  key={place}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={value}
                  onChange={(e) => setPlace(place, e.target.value)}
                  disabled={disabled || isPending}
                >
                  <option value="">{place} place…</option>
                  {queens.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              );
            })}
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium">Finale extras</div>
            <p className="text-xs text-muted-foreground">
              Add any extra mini/main/lipsync wins that occurred during the finale (counts).
            </p>

            {[place1, place2, place3, place4]
              .filter(Boolean)
              .map((qid) => (
                <div key={qid} className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium">
                    {queens.find((q) => q.id === qid)?.name ?? "Selected queen"}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <label className="text-xs">
                      Mini wins
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={extras[qid]?.miniWins ?? 0}
                        onChange={(e) =>
                          setExtras((prev) => ({
                            ...prev,
                            [qid]: {
                              ...(prev[qid] ?? { miniWins: 0, mainWins: 0, lipsyncWins: 0 }),
                              miniWins: Number(e.target.value || 0),
                            },
                          }))
                        }
                        disabled={disabled || isPending}
                      />
                    </label>

                    <label className="text-xs">
                      Main wins
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={extras[qid]?.mainWins ?? 0}
                        onChange={(e) =>
                          setExtras((prev) => ({
                            ...prev,
                            [qid]: {
                              ...(prev[qid] ?? { miniWins: 0, mainWins: 0, lipsyncWins: 0 }),
                              mainWins: Number(e.target.value || 0),
                            },
                          }))
                        }
                        disabled={disabled || isPending}
                      />
                    </label>

                    <label className="text-xs">
                      Lip sync wins
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                        value={extras[qid]?.lipsyncWins ?? 0}
                        onChange={(e) =>
                          setExtras((prev) => ({
                            ...prev,
                            [qid]: {
                              ...(prev[qid] ?? { miniWins: 0, mainWins: 0, lipsyncWins: 0 }),
                              lipsyncWins: Number(e.target.value || 0),
                            },
                          }))
                        }
                        disabled={disabled || isPending}
                      />
                    </label>
                  </div>
                </div>
              ))}
          </section>

          <div className="flex gap-2">
            <Button onClick={() => onSaveFinale(false)} disabled={disabled || isPending}>
              {isPending ? "Saving…" : "Save finale"}
            </Button>
            <Button onClick={() => onSaveFinale(true)} disabled={disabled || isPending}>
              {isPending ? "Finalizing…" : "Finalize & end season"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
