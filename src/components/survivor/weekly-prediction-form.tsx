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
  secondaryBootCastawayId: string | null;
  bootVoteCount: number | null;
  secondaryBootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
  secondaryImmunityWinnerCastawayId: string | null;
  idolPlayed: boolean | null;
  safePickCastawayId: string | null;
  secondarySafePickCastawayId: string | null;
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
  const allowSecondaryBootPick = week === 1;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const [bootCastawayId, setBootCastawayId] = useState(
    existingPrediction?.bootCastawayId ?? ""
  );
  const [secondaryBootCastawayId, setSecondaryBootCastawayId] = useState(
    existingPrediction?.secondaryBootCastawayId ?? ""
  );
  const [bootVoteCount, setBootVoteCount] = useState(
    existingPrediction?.bootVoteCount != null ? String(existingPrediction.bootVoteCount) : ""
  );
  const [secondaryBootVoteCount, setSecondaryBootVoteCount] = useState(
    existingPrediction?.secondaryBootVoteCount != null
      ? String(existingPrediction.secondaryBootVoteCount)
      : ""
  );
  const [immunityWinnerCastawayId, setImmunityWinnerCastawayId] = useState(
    existingPrediction?.immunityWinnerCastawayId ?? ""
  );
  const [secondaryImmunityWinnerCastawayId, setSecondaryImmunityWinnerCastawayId] = useState(
    existingPrediction?.secondaryImmunityWinnerCastawayId ?? ""
  );
  const [idolPlayed, setIdolPlayed] = useState(
    existingPrediction?.idolPlayed == null ? "" : existingPrediction.idolPlayed ? "yes" : "no"
  );
  const [safePickCastawayId, setSafePickCastawayId] = useState(
    existingPrediction?.safePickCastawayId ?? ""
  );
  const [secondarySafePickCastawayId, setSecondarySafePickCastawayId] = useState(
    existingPrediction?.secondarySafePickCastawayId ?? ""
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
      setMessage("1st tribal boot, immunity winner, and safe pick are required.");
      return;
    }
    if (safePickCastawayId === bootCastawayId) {
      setMessage("1st tribal safe pick cannot match your 1st tribal boot pick.");
      return;
    }
    if (
      allowSecondaryBootPick &&
      secondaryBootCastawayId &&
      secondaryBootCastawayId === bootCastawayId
    ) {
      setMessage("Second boot pick cannot match your first boot pick.");
      return;
    }
    const voteCount = Number(bootVoteCount);
    if (!Number.isInteger(voteCount) || voteCount < 0) {
      setMessage("1st tribal boot vote count must be a non-negative integer.");
      return;
    }
    const voteCountSecond = Number(secondaryBootVoteCount);
    if (allowSecondaryBootPick) {
      if (
        !secondaryBootCastawayId ||
        !secondaryImmunityWinnerCastawayId ||
        !secondarySafePickCastawayId
      ) {
        setMessage("All 2nd tribal fields are required in week 1.");
        return;
      }
      if (!Number.isInteger(voteCountSecond) || voteCountSecond < 0) {
        setMessage("2nd tribal boot vote count must be a non-negative integer.");
        return;
      }
      if (secondarySafePickCastawayId === secondaryBootCastawayId) {
        setMessage("2nd tribal safe pick cannot match your 2nd tribal boot pick.");
        return;
      }
    }
    if (idolPlayed !== "yes" && idolPlayed !== "no") {
      setMessage("Select whether an idol will be played.");
      return;
    }

    startTransition(async () => {
      const payload = {
        bootCastawayId,
        secondaryBootCastawayId: allowSecondaryBootPick
          ? secondaryBootCastawayId || null
          : null,
        bootVoteCount: voteCount,
        secondaryBootVoteCount:
          allowSecondaryBootPick && Number.isInteger(voteCountSecond) ? voteCountSecond : null,
        immunityWinnerCastawayId,
        secondaryImmunityWinnerCastawayId: allowSecondaryBootPick
          ? secondaryImmunityWinnerCastawayId || null
          : null,
        idolPlayed: idolPlayed === "yes",
        safePickCastawayId,
        secondarySafePickCastawayId: allowSecondaryBootPick
          ? secondarySafePickCastawayId || null
          : null,
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

      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            1st tribal boot pick
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
            1st tribal boot vote count
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
            1st tribal immunity winner
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
            1st tribal safe pick
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

        {allowSecondaryBootPick && (
          <div className="grid gap-2 rounded-md border p-2 sm:grid-cols-2">
            <label className="text-xs">
              2nd tribal boot pick
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                value={secondaryBootCastawayId}
                onChange={(e) => setSecondaryBootCastawayId(e.target.value)}
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
              2nd tribal boot vote count
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                value={secondaryBootVoteCount}
                onChange={(e) => setSecondaryBootVoteCount(e.target.value)}
                disabled={disabled}
              />
            </label>
            <label className="text-xs">
              2nd tribal immunity winner
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                value={secondaryImmunityWinnerCastawayId}
                onChange={(e) => setSecondaryImmunityWinnerCastawayId(e.target.value)}
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
              2nd tribal safe pick
              <select
                className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                value={secondarySafePickCastawayId}
                onChange={(e) => setSecondarySafePickCastawayId(e.target.value)}
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
        )}

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
      </div>

      <Button type="button" onClick={submitPrediction} disabled={disabled} className="w-full">
        {submitted ? "Prediction submitted" : "Submit prediction"}
      </Button>
    </section>
  );
}
