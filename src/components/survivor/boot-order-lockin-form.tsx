"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type CastawayOption = {
  id: string;
  name: string;
  tribe: string | null;
};

type ExistingSubmission = {
  id: string;
  submittedAt: string;
  scoredAt: string | null;
  points: number;
  orderedCastawayIds: string[];
} | null;

function parseResponseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function moveItem(ids: string[], from: number, to: number) {
  const copy = [...ids];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export default function SurvivorBootOrderLockInForm(props: {
  leagueId: string;
  isMergeOpen: boolean;
  mergeWeek: number | null;
  castaways: CastawayOption[];
  existingSubmission: ExistingSubmission;
  isLocked: boolean;
  lockReason: string | null;
}) {
  const {
    leagueId,
    isMergeOpen,
    mergeWeek,
    castaways,
    existingSubmission,
    isLocked,
    lockReason,
  } = props;

  const [isPending, startTransition] = useTransition();
  const castawayById = useMemo(
    () => new Map(castaways.map((castaway) => [castaway.id, castaway])),
    [castaways]
  );

  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    if (existingSubmission?.orderedCastawayIds?.length) {
      return [...existingSubmission.orderedCastawayIds];
    }
    return castaways.map((castaway) => castaway.id);
  });
  const [message, setMessage] = useState("");

  const submitted = !!existingSubmission;
  const disabled = isPending || submitted || isLocked || !isMergeOpen;

  async function submitLockIn() {
    setMessage("");
    if (!isMergeOpen) {
      setMessage("Boot-order lock-in unlocks at merge.");
      return;
    }
    if (orderedIds.length !== castaways.length) {
      setMessage("Order must include every merge castaway.");
      return;
    }
    if (new Set(orderedIds).size !== orderedIds.length) {
      setMessage("Order contains duplicate castaways.");
      return;
    }

    startTransition(async () => {
      const res = await fetch(`/api/leagues/${leagueId}/survivor/boot-order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedCastawayIds: orderedIds }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseResponseError(json, "Failed to submit boot-order lock-in."));
        return;
      }

      setMessage("Boot-order lock-in submitted.");
      window.location.reload();
    });
  }

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">Post-merge boot-order lock-in</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Rank merge castaways from first merge boot (top) to winner (bottom). One
          submission only.
        </p>
        {mergeWeek != null && (
          <p className="mt-1 text-xs text-muted-foreground">Unlocked at merge week {mergeWeek}.</p>
        )}
      </div>

      {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

      {!isMergeOpen && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          Boot-order lock-in unlocks at merge.
        </div>
      )}

      {lockReason && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">{lockReason}</div>
      )}

      {submitted && existingSubmission && (
        <div className="rounded-md border bg-muted/30 p-2 text-xs">
          Submitted at {new Date(existingSubmission.submittedAt).toLocaleString()}.
          {existingSubmission.scoredAt && (
            <span> Scored at {new Date(existingSubmission.scoredAt).toLocaleString()}.</span>
          )}
          <span> Points: {existingSubmission.points.toFixed(2)}.</span>
        </div>
      )}

      <div className="space-y-2">
        {orderedIds.map((castawayId, index) => {
          const castaway = castawayById.get(castawayId);
          const canMoveUp = index > 0;
          const canMoveDown = index < orderedIds.length - 1;

          return (
            <div
              key={`${castawayId}-${index}`}
              className="flex items-center justify-between rounded-md border px-2 py-2"
            >
              <div>
                <div className="text-sm font-medium">
                  {index + 1}. {castaway?.name ?? castawayId}
                </div>
                <div className="text-xs text-muted-foreground">
                  {castaway?.tribe ?? "No tribe"}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || !canMoveUp}
                  onClick={() => setOrderedIds((prev) => moveItem(prev, index, index - 1))}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || !canMoveDown}
                  onClick={() => setOrderedIds((prev) => moveItem(prev, index, index + 1))}
                >
                  Down
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Button type="button" onClick={submitLockIn} disabled={disabled} className="w-full">
        {submitted ? "Boot-order lock-in submitted" : "Submit boot-order lock-in"}
      </Button>
    </section>
  );
}
