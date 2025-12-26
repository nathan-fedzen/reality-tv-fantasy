"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type QueenOption = { id: string; name: string };
type ExistingResult = { id: string; type: string; queenId: string | null };

export default function DragRaceWeekForm(props: {
  leagueId: string;
  week: number;
  queens: QueenOption[];
  existingResults: ExistingResult[];
  isCommissioner: boolean;
  hasStarted: boolean;
}) {
  const { leagueId, week, queens, existingResults, isCommissioner, hasStarted } = props;

  const disabled = !hasStarted || !isCommissioner;

  const existing = useMemo(() => {
    const mini = existingResults.filter((r) => r.type === "mini").map((r) => r.queenId!).filter(Boolean);
    const main = existingResults.filter((r) => r.type === "main").map((r) => r.queenId!).filter(Boolean);
    const lipsync = existingResults.find((r) => r.type === "lipsync")?.queenId ?? "";
    const elim = existingResults.find((r) => r.type === "elimination")?.queenId ?? null;
    return { mini, main, lipsync, elim };
  }, [existingResults]);

  const [miniWinners, setMiniWinners] = useState<string[]>(existing.mini.length ? existing.mini : [""]);
  const [mainWinners, setMainWinners] = useState<string[]>(existing.main.length ? existing.main : [""]);
  const [lipsyncWinner, setLipsyncWinner] = useState<string>(existing.lipsync || "");
  const [noElimination, setNoElimination] = useState<boolean>(existing.elim === null);
  const [eliminatedQueenId, setEliminatedQueenId] = useState<string>(existing.elim ?? "");
  const [message, setMessage] = useState<string>("");

  const [isPending, startTransition] = useTransition();

  function updateAt(setter: (v: string[]) => void, arr: string[], idx: number, val: string) {
    const next = [...arr];
    next[idx] = val;
    setter(next);
  }

  function addWinner(setter: (v: string[]) => void, arr: string[]) {
    setter([...arr, ""]);
  }

  async function onSave() {
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
      // simplest refresh: reload
      window.location.reload();
    });
  }

  // Read-only view for non-commissioners
  if (!isCommissioner) {
    return (
      <div className="rounded-md border p-3 text-sm">
        <div className="font-medium">Results</div>
        {!hasStarted && (
          <p className="mt-2 text-xs text-muted-foreground">
            Results will be available once the league starts.
          </p>
        )}
        {hasStarted && existingResults.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            No results entered yet.
          </p>
        )}

        {hasStarted && existingResults.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            <li>
              <span className="font-medium">Mini:</span>{" "}
              {existing.mini.map((id) => queens.find((q) => q.id === id)?.name).filter(Boolean).join(", ")}
            </li>
            <li>
              <span className="font-medium">Main:</span>{" "}
              {existing.main.map((id) => queens.find((q) => q.id === id)?.name).filter(Boolean).join(", ")}
            </li>
            <li>
              <span className="font-medium">Lip sync winner:</span>{" "}
              {queens.find((q) => q.id === existing.lipsync)?.name || "—"}
            </li>
            <li>
              <span className="font-medium">Eliminated:</span>{" "}
              {existing.elim === null ? "No elimination" : (queens.find((q) => q.id === existing.elim)?.name || "—")}
            </li>
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">Commissioner weekly update</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Saving will recalculate scores for Week {week}.
        </p>
      </div>

      {/* Mini winners */}
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

      {/* Main winners */}
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

      {/* Lip sync winner */}
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

      {/* Elimination */}
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

      {message && (
        <div className="rounded-md border px-3 py-2 text-sm">
          {message}
        </div>
      )}

      <Button onClick={onSave} disabled={disabled || isPending}>
        {isPending ? "Saving…" : "Save results"}
      </Button>

      {!hasStarted && (
        <p className="text-xs text-muted-foreground">
          Locked until league start.
        </p>
      )}
    </div>
  );
}
