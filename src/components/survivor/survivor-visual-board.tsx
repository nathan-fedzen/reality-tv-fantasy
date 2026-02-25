"use client";

import { motion } from "motion/react";

type SurvivorVisualRow = {
  id: string;
  name: string;
  tribe: string | null;
  confessionalTotal: number;
  individualImmunityTotal: number;
  tribeImmunityTotal: number;
  rewardTotal: number;
  votesReceivedTotal: number;
  idolNet: number;
  confessionalLeaderWeeks: number;
  eliminated: boolean;
  eliminatedWeek: number | null;
  confessionalRank: number;
};

export default function SurvivorVisualBoard({
  survivors,
}: {
  survivors: SurvivorVisualRow[];
}) {
  const chartRows = survivors.slice(0, 10);
  const gridRows = survivors.slice(0, 12);
  const maxConfessionals = Math.max(1, ...survivors.map((row) => row.confessionalTotal));

  return (
    <section className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Survivor Pulse Board</h2>
        <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-semibold">
          Animated visual tracker
        </span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-border/80 bg-background/60 p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Confessional race
          </p>
          <div className="mt-3 space-y-2.5">
            {chartRows.map((row, index) => {
              const widthPct = Math.max(
                6,
                Math.round((row.confessionalTotal / maxConfessionals) * 100)
              );

              return (
                <motion.article
                  key={`chart-${row.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.24, delay: index * 0.05, ease: "easeOut" }}
                  className={[
                    "rounded-xl border px-3 py-2",
                    row.eliminated
                      ? "border-border/60 bg-background/45 text-muted-foreground"
                      : "border-border/80 bg-background/70",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <p className={["font-semibold", row.eliminated ? "line-through" : ""].join(" ")}>
                      #{row.confessionalRank} {row.name}
                    </p>
                    <span className="font-semibold tabular-nums">{row.confessionalTotal}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted/45">
                    <motion.div
                      initial={{ width: 0 }}
                      whileInView={{ width: `${widthPct}%` }}
                      viewport={{ once: true, amount: 0.6 }}
                      transition={{ duration: 0.55, delay: 0.08 + index * 0.05, ease: "easeOut" }}
                      className={[
                        "h-full rounded-full",
                        row.eliminated
                          ? "bg-muted-foreground/45"
                          : "bg-gradient-to-r from-primary to-amber-400",
                      ].join(" ")}
                    />
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-background/60 p-3 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Survivor pulse grid
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {gridRows.map((row, index) => (
              <motion.article
                key={`grid-${row.id}`}
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.22, delay: index * 0.03, ease: "easeOut" }}
                whileHover={{ y: -3 }}
                className={[
                  "rounded-xl border p-2.5",
                  row.eliminated
                    ? "border-border/70 bg-background/40 opacity-70 grayscale"
                    : "border-border/80 bg-background/70",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className={["text-xs font-semibold", row.eliminated ? "line-through" : ""].join(" ")}>
                      {row.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {row.tribe ?? "Unassigned"} | #{row.confessionalRank}
                    </p>
                  </div>
                  <span
                    className={[
                      "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
                      row.eliminated
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                    ].join(" ")}
                  >
                    {row.eliminated
                      ? `OUT${row.eliminatedWeek ? ` W${row.eliminatedWeek}` : ""}`
                      : "LIVE"}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <span className="rounded-md border border-border/70 bg-background/60 px-1.5 py-1 tabular-nums">
                    Conf: {row.confessionalTotal}
                  </span>
                  <span className="rounded-md border border-border/70 bg-background/60 px-1.5 py-1 tabular-nums">
                    Imm: {row.individualImmunityTotal + row.tribeImmunityTotal}
                  </span>
                  <span className="rounded-md border border-border/70 bg-background/60 px-1.5 py-1 tabular-nums">
                    Votes: {row.votesReceivedTotal}
                  </span>
                  <span
                    className={[
                      "rounded-md border px-1.5 py-1 tabular-nums",
                      row.idolNet > 0
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                        : "border-border/70 bg-background/60",
                    ].join(" ")}
                  >
                    Idol net: {row.idolNet > 0 ? `+${row.idolNet}` : row.idolNet}
                  </span>
                </div>
                {row.confessionalLeaderWeeks > 0 && (
                  <p className="mt-1.5 text-[10px] font-semibold text-primary/90">
                    Led confessionals for {row.confessionalLeaderWeeks} week
                    {row.confessionalLeaderWeeks === 1 ? "" : "s"}
                  </p>
                )}
              </motion.article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
