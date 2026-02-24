"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type CastawayOption = {
  id: string;
  name: string;
  tribe: string | null;
};

type ExistingMeta = {
  isMerge: boolean;
  isNonElimination: boolean;
  bootCastawayId: string | null;
  bootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
} | null;

type ExistingResult = {
  castawayId: string;
  survived: boolean;
  eliminated: boolean;
  individualImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalLeader: boolean;
  endgamePlacement: number | null;
};

type RowState = {
  castawayId: string;
  survived: boolean;
  eliminated: boolean;
  individualImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalLeader: boolean;
  endgamePlacement: string;
};

function parseResponseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

export default function SurvivorWeekForm(props: {
  leagueId: string;
  week: number;
  castaways: CastawayOption[];
  existingMeta: ExistingMeta;
  existingResults: ExistingResult[];
  isCommissioner: boolean;
  hasStarted: boolean;
}) {
  const {
    leagueId,
    week,
    castaways,
    existingMeta,
    existingResults,
    isCommissioner,
    hasStarted,
  } = props;

  const disabled = !hasStarted || !isCommissioner;
  const [isPending, startTransition] = useTransition();

  const resultByCastawayId = useMemo(() => {
    const map = new Map<string, ExistingResult>();
    for (const row of existingResults) map.set(row.castawayId, row);
    return map;
  }, [existingResults]);

  const [isMerge, setIsMerge] = useState(existingMeta?.isMerge ?? false);
  const [isNonElimination, setIsNonElimination] = useState(
    existingMeta?.isNonElimination ?? false
  );
  const [bootCastawayId, setBootCastawayId] = useState(existingMeta?.bootCastawayId ?? "");
  const [bootVoteCount, setBootVoteCount] = useState(
    existingMeta?.bootVoteCount != null ? String(existingMeta.bootVoteCount) : ""
  );
  const [immunityWinnerCastawayId, setImmunityWinnerCastawayId] = useState(
    existingMeta?.immunityWinnerCastawayId ?? ""
  );

  const [rows, setRows] = useState<RowState[]>(() =>
    castaways.map((castaway) => {
      const existing = resultByCastawayId.get(castaway.id);
      return {
        castawayId: castaway.id,
        survived: existing?.survived ?? true,
        eliminated: existing?.eliminated ?? false,
        individualImmunityWins: existing?.individualImmunityWins ?? 0,
        individualRewardWins: existing?.individualRewardWins ?? 0,
        advantagesFound: existing?.advantagesFound ?? 0,
        idolsPlayedSuccessfully: existing?.idolsPlayedSuccessfully ?? 0,
        votesReceived: existing?.votesReceived ?? 0,
        confessionalLeader: existing?.confessionalLeader ?? false,
        endgamePlacement:
          existing?.endgamePlacement != null ? String(existing.endgamePlacement) : "",
      };
    })
  );

  const [message, setMessage] = useState("");

  function updateRow(castawayId: string, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.castawayId !== castawayId) return row;
        const next = { ...row, ...patch };
        if (next.eliminated) next.survived = false;
        return next;
      })
    );
  }

  async function save(recomputeOnly: boolean) {
    setMessage("");

    startTransition(async () => {
      let payload: unknown;

      if (recomputeOnly) {
        payload = { recomputeOnly: true };
      } else {
        payload = {
          isMerge,
          isNonElimination,
          bootCastawayId: bootCastawayId || null,
          bootVoteCount: bootVoteCount ? Number(bootVoteCount) : null,
          immunityWinnerCastawayId: immunityWinnerCastawayId || null,
          results: rows.map((row) => ({
            castawayId: row.castawayId,
            survived: row.survived,
            eliminated: row.eliminated,
            individualImmunityWins: Number(row.individualImmunityWins),
            individualRewardWins: Number(row.individualRewardWins),
            advantagesFound: Number(row.advantagesFound),
            idolsPlayedSuccessfully: Number(row.idolsPlayedSuccessfully),
            votesReceived: Number(row.votesReceived),
            confessionalLeader: row.confessionalLeader,
            endgamePlacement: row.endgamePlacement ? Number(row.endgamePlacement) : null,
          })),
        };
      }

      const res = await fetch(`/api/leagues/${leagueId}/weeks/${week}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseResponseError(json, "Failed to save Survivor week."));
        return;
      }

      setMessage(recomputeOnly ? "Week scores recomputed." : "Saved. Scores were recalculated.");
      window.location.reload();
    });
  }

  if (!isCommissioner) {
    return (
      <div className="rounded-md border p-3 text-sm space-y-2">
        <div className="font-medium">Survivor week results</div>
        {!hasStarted && (
          <p className="text-xs text-muted-foreground">
            Results are locked until the league starts.
          </p>
        )}
        {hasStarted && existingResults.length === 0 && (
          <p className="text-xs text-muted-foreground">No results entered yet.</p>
        )}
        {hasStarted && existingResults.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Results entered for {existingResults.length} castaways.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">Commissioner Survivor update</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Save week outcomes, then recompute scores in one click.
        </p>
      </div>

      {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

      <section className="space-y-3 rounded-md border p-3">
        <div className="text-sm font-medium">Episode metadata</div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMerge}
            onChange={(e) => setIsMerge(e.target.checked)}
            disabled={disabled || isPending}
          />
          Merge episode
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isNonElimination}
            onChange={(e) => setIsNonElimination(e.target.checked)}
            disabled={disabled || isPending}
          />
          Non-elimination episode
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs">
            Boot castaway
            <select
              className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
              value={bootCastawayId}
              onChange={(e) => setBootCastawayId(e.target.value)}
              disabled={disabled || isPending || isNonElimination}
            >
              <option value="">Select castaway…</option>
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
              disabled={disabled || isPending || isNonElimination}
            />
          </label>

          <label className="text-xs sm:col-span-2">
            Immunity winner (optional)
            <select
              className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
              value={immunityWinnerCastawayId}
              onChange={(e) => setImmunityWinnerCastawayId(e.target.value)}
              disabled={disabled || isPending}
            >
              <option value="">None</option>
              {castaways.map((castaway) => (
                <option key={castaway.id} value={castaway.id}>
                  {castaway.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-2 rounded-md border p-3">
        <div className="text-sm font-medium">Castaway outcomes</div>
        <p className="text-xs text-muted-foreground">
          Enter weekly outcomes for each castaway. Endgame placement is optional and usually
          finale-only.
        </p>

        <div className="space-y-3">
          {rows.map((row) => {
            const castaway = castaways.find((c) => c.id === row.castawayId);
            const zeroVotePostMerge = isMerge && !row.eliminated && row.votesReceived === 0;

            return (
              <div key={row.castawayId} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{castaway?.name ?? row.castawayId}</div>
                    <div className="text-xs text-muted-foreground">{castaway?.tribe ?? "No tribe"}</div>
                  </div>
                  {zeroVotePostMerge && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Zero-vote bonus
                    </span>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={row.survived}
                      onChange={(e) => updateRow(row.castawayId, { survived: e.target.checked })}
                      disabled={disabled || isPending || row.eliminated}
                    />
                    Survived
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={row.eliminated}
                      onChange={(e) =>
                        updateRow(row.castawayId, { eliminated: e.target.checked, survived: !e.target.checked })
                      }
                      disabled={disabled || isPending}
                    />
                    Eliminated
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={row.confessionalLeader}
                      onChange={(e) =>
                        updateRow(row.castawayId, { confessionalLeader: e.target.checked })
                      }
                      disabled={disabled || isPending}
                    />
                    Confessional leader
                  </label>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <label className="text-xs">
                    Immunity wins
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={row.individualImmunityWins}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          individualImmunityWins: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className="text-xs">
                    Reward wins
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={row.individualRewardWins}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          individualRewardWins: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className="text-xs">
                    Idol finds
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={row.advantagesFound}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          advantagesFound: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className="text-xs">
                    Idol plays
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={row.idolsPlayedSuccessfully}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          idolsPlayedSuccessfully: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className="text-xs">
                    Votes received
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={row.votesReceived}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          votesReceived: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className="text-xs">
                    Endgame place
                    <input
                      type="number"
                      min={1}
                      className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
                      value={row.endgamePlacement}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          endgamePlacement: e.target.value,
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(false)} disabled={disabled || isPending}>
          {isPending ? "Saving…" : "Save results + recompute"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => save(true)}
          disabled={disabled || isPending}
        >
          {isPending ? "Running…" : "Recompute week only"}
        </Button>
      </div>

      {!hasStarted && (
        <p className="text-xs text-muted-foreground">Results entry is locked until league start.</p>
      )}
    </div>
  );
}
