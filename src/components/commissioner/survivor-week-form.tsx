"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

type CastawayOption = {
  id: string;
  name: string;
  tribe: string | null;
};

type ExistingMeta = {
  tribalCount: number;
  tribals?: unknown;
  isMerge: boolean;
  isNonElimination: boolean;
  bootCastawayId: string | null;
  secondaryBootCastawayId: string | null;
  bootVoteCount: number | null;
  secondaryBootVoteCount: number | null;
  immunityWinnerCastawayId: string | null;
  secondaryImmunityWinnerCastawayId: string | null;
} | null;

type TribalImmunityMode = "INDIVIDUAL" | "TRIBE";

type TribalMetaState = {
  bootCastawayId: string;
  bootVoteCount: string;
  immunityType: TribalImmunityMode;
  immunityWinnerCastawayIds: string[];
  immunityWinningTribes: string[];
};

type ExistingResult = {
  castawayId: string;
  individualImmunityWins: number;
  tribeImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalCount: number;
  endgamePlacement: number | null;
};

type RowState = {
  castawayId: string;
  individualImmunityWins: number;
  tribeImmunityWins: number;
  individualRewardWins: number;
  advantagesFound: number;
  idolsPlayedSuccessfully: number;
  votesReceived: number;
  confessionalCount: number;
  endgamePlacement: string;
};

function parseResponseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

function ordinal(index: number) {
  if (index === 1) return "1st";
  if (index === 2) return "2nd";
  if (index === 3) return "3rd";
  return `${index}th`;
}

function parseInitialTribals(existingMeta: ExistingMeta, defaultCount: number): TribalMetaState[] {
  const tribalCount = Math.max(1, existingMeta?.tribalCount ?? defaultCount);
  const fallback: TribalMetaState[] = Array.from({ length: tribalCount }, () => ({
    bootCastawayId: "",
    bootVoteCount: "",
    immunityType: "INDIVIDUAL",
    immunityWinnerCastawayIds: [],
    immunityWinningTribes: [],
  }));

  if (existingMeta?.tribals && Array.isArray(existingMeta.tribals)) {
    const parsed = existingMeta.tribals.map((row) => {
      const obj = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const rawWinnerIds = Array.isArray(obj.immunityWinnerCastawayIds)
        ? obj.immunityWinnerCastawayIds
        : [];
      const winnerIds = rawWinnerIds
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);
      const singleWinner =
        typeof obj.immunityWinnerCastawayId === "string"
          ? obj.immunityWinnerCastawayId.trim()
          : "";

      const rawWinningTribes = Array.isArray(obj.immunityWinningTribes)
        ? obj.immunityWinningTribes
        : [];
      const winningTribes = rawWinningTribes
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean);

      const immunityType: TribalImmunityMode =
        obj.immunityType === "TRIBE" || winningTribes.length > 0 ? "TRIBE" : "INDIVIDUAL";

      return {
        bootCastawayId:
          typeof obj.bootCastawayId === "string" ? obj.bootCastawayId : "",
        bootVoteCount:
          typeof obj.bootVoteCount === "number" || typeof obj.bootVoteCount === "string"
            ? String(obj.bootVoteCount)
            : "",
        immunityType,
        immunityWinnerCastawayIds:
          winnerIds.length > 0
            ? winnerIds
            : singleWinner
              ? [singleWinner]
              : [],
        immunityWinningTribes: winningTribes,
      };
    });
    if (parsed.length === tribalCount) return parsed;
  }

  if (existingMeta) {
    fallback[0] = {
      bootCastawayId: existingMeta.bootCastawayId ?? "",
      bootVoteCount: existingMeta.bootVoteCount != null ? String(existingMeta.bootVoteCount) : "",
      immunityType: "INDIVIDUAL",
      immunityWinnerCastawayIds: existingMeta.immunityWinnerCastawayId
        ? [existingMeta.immunityWinnerCastawayId]
        : [],
      immunityWinningTribes: [],
    };
    if (fallback.length > 1) {
      fallback[1] = {
        bootCastawayId: existingMeta.secondaryBootCastawayId ?? "",
        bootVoteCount:
          existingMeta.secondaryBootVoteCount != null
            ? String(existingMeta.secondaryBootVoteCount)
            : "",
        immunityType: "INDIVIDUAL",
        immunityWinnerCastawayIds: existingMeta.secondaryImmunityWinnerCastawayId
          ? [existingMeta.secondaryImmunityWinnerCastawayId]
          : [],
        immunityWinningTribes: [],
      };
    }
  }

  return fallback;
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
  const [tribalCount, setTribalCount] = useState(
    Math.max(1, existingMeta?.tribalCount ?? (week === 1 ? 2 : 1))
  );
  const [tribals, setTribals] = useState<TribalMetaState[]>(
    parseInitialTribals(existingMeta, week === 1 ? 2 : 1)
  );

  const [rows, setRows] = useState<RowState[]>(() =>
    castaways.map((castaway) => {
      const existing = resultByCastawayId.get(castaway.id);
      return {
        castawayId: castaway.id,
        individualImmunityWins: existing?.individualImmunityWins ?? 0,
        tribeImmunityWins: existing?.tribeImmunityWins ?? 0,
        individualRewardWins: existing?.individualRewardWins ?? 0,
        advantagesFound: existing?.advantagesFound ?? 0,
        idolsPlayedSuccessfully: existing?.idolsPlayedSuccessfully ?? 0,
        votesReceived: existing?.votesReceived ?? 0,
        confessionalCount: existing?.confessionalCount ?? 0,
        endgamePlacement:
          existing?.endgamePlacement != null ? String(existing.endgamePlacement) : "",
      };
    })
  );

  const [message, setMessage] = useState("");
  const isFinaleWeek = week === SURVIVOR_SEASON_WEEKS;

  function updateRow(castawayId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((row) => (row.castawayId !== castawayId ? row : { ...row, ...patch })));
  }

  function setConfiguredTribalCount(nextValue: number) {
    const next = Math.max(1, Math.min(6, nextValue || 1));
    setTribalCount(next);
    setTribals((prev) => {
      if (prev.length === next) return prev;
      if (prev.length > next) return prev.slice(0, next);
      return prev.concat(
        Array.from({ length: next - prev.length }, () => ({
          bootCastawayId: "",
          bootVoteCount: "",
          immunityType: "INDIVIDUAL" as TribalImmunityMode,
          immunityWinnerCastawayIds: [],
          immunityWinningTribes: [],
        }))
      );
    });
  }

  function updateTribal(index: number, patch: Partial<TribalMetaState>) {
    setTribals((prev) =>
      prev.map((tribal, tribalIndex) =>
        tribalIndex === index ? { ...tribal, ...patch } : tribal
      )
    );
  }

  function toggleImmunityWinner(index: number, castawayId: string) {
    setTribals((prev) =>
      prev.map((tribal, tribalIndex) => {
        if (tribalIndex !== index) return tribal;
        const exists = tribal.immunityWinnerCastawayIds.includes(castawayId);
        return {
          ...tribal,
          immunityWinnerCastawayIds: exists
            ? tribal.immunityWinnerCastawayIds.filter((id) => id !== castawayId)
            : [...tribal.immunityWinnerCastawayIds, castawayId],
        };
      })
    );
  }

  function toggleImmunityWinningTribe(index: number, tribe: string) {
    setTribals((prev) =>
      prev.map((tribal, tribalIndex) => {
        if (tribalIndex !== index) return tribal;
        const exists = tribal.immunityWinningTribes.includes(tribe);
        return {
          ...tribal,
          immunityWinningTribes: exists
            ? tribal.immunityWinningTribes.filter((name) => name !== tribe)
            : [...tribal.immunityWinningTribes, tribe],
        };
      })
    );
  }

  const tribes = useMemo(() => {
    const set = new Set<string>();
    for (const castaway of castaways) {
      if (castaway.tribe) set.add(castaway.tribe);
    }
    return Array.from(set.values()).sort((a, b) => a.localeCompare(b));
  }, [castaways]);

  const bootedCastawayIds = useMemo(
    () =>
      new Set<string>(
        isNonElimination
          ? []
          : tribals
              .map((tribal) => tribal.bootCastawayId.trim())
              .filter((castawayId) => castawayId.length > 0)
      ),
    [isNonElimination, tribals]
  );

  const castawayById = useMemo(
    () => new Map(castaways.map((castaway) => [castaway.id, castaway])),
    [castaways]
  );

  const computedImmunityWinsByCastaway = useMemo(() => {
    const individualWins = new Map<string, number>();
    const tribeWins = new Map<string, number>();

    for (const row of rows) {
      individualWins.set(row.castawayId, 0);
      tribeWins.set(row.castawayId, 0);
    }

    for (const tribal of tribals) {
      if (tribal.immunityType === "TRIBE") {
        const winningTribes = new Set(tribal.immunityWinningTribes);
        for (const row of rows) {
          const tribe = castawayById.get(row.castawayId)?.tribe ?? null;
          if (!tribe || !winningTribes.has(tribe)) continue;
          tribeWins.set(row.castawayId, (tribeWins.get(row.castawayId) ?? 0) + 1);
        }
      } else {
        for (const castawayId of tribal.immunityWinnerCastawayIds) {
          individualWins.set(castawayId, (individualWins.get(castawayId) ?? 0) + 1);
        }
      }
    }

    return { individualWins, tribeWins };
  }, [castawayById, rows, tribals]);

  async function save(mode: "save" | "recompute" | "configure") {
    setMessage("");

    startTransition(async () => {
      let payload: unknown;

      if (mode === "recompute") {
        payload = { recomputeOnly: true };
      } else if (mode === "configure") {
        payload = {
          configureOnly: true,
          tribalCount,
          isMerge,
          isNonElimination,
          tribals: tribals.map((tribal) => ({
            bootCastawayId: tribal.bootCastawayId || null,
            bootVoteCount: tribal.bootVoteCount ? Number(tribal.bootVoteCount) : null,
            immunityType: tribal.immunityType,
            immunityWinnerCastawayIds: tribal.immunityWinnerCastawayIds,
            immunityWinningTribes: tribal.immunityWinningTribes,
            immunityWinnerCastawayId: tribal.immunityWinnerCastawayIds[0] ?? null,
          })),
        };
      } else {
        payload = {
          tribalCount,
          isMerge,
          isNonElimination,
          tribals: tribals.map((tribal) => ({
            bootCastawayId: tribal.bootCastawayId || null,
            bootVoteCount: tribal.bootVoteCount ? Number(tribal.bootVoteCount) : null,
            immunityType: tribal.immunityType,
            immunityWinnerCastawayIds: tribal.immunityWinnerCastawayIds,
            immunityWinningTribes: tribal.immunityWinningTribes,
            immunityWinnerCastawayId: tribal.immunityWinnerCastawayIds[0] ?? null,
          })),
          results: rows.map((row) => ({
            castawayId: row.castawayId,
            individualImmunityWins:
              computedImmunityWinsByCastaway.individualWins.get(row.castawayId) ?? 0,
            tribeImmunityWins: computedImmunityWinsByCastaway.tribeWins.get(row.castawayId) ?? 0,
            individualRewardWins: Number(row.individualRewardWins),
            advantagesFound: Number(row.advantagesFound),
            idolsPlayedSuccessfully: Number(row.idolsPlayedSuccessfully),
            votesReceived: Number(row.votesReceived),
            confessionalCount: Number(row.confessionalCount),
            endgamePlacement:
              isFinaleWeek && row.endgamePlacement ? Number(row.endgamePlacement) : null,
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

      const okMessage =
        mode === "recompute"
          ? "Week scores recomputed."
          : mode === "configure"
          ? "Week setup saved."
          : "Saved. Scores were recalculated.";
      setMessage(okMessage);
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

        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          <label className="rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-xs">
            Tribal sets this week
            <input
              type="number"
              min={1}
              max={6}
              className={inputClass}
              value={tribalCount}
              onChange={(e) => setConfiguredTribalCount(Number(e.target.value || 1))}
              disabled={disabled || isPending}
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {tribals.map((tribal, index) => (
              <div
                key={`meta-tribal-${index}`}
                className="space-y-2 rounded-xl border border-border/70 bg-background/70 p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {ordinal(index + 1)} tribal
                </p>
                <label className="text-xs">
                  Boot castaway
                  <select
                    className={selectClass}
                    value={tribal.bootCastawayId}
                    onChange={(e) =>
                      updateTribal(index, { bootCastawayId: e.target.value })
                    }
                    disabled={disabled || isPending || isNonElimination}
                  >
                    <option value="">Select castaway...</option>
                    {castaways.map((castaway) => (
                      <option key={`${castaway.id}-meta-boot-${index}`} value={castaway.id}>
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
                    value={tribal.bootVoteCount}
                    onChange={(e) =>
                      updateTribal(index, { bootVoteCount: e.target.value })
                    }
                    disabled={disabled || isPending || isNonElimination}
                  />
                </label>

                <label className="text-xs">
                  Immunity type
                  <select
                    className={selectClass}
                    value={tribal.immunityType}
                    onChange={(e) =>
                      updateTribal(index, {
                        immunityType: e.target.value === "TRIBE" ? "TRIBE" : "INDIVIDUAL",
                      })
                    }
                    disabled={disabled || isPending}
                  >
                    <option value="INDIVIDUAL">Individual</option>
                    <option value="TRIBE">Tribe</option>
                  </select>
                </label>

                {tribal.immunityType === "INDIVIDUAL" ? (
                  <div className="text-xs">
                    <p className="font-medium">Immunity winners (multiple allowed)</p>
                    <div className="mt-1 max-h-36 space-y-1 overflow-auto rounded-lg border border-border/70 bg-background/70 p-2">
                      {castaways.map((castaway) => (
                        <label
                          key={`${castaway.id}-meta-immunity-winner-${index}`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={tribal.immunityWinnerCastawayIds.includes(castaway.id)}
                            onChange={() => toggleImmunityWinner(index, castaway.id)}
                            disabled={disabled || isPending}
                          />
                          <span className="truncate">{castaway.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs">
                    <p className="font-medium">Winning tribes (multiple allowed)</p>
                    <div className="mt-1 max-h-36 space-y-1 overflow-auto rounded-lg border border-border/70 bg-background/70 p-2">
                      {tribes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No tribe labels available yet.</p>
                      ) : (
                        tribes.map((tribe) => (
                          <label
                            key={`${tribe}-meta-immunity-tribe-${index}`}
                            className="flex items-center gap-2 text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={tribal.immunityWinningTribes.includes(tribe)}
                              onChange={() => toggleImmunityWinningTribe(index, tribe)}
                              disabled={disabled || isPending}
                            />
                            <span className="truncate">{tribe}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border/70 bg-background/40 p-4">
        <div className="text-sm font-medium">Castaway outcomes</div>
        <p className="text-xs text-muted-foreground">
          Enter weekly outcomes for each castaway. Endgame placement is optional and usually
          finale-only. Confessional leader points are calculated automatically from cumulative
          totals. Elimination is derived from the boot castaways selected above. Immunity win
          credits are calculated automatically from the immunity settings in episode metadata.
        </p>

        <div className="space-y-4">
          {rows.map((row) => {
            const castaway = castaways.find((c) => c.id === row.castawayId);
            const eliminatedFromBoot = bootedCastawayIds.has(row.castawayId);
            const tone = eliminatedFromBoot
              ? "border-destructive/45 bg-gradient-to-br from-background via-background to-destructive/8"
              : row.confessionalCount > 0
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
                      eliminatedFromBoot
                        ? "bg-destructive/10 text-destructive ring-destructive/30"
                        : "bg-emerald-500/12 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300"
                    }`}
                  >
                    {eliminatedFromBoot ? "Eliminated (Boot)" : "Active"}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

                  {isFinaleWeek && (
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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => save("configure")} disabled={disabled || isPending}>
          {isPending ? "Saving..." : "Save week setup"}
        </Button>
        <Button onClick={() => save("save")} disabled={disabled || isPending}>
          {isPending ? "Saving..." : "Save results + recompute"}
        </Button>
        <Button variant="secondary" onClick={() => save("recompute")} disabled={disabled || isPending}>
          {isPending ? "Running..." : "Recompute week only"}
        </Button>
      </div>

      {!hasStarted && (
        <p className="text-xs text-muted-foreground">Results entry is locked until league start.</p>
      )}
    </div>
  );
}
