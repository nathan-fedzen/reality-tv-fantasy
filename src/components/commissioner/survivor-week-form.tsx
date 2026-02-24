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
  secondaryBootCastawayId: string | null;
  bootVoteCount: number | null;
  secondaryBootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
  secondaryImmunityWinnerCastawayId: string | null;
} | null;

type ExistingResult = {
  castawayId: string;
  survived: boolean;
  eliminated: boolean;
  individualImmunityWins: number;
  tribeImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalCount: number;
  confessionalLeader: boolean;
  endgamePlacement: number | null;
};

type RowState = {
  castawayId: string;
  survived: boolean;
  eliminated: boolean;
  individualImmunityWins: number;
  tribeImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalCount: number;
  confessionalLeader: boolean;
  endgamePlacement: string;
};

function parseResponseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function statTileClass(
  value: number,
  tone: "positive" | "warning" | "highlight" | "neutral" = "positive"
) {
  const base = "rounded-xl border p-3 transition min-h-[126px] flex flex-col";
  if (value <= 0) return `${base} border-border/70 bg-background/70`;

  if (tone === "warning") {
    return `${base} border-amber-400/45 bg-amber-500/12 ring-1 ring-amber-400/20`;
  }
  if (tone === "highlight") {
    return `${base} border-violet-400/45 bg-violet-500/12 ring-1 ring-violet-400/20`;
  }
  if (tone === "neutral") {
    return `${base} border-cyan-400/45 bg-cyan-500/12 ring-1 ring-cyan-400/20`;
  }

  return `${base} border-emerald-400/45 bg-emerald-500/12 ring-1 ring-emerald-400/20`;
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
  const inputClass =
    "mt-1 h-10 w-full rounded-xl border border-border/70 bg-background/80 px-3 text-sm font-semibold text-foreground shadow-inner transition focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25";
  const selectClass =
    "mt-1 h-10 w-full rounded-xl border border-border/70 bg-background/80 px-3 text-sm shadow-inner focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/25";
  const statLabelClass =
    "flex h-10 items-start text-[11px] font-semibold uppercase tracking-wide leading-4 text-muted-foreground";

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
  const [secondaryBootCastawayId, setSecondaryBootCastawayId] = useState(
    existingMeta?.secondaryBootCastawayId ?? ""
  );
  const [bootVoteCount, setBootVoteCount] = useState(
    existingMeta?.bootVoteCount != null ? String(existingMeta.bootVoteCount) : ""
  );
  const [secondaryBootVoteCount, setSecondaryBootVoteCount] = useState(
    existingMeta?.secondaryBootVoteCount != null ? String(existingMeta.secondaryBootVoteCount) : ""
  );
  const [immunityWinnerCastawayId, setImmunityWinnerCastawayId] = useState(
    existingMeta?.immunityWinnerCastawayId ?? ""
  );
  const [secondaryImmunityWinnerCastawayId, setSecondaryImmunityWinnerCastawayId] = useState(
    existingMeta?.secondaryImmunityWinnerCastawayId ?? ""
  );
  const isDoubleTribalWeek = week === 1;

  const [rows, setRows] = useState<RowState[]>(() =>
    castaways.map((castaway) => {
      const existing = resultByCastawayId.get(castaway.id);
      return {
        castawayId: castaway.id,
        survived: existing?.survived ?? true,
        eliminated: existing?.eliminated ?? false,
        individualImmunityWins: existing?.individualImmunityWins ?? 0,
        tribeImmunityWins: existing?.tribeImmunityWins ?? 0,
        individualRewardWins: existing?.individualRewardWins ?? 0,
        advantagesFound: existing?.advantagesFound ?? 0,
        idolsPlayedSuccessfully: existing?.idolsPlayedSuccessfully ?? 0,
        votesReceived: existing?.votesReceived ?? 0,
        confessionalCount: existing?.confessionalCount ?? 0,
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
          secondaryBootCastawayId: isDoubleTribalWeek
            ? secondaryBootCastawayId || null
            : null,
          bootVoteCount: bootVoteCount ? Number(bootVoteCount) : null,
          secondaryBootVoteCount: isDoubleTribalWeek
            ? secondaryBootVoteCount
              ? Number(secondaryBootVoteCount)
              : null
            : null,
          immunityWinnerCastawayId: immunityWinnerCastawayId || null,
          secondaryImmunityWinnerCastawayId: isDoubleTribalWeek
            ? secondaryImmunityWinnerCastawayId || null
            : null,
          results: rows.map((row) => ({
            castawayId: row.castawayId,
            survived: row.survived,
            eliminated: row.eliminated,
            individualImmunityWins: Number(row.individualImmunityWins),
            tribeImmunityWins: Number(row.tribeImmunityWins),
            individualRewardWins: Number(row.individualRewardWins),
            advantagesFound: Number(row.advantagesFound),
            idolsPlayedSuccessfully: Number(row.idolsPlayedSuccessfully),
            votesReceived: Number(row.votesReceived),
            confessionalCount: Number(row.confessionalCount),
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
      <div className="space-y-2 rounded-xl border border-border/70 p-3 text-sm">
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
    <div className="space-y-5 rounded-2xl border border-border/70 bg-card/85 p-4 shadow-sm sm:p-6">
      <div className="text-sm">
        <div className="font-medium">Commissioner Survivor update</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Save week outcomes, then recompute scores in one click.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          {message}
        </div>
      )}

      <section className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-4">
        <div className="text-sm font-medium">Episode metadata</div>

        <div className="grid gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isMerge}
              onChange={(e) => setIsMerge(e.target.checked)}
              disabled={disabled || isPending}
            />
            Merge episode
          </label>

          <label className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={isNonElimination}
              onChange={(e) => setIsNonElimination(e.target.checked)}
              disabled={disabled || isPending}
            />
            Non-elimination episode
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              1st tribal
            </p>
            <label className="text-xs">
              Boot castaway
              <select
                className={selectClass}
                value={bootCastawayId}
                onChange={(e) => setBootCastawayId(e.target.value)}
                disabled={disabled || isPending || isNonElimination}
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
                className={inputClass}
                value={bootVoteCount}
                onChange={(e) => setBootVoteCount(e.target.value)}
                disabled={disabled || isPending || isNonElimination}
              />
            </label>

            <label className="text-xs">
              Immunity winner
              <select
                className={selectClass}
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

          {isDoubleTribalWeek && (
            <div className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                2nd tribal
              </p>
              <label className="text-xs">
                Boot castaway
                <select
                  className={selectClass}
                  value={secondaryBootCastawayId}
                  onChange={(e) => setSecondaryBootCastawayId(e.target.value)}
                  disabled={disabled || isPending || isNonElimination}
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
                  className={inputClass}
                  value={secondaryBootVoteCount}
                  onChange={(e) => setSecondaryBootVoteCount(e.target.value)}
                  disabled={disabled || isPending || isNonElimination}
                />
              </label>

              <label className="text-xs">
                Immunity winner
                <select
                  className={selectClass}
                  value={secondaryImmunityWinnerCastawayId}
                  onChange={(e) => setSecondaryImmunityWinnerCastawayId(e.target.value)}
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
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-4">
        <div className="text-sm font-medium">Castaway outcomes</div>
        <p className="text-xs text-muted-foreground">
          Enter weekly outcomes for each castaway. Endgame placement is optional and usually
          finale-only.
        </p>

        <div className="space-y-4">
          {rows.map((row) => {
            const castaway = castaways.find((c) => c.id === row.castawayId);
            const tone = row.eliminated
              ? "border-destructive/45 bg-gradient-to-br from-background via-background to-destructive/8"
              : row.confessionalLeader
                ? "border-primary/40 bg-gradient-to-br from-background via-background to-primary/12"
                : "border-border/70 bg-gradient-to-br from-background via-background to-secondary/12";

            return (
              <div
                key={row.castawayId}
                className={`space-y-3 rounded-2xl border p-4 shadow-[0_8px_24px_rgba(0,0,0,0.16)] ${tone}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">
                      {castaway?.name ?? row.castawayId}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {castaway?.tribe ?? "No tribe"}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      row.eliminated
                        ? "bg-destructive/10 text-destructive ring-destructive/30"
                        : "bg-emerald-500/12 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300"
                    }`}
                  >
                    {row.eliminated ? "Eliminated" : "Active"}
                  </span>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <label
                    className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      row.survived
                        ? "border-emerald-400/45 bg-emerald-500/12"
                        : "border-border/70 bg-background/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.survived}
                      onChange={(e) => updateRow(row.castawayId, { survived: e.target.checked })}
                      disabled={disabled || isPending || row.eliminated}
                    />
                    <span className="leading-tight">Survived</span>
                  </label>
                  <label
                    className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      row.eliminated
                        ? "border-destructive/45 bg-destructive/12"
                        : "border-border/70 bg-background/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.eliminated}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          eliminated: e.target.checked,
                          survived: !e.target.checked,
                        })
                      }
                      disabled={disabled || isPending}
                    />
                    <span className="leading-tight">Eliminated</span>
                  </label>
                  <label
                    className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      row.confessionalLeader
                        ? "border-primary/45 bg-primary/14"
                        : "border-border/70 bg-background/70"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={row.confessionalLeader}
                      onChange={(e) =>
                        updateRow(row.castawayId, { confessionalLeader: e.target.checked })
                      }
                      disabled={disabled || isPending}
                    />
                    <span className="leading-tight">Confessional leader</span>
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className={statTileClass(row.individualImmunityWins)}>
                    <span className={statLabelClass}>
                      Ind. immunity
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.individualImmunityWins}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          individualImmunityWins: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className={statTileClass(row.tribeImmunityWins)}>
                    <span className={statLabelClass}>
                      Tribe immunity
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.tribeImmunityWins}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          tribeImmunityWins: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className={statTileClass(row.individualRewardWins)}>
                    <span className={statLabelClass}>
                      Reward wins
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.individualRewardWins}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          individualRewardWins: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className={statTileClass(row.advantagesFound, "highlight")}>
                    <span className={statLabelClass}>
                      Idol finds
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.advantagesFound}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          advantagesFound: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className={statTileClass(row.idolsPlayedSuccessfully, "highlight")}>
                    <span className={statLabelClass}>
                      Idol plays
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.idolsPlayedSuccessfully}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          idolsPlayedSuccessfully: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className={statTileClass(row.votesReceived, "warning")}>
                    <span className={statLabelClass}>
                      Votes received
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.votesReceived}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          votesReceived: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label className={statTileClass(row.confessionalCount, "highlight")}>
                    <span className={statLabelClass}>
                      Confessionals
                    </span>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.confessionalCount}
                      onChange={(e) =>
                        updateRow(row.castawayId, {
                          confessionalCount: Number(e.target.value || 0),
                        })
                      }
                      disabled={disabled || isPending}
                    />
                  </label>

                  <label
                    className={statTileClass(
                      Number.isFinite(Number(row.endgamePlacement))
                        ? Number(row.endgamePlacement)
                        : 0,
                      "neutral"
                    )}
                  >
                    <span className={statLabelClass}>
                      Endgame place
                    </span>
                    <input
                      type="number"
                      min={1}
                      className={inputClass}
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
          {isPending ? "Saving..." : "Save results + recompute"}
        </Button>
        <Button variant="secondary" onClick={() => save(true)} disabled={disabled || isPending}>
          {isPending ? "Running..." : "Recompute week only"}
        </Button>
      </div>

      {!hasStarted && (
        <p className="text-xs text-muted-foreground">Results entry is locked until league start.</p>
      )}
    </div>
  );
}
