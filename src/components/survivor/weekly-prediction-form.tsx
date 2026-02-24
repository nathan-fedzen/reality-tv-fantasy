"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type CastawayOption = {
  id: string;
  name: string;
  tribe: string | null;
};

type ExistingPrediction = {
  id: string;
  bootCastawayId: string | null;
  bootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
  idolPlayed: boolean | null;
  safePickCastawayId: string | null;
  submittedAt: string;
  scoredAt: string | null;
  points: number | null;
} | null;

function parseResponseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

export default function SurvivorWeeklyPredictionForm(props: {
  leagueId: string;
  week: number;
  castaways: CastawayOption[];
  existingPrediction: ExistingPrediction;
  lockAtIso: string | null;
  isLocked: boolean;
}) {
  const { leagueId, week, castaways, existingPrediction, lockAtIso, isLocked } = props;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const [bootCastawayId, setBootCastawayId] = useState(
    existingPrediction?.bootCastawayId ?? ""
  );
  const [bootVoteCount, setBootVoteCount] = useState(
    existingPrediction?.bootVoteCount != null ? String(existingPrediction.bootVoteCount) : ""
  );
  const [immunityWinnerCastawayId, setImmunityWinnerCastawayId] = useState(
    existingPrediction?.immunityWinnerCastawayId ?? ""
  );
  const [idolPlayed, setIdolPlayed] = useState(
    existingPrediction?.idolPlayed == null ? "" : existingPrediction.idolPlayed ? "yes" : "no"
  );
  const [safePickCastawayId, setSafePickCastawayId] = useState(
    existingPrediction?.safePickCastawayId ?? ""
  );

  const submitted = !!existingPrediction;
  const disabled = isPending || submitted || isLocked;
  const lockAtText = useMemo(() => {
    if (!lockAtIso) return null;
    const parsed = new Date(lockAtIso);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  }, [lockAtIso]);

  async function submitPrediction() {
    setMessage("");

    if (!bootCastawayId || !immunityWinnerCastawayId || !safePickCastawayId) {
      setMessage("Boot, immunity winner, and safe pick are required.");
      return;
    }
    if (safePickCastawayId === bootCastawayId) {
      setMessage("Safe pick cannot match your boot pick.");
      return;
    }
    const voteCount = Number(bootVoteCount);
    if (!Number.isInteger(voteCount) || voteCount < 0) {
      setMessage("Boot vote count must be a non-negative integer.");
      return;
    }
    if (idolPlayed !== "yes" && idolPlayed !== "no") {
      setMessage("Select whether an idol will be played.");
      return;
    }

    startTransition(async () => {
      const payload = {
        bootCastawayId,
        bootVoteCount: voteCount,
        immunityWinnerCastawayId,
        idolPlayed: idolPlayed === "yes",
        safePickCastawayId,
      };

      const res = await fetch(`/api/leagues/${leagueId}/weeks/${week}/predictions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseResponseError(json, "Failed to submit prediction."));
        return;
      }

      setMessage("Prediction submitted.");
      window.location.reload();
    });
  }

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">Weekly predictions</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Submit once per week. Scoring is deterministic and capped at 35 points.
        </p>
      </div>

      {lockAtText && (
        <div className="text-xs text-muted-foreground">
          Lock time: <span className="font-medium">{lockAtText}</span>
        </div>
      )}

      {submitted && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          Submitted at {new Date(existingPrediction.submittedAt).toLocaleString()}.
          {existingPrediction.points != null && (
            <span> Scored points: {Number(existingPrediction.points).toFixed(2)}.</span>
          )}
        </div>
      )}

      {!submitted && isLocked && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          Predictions are locked for this week.
        </div>
      )}

      {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          Boot pick
          <select
            className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
            value={bootCastawayId}
            onChange={(e) => setBootCastawayId(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select castaway...</option>
            {castaways.map((castaway) => (
              <option key={castaway.id} value={castaway.id}>
                {castaway.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          Boot vote count
          <input
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
            value={bootVoteCount}
            onChange={(e) => setBootVoteCount(e.target.value)}
            disabled={disabled}
          />
        </label>

        <label className="text-xs">
          Immunity winner
          <select
            className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
            value={immunityWinnerCastawayId}
            onChange={(e) => setImmunityWinnerCastawayId(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select castaway...</option>
            {castaways.map((castaway) => (
              <option key={castaway.id} value={castaway.id}>
                {castaway.name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs">
          Idol played?
          <select
            className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
            value={idolPlayed}
            onChange={(e) => setIdolPlayed(e.target.value)}
            disabled={disabled}
          >
            <option value="">Choose...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>

        <label className="text-xs sm:col-span-2">
          Safe pick
          <select
            className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
            value={safePickCastawayId}
            onChange={(e) => setSafePickCastawayId(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select castaway...</option>
            {castaways.map((castaway) => (
              <option key={castaway.id} value={castaway.id}>
                {castaway.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Button type="button" onClick={submitPrediction} disabled={disabled} className="w-full">
        {submitted ? "Prediction submitted" : "Submit prediction"}
      </Button>
    </section>
  );
}
