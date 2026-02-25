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
  tribals?: unknown;
  finalPlacements?: unknown;
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

type TribalPredictionState = {
  bootCastawayId: string;
  bootVoteCount: string;
  immunityWinnerCastawayId: string;
  safePickCastawayId: string;
};

type FinalPlacementState = {
  fourthPlaceCastawayId: string;
  thirdPlaceCastawayId: string;
  secondPlaceCastawayId: string;
  firstPlaceCastawayId: string;
};

function parseResponseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function parseInitialTribals(
  existing: ExistingPrediction,
  tribalCount: number
): TribalPredictionState[] {
  const fallback: TribalPredictionState[] = Array.from({ length: tribalCount }, () => ({
    bootCastawayId: "",
    bootVoteCount: "",
    immunityWinnerCastawayId: "",
    safePickCastawayId: "",
  }));

  if (!existing) return fallback;

  if (Array.isArray(existing.tribals) && existing.tribals.length > 0) {
    const parsed = existing.tribals.map((row) => {
      const obj = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      return {
        bootCastawayId:
          typeof obj.bootCastawayId === "string" ? obj.bootCastawayId : "",
        bootVoteCount:
          typeof obj.bootVoteCount === "number" || typeof obj.bootVoteCount === "string"
            ? String(obj.bootVoteCount)
            : "",
        immunityWinnerCastawayId:
          typeof obj.immunityWinnerCastawayId === "string"
            ? obj.immunityWinnerCastawayId
            : "",
        safePickCastawayId:
          typeof obj.safePickCastawayId === "string" ? obj.safePickCastawayId : "",
      };
    });

    if (parsed.length === tribalCount) return parsed;
  }

  fallback[0] = {
    bootCastawayId: existing.bootCastawayId ?? "",
    bootVoteCount: existing.bootVoteCount != null ? String(existing.bootVoteCount) : "",
    immunityWinnerCastawayId: existing.immunityWinnerCastawayId ?? "",
    safePickCastawayId: existing.safePickCastawayId ?? "",
  };
  if (tribalCount > 1) {
    fallback[1] = {
      bootCastawayId: existing.secondaryBootCastawayId ?? "",
      bootVoteCount:
        existing.secondaryBootVoteCount != null
          ? String(existing.secondaryBootVoteCount)
          : "",
      immunityWinnerCastawayId: existing.secondaryImmunityWinnerCastawayId ?? "",
      safePickCastawayId: existing.secondarySafePickCastawayId ?? "",
    };
  }

  return fallback;
}

function ordinal(index: number) {
  if (index === 1) return "1st";
  if (index === 2) return "2nd";
  if (index === 3) return "3rd";
  return `${index}th`;
}

function formatEasternTimestamp(value: string | Date) {
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
  return `${formatted} ET`;
}

function formatLocalTimestamp(value: string | Date) {
  const parsed = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

function parseInitialFinalPlacements(existing: ExistingPrediction): FinalPlacementState {
  const fallback: FinalPlacementState = {
    fourthPlaceCastawayId: "",
    thirdPlaceCastawayId: "",
    secondPlaceCastawayId: "",
    firstPlaceCastawayId: "",
  };
  if (!existing?.finalPlacements || typeof existing.finalPlacements !== "object") {
    return fallback;
  }

  const placements = existing.finalPlacements as Record<string, unknown>;
  return {
    fourthPlaceCastawayId:
      typeof placements.fourthPlaceCastawayId === "string"
        ? placements.fourthPlaceCastawayId
        : "",
    thirdPlaceCastawayId:
      typeof placements.thirdPlaceCastawayId === "string"
        ? placements.thirdPlaceCastawayId
        : "",
    secondPlaceCastawayId:
      typeof placements.secondPlaceCastawayId === "string"
        ? placements.secondPlaceCastawayId
        : "",
    firstPlaceCastawayId:
      typeof placements.firstPlaceCastawayId === "string"
        ? placements.firstPlaceCastawayId
        : "",
  };
}

export default function SurvivorWeeklyPredictionForm(props: {
  leagueId: string;
  week: number;
  castaways: CastawayOption[];
  tribalCount: number;
  isFinaleWeek: boolean;
  finalPlacementOptions: CastawayOption[];
  existingPrediction: ExistingPrediction;
  lockAtIso: string | null;
  isLocked: boolean;
}) {
  const {
    leagueId,
    week,
    castaways,
    tribalCount,
    isFinaleWeek,
    finalPlacementOptions,
    existingPrediction,
    lockAtIso,
    isLocked,
  } = props;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [tribals, setTribals] = useState<TribalPredictionState[]>(
    parseInitialTribals(existingPrediction, Math.max(1, tribalCount))
  );

  const [idolPlayed, setIdolPlayed] = useState(
    existingPrediction?.idolPlayed == null ? "" : existingPrediction.idolPlayed ? "yes" : "no"
  );
  const [finalPlacements, setFinalPlacements] = useState<FinalPlacementState>(
    parseInitialFinalPlacements(existingPrediction)
  );

  const submitted = !!existingPrediction;
  const disabled = isPending || isLocked;
  const lockAtLocalText = useMemo(() => {
    if (!lockAtIso) return null;
    return formatLocalTimestamp(lockAtIso);
  }, [lockAtIso]);
  const lockAtEasternText = useMemo(() => {
    if (!lockAtIso) return null;
    return formatEasternTimestamp(lockAtIso);
  }, [lockAtIso]);

  function updateTribal(index: number, patch: Partial<TribalPredictionState>) {
    setTribals((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    );
  }

  async function submitPrediction() {
    setMessage("");

    const seenBoots = new Set<string>();
    for (let i = 0; i < tribals.length; i += 1) {
      const tribal = tribals[i];
      const label = `${ordinal(i + 1)} tribal`;
      const voteCount = Number(tribal.bootVoteCount);

      if (!tribal.bootCastawayId || !tribal.immunityWinnerCastawayId || !tribal.safePickCastawayId) {
        setMessage(`${label}: boot, immunity winner, and safe pick are required.`);
        return;
      }
      if (!Number.isInteger(voteCount) || voteCount < 0) {
        setMessage(`${label}: vote count must be a non-negative integer.`);
        return;
      }
      if (tribal.safePickCastawayId === tribal.bootCastawayId) {
        setMessage(`${label}: safe pick cannot match boot pick.`);
        return;
      }
      if (seenBoots.has(tribal.bootCastawayId)) {
        setMessage("Boot picks must be unique across tribal sets.");
        return;
      }
      seenBoots.add(tribal.bootCastawayId);
    }

    if (idolPlayed !== "yes" && idolPlayed !== "no") {
      setMessage("Select whether an idol will be played.");
      return;
    }

    if (isFinaleWeek) {
      const picks = [
        finalPlacements.fourthPlaceCastawayId,
        finalPlacements.thirdPlaceCastawayId,
        finalPlacements.secondPlaceCastawayId,
        finalPlacements.firstPlaceCastawayId,
      ];

      if (picks.some((value) => !value)) {
        setMessage("Final week requires 4th, 3rd, 2nd, and 1st place picks.");
        return;
      }

      if (new Set(picks).size !== 4) {
        setMessage("Final placement picks must be unique.");
        return;
      }
    }

    startTransition(async () => {
      const payload = {
        idolPlayed: idolPlayed === "yes",
        tribals: tribals.map((tribal) => ({
          bootCastawayId: tribal.bootCastawayId,
          bootVoteCount: Number(tribal.bootVoteCount),
          immunityWinnerCastawayId: tribal.immunityWinnerCastawayId,
          safePickCastawayId: tribal.safePickCastawayId,
        })),
        finalPlacements: isFinaleWeek
          ? {
              fourthPlaceCastawayId: finalPlacements.fourthPlaceCastawayId,
              thirdPlaceCastawayId: finalPlacements.thirdPlaceCastawayId,
              secondPlaceCastawayId: finalPlacements.secondPlaceCastawayId,
              firstPlaceCastawayId: finalPlacements.firstPlaceCastawayId,
            }
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

      setMessage("Prediction saved.");
      window.location.reload();
    });
  }

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">Weekly predictions</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Submit and edit freely until lock. Lock is every Wednesday at 7:00 PM Eastern.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        Configured tribal sets this week: <span className="font-semibold">{tribals.length}</span>
      </div>

      {lockAtLocalText && (
        <div className="text-xs text-muted-foreground">
          Week closes: <span className="font-medium">{lockAtLocalText}</span>
          {lockAtEasternText ? (
            <span className="block">Eastern reference: {lockAtEasternText}</span>
          ) : null}
        </div>
      )}

      {submitted && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          Last saved at{" "}
          {formatEasternTimestamp(existingPrediction.submittedAt)}
          .
          {existingPrediction.points != null && (
            <span> Scored points: {Number(existingPrediction.points).toFixed(2)}.</span>
          )}
        </div>
      )}

      {isLocked && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          Predictions are locked for this week.
        </div>
      )}

      {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

      <div className="space-y-3">
        {tribals.map((tribal, index) => (
          <div key={`tribal-${index}`} className="rounded-md border p-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ordinal(index + 1)} tribal
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                Boot pick
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={tribal.bootCastawayId}
                  onChange={(e) => updateTribal(index, { bootCastawayId: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {castaways.map((castaway) => (
                    <option key={`${castaway.id}-${index}-boot`} value={castaway.id}>
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
                  value={tribal.bootVoteCount}
                  onChange={(e) => updateTribal(index, { bootVoteCount: e.target.value })}
                  disabled={disabled}
                />
              </label>

              <label className="text-xs">
                Immunity winner
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={tribal.immunityWinnerCastawayId}
                  onChange={(e) =>
                    updateTribal(index, { immunityWinnerCastawayId: e.target.value })
                  }
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {castaways.map((castaway) => (
                    <option key={`${castaway.id}-${index}-imm`} value={castaway.id}>
                      {castaway.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                Safe pick
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={tribal.safePickCastawayId}
                  onChange={(e) => updateTribal(index, { safePickCastawayId: e.target.value })}
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {castaways.map((castaway) => (
                    <option key={`${castaway.id}-${index}-safe`} value={castaway.id}>
                      {castaway.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}

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

        {isFinaleWeek && (
          <div className="rounded-md border p-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Final 4 placement picks
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Required for week {week}. Pick the final order from remaining survivors.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-xs">
                4th place
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={finalPlacements.fourthPlaceCastawayId}
                  onChange={(e) =>
                    setFinalPlacements((prev) => ({
                      ...prev,
                      fourthPlaceCastawayId: e.target.value,
                    }))
                  }
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {finalPlacementOptions.map((castaway) => (
                    <option key={`${castaway.id}-final-4`} value={castaway.id}>
                      {castaway.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                3rd place
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={finalPlacements.thirdPlaceCastawayId}
                  onChange={(e) =>
                    setFinalPlacements((prev) => ({
                      ...prev,
                      thirdPlaceCastawayId: e.target.value,
                    }))
                  }
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {finalPlacementOptions.map((castaway) => (
                    <option key={`${castaway.id}-final-3`} value={castaway.id}>
                      {castaway.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                2nd place
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={finalPlacements.secondPlaceCastawayId}
                  onChange={(e) =>
                    setFinalPlacements((prev) => ({
                      ...prev,
                      secondPlaceCastawayId: e.target.value,
                    }))
                  }
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {finalPlacementOptions.map((castaway) => (
                    <option key={`${castaway.id}-final-2`} value={castaway.id}>
                      {castaway.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                1st place
                <select
                  className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                  value={finalPlacements.firstPlaceCastawayId}
                  onChange={(e) =>
                    setFinalPlacements((prev) => ({
                      ...prev,
                      firstPlaceCastawayId: e.target.value,
                    }))
                  }
                  disabled={disabled}
                >
                  <option value="">Select castaway...</option>
                  {finalPlacementOptions.map((castaway) => (
                    <option key={`${castaway.id}-final-1`} value={castaway.id}>
                      {castaway.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      <Button type="button" onClick={submitPrediction} disabled={disabled} className="w-full">
        {isLocked ? "Predictions locked" : submitted ? "Update prediction" : "Submit prediction"}
      </Button>
    </section>
  );
}
