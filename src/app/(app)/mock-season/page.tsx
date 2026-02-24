import Link from "next/link";
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";

type Search = {
  file?: string;
};

type MockStanding = {
  rank: number;
  entryId: string;
  displayName: string;
  totalPoints: number;
  correctBootPredictions: number;
};

type MockDraftOrder = {
  seat: number;
  displayName: string;
};

type MockDraftPick = {
  overallPick: number;
  draftedBy: string;
  castaway: string;
};

type MockWeekSummary = {
  week: number;
  isMerge: boolean;
  tribalCount?: number;
  eliminated: string[];
  immunityWinner: string | null;
  secondaryImmunityWinner: string | null;
};

type MockWeeklyPrediction = {
  week: number;
  entryId: string;
  entryName: string;
    picks: {
      bootCastaway: string | null;
      secondaryBootCastaway: string | null;
    bootVoteCount: number | null;
    secondaryBootVoteCount: number | null;
    immunityWinner: string | null;
    secondaryImmunityWinner: string | null;
      idolPlayed: boolean | null;
      safePick: string | null;
      secondarySafePick: string | null;
      finalPlacements?: {
        fourthPlace: string | null;
        thirdPlace: string | null;
        secondPlace: string | null;
        firstPlace: string | null;
      };
    };
    pointsAwarded: number;
};

type MockCastawayResult = {
  castawayId: string;
  castawayName: string;
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

type MockWeeklyResult = {
  week: number;
  meta: {
    isMerge: boolean;
    isNonElimination: boolean;
    bootCastaway: string | null;
    secondaryBootCastaway: string | null;
    bootVoteCount: number | null;
    secondaryBootVoteCount: number | null;
    immunityWinner: string | null;
    secondaryImmunityWinner: string | null;
    lockedAt: string | null;
  };
  castawayResults: MockCastawayResult[];
};

type MockSeasonData = {
  generatedAt: string;
  seed: string;
  league: {
    id: string;
    name: string;
    picksPerEntry: number;
    seasonWeeks: number;
  };
  draftOrder: MockDraftOrder[];
  draftPicks: MockDraftPick[];
  weeks: MockWeekSummary[];
  weeklyPredictions: MockWeeklyPrediction[];
  weeklyResults: MockWeeklyResult[];
  standings: MockStanding[];
};

function isValidMockFileName(name: string) {
  return /^mock-survivor-season-[a-z0-9]+\.json$/i.test(name);
}

function safeSelectedFile(value: string | undefined) {
  if (!value) return null;
  const base = path.basename(value);
  if (!isValidMockFileName(base)) return null;
  return base;
}

async function listMockFiles(cwd: string) {
  const names = await readdir(cwd);
  const filtered = names.filter((name) => isValidMockFileName(name));
  const withTimes = await Promise.all(
    filtered.map(async (name) => ({
      name,
      mtimeMs: (await stat(path.join(cwd, name))).mtimeMs,
    }))
  );
  withTimes.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withTimes.map((item) => item.name);
}

function groupPredictionsByWeek(predictions: MockWeeklyPrediction[]) {
  const map = new Map<number, MockWeeklyPrediction[]>();
  for (const prediction of predictions) {
    const list = map.get(prediction.week) ?? [];
    list.push(prediction);
    map.set(prediction.week, list);
  }

  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([week, list]) => ({
      week,
      rows: list.sort((a, b) => a.entryName.localeCompare(b.entryName)),
    }));
}

export default async function MockSeasonPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const cwd = process.cwd();
  const availableFiles = await listMockFiles(cwd);
  const selectedFromQuery = safeSelectedFile(search.file);
  const selectedFile =
    (selectedFromQuery && availableFiles.includes(selectedFromQuery)
      ? selectedFromQuery
      : null) ?? availableFiles[0] ?? null;

  let parseError: string | null = null;
  let data: MockSeasonData | null = null;

  if (selectedFile) {
    try {
      const content = await readFile(path.join(cwd, selectedFile), "utf8");
      data = JSON.parse(content) as MockSeasonData;
    } catch (error) {
      parseError =
        error instanceof Error ? error.message : "Failed to read or parse selected file.";
    }
  }

  const predictionWeeks = data ? groupPredictionsByWeek(data.weeklyPredictions ?? []) : [];

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-border bg-gradient-to-br from-primary/12 via-background to-secondary/12 p-5 shadow-sm">
        <h1 className="text-2xl font-semibold">Mock Season Viewer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visualizes generated mock data from files named{" "}
          <code className="rounded bg-background/70 px-1.5 py-0.5">
            mock-survivor-season-*.json
          </code>{" "}
          in your project root.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Generate data with{" "}
          <code className="rounded bg-background/70 px-1.5 py-0.5">
            npm run mock:survivor-season -- --leagueId=&lt;id&gt;
          </code>
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Available files</h2>
        {availableFiles.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No mock JSON files found in <code>{cwd}</code>.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {availableFiles.map((file) => (
              <Link
                key={file}
                href={`/mock-season?file=${encodeURIComponent(file)}`}
                className={[
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  selectedFile === file
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-background hover:bg-accent",
                ].join(" ")}
              >
                {file}
              </Link>
            ))}
          </div>
        )}
      </section>

      {!selectedFile && (
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Select or generate a mock season file.</p>
        </section>
      )}

      {selectedFile && parseError && (
        <section className="rounded-3xl border border-destructive/40 bg-destructive/10 p-5 shadow-sm">
          <h2 className="text-base font-semibold text-destructive">Failed to load {selectedFile}</h2>
          <p className="mt-1 text-sm">{parseError}</p>
        </section>
      )}

      {data && (
        <>
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">League summary</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">League</div>
                <div className="mt-1 font-semibold">{data.league.name}</div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Seed</div>
                <div className="mt-1 font-semibold">{data.seed}</div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Weeks generated
                </div>
                <div className="mt-1 font-semibold">{data.league.seasonWeeks}</div>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Picks per entry
                </div>
                <div className="mt-1 font-semibold">{data.league.picksPerEntry}</div>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Generated at: {new Date(data.generatedAt).toLocaleString()}
            </p>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Final standings</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Rank</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Points</th>
                    <th className="px-3 py-2">Correct boots</th>
                  </tr>
                </thead>
                <tbody>
                  {data.standings.map((row) => (
                    <tr key={row.entryId} className="border-t border-border">
                      <td className="px-3 py-2 font-semibold">#{row.rank}</td>
                      <td className="px-3 py-2">{row.displayName}</td>
                      <td className="px-3 py-2 tabular-nums">{row.totalPoints.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{row.correctBootPredictions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Draft order and picks</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.draftOrder.map((seat) => (
                <span
                  key={seat.seat}
                  className="rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold"
                >
                  Seat {seat.seat}: {seat.displayName}
                </span>
              ))}
            </div>
            <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="sticky top-0 bg-card text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Overall pick</th>
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Castaway</th>
                  </tr>
                </thead>
                <tbody>
                  {data.draftPicks.map((pick) => (
                    <tr
                      key={`${pick.overallPick}-${pick.castaway}`}
                      className="border-t border-border"
                    >
                      <td className="px-3 py-2 tabular-nums">#{pick.overallPick}</td>
                      <td className="px-3 py-2">{pick.draftedBy}</td>
                      <td className="px-3 py-2">{pick.castaway}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Weekly outcomes</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.weeks.map((week) => (
                <div
                  key={`summary-week-${week.week}`}
                  className="rounded-2xl border border-border bg-background/60 p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">Week {week.week}</div>
                    {week.isMerge && (
                      <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Merge
                      </span>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Eliminated: {week.eliminated.join(", ")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Immunity:{" "}
                    {[week.immunityWinner, week.secondaryImmunityWinner]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Tribal sets: {week.tribalCount ?? "-"}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Weekly predictions</h2>
            <div className="mt-3 space-y-4">
              {predictionWeeks.map((group) => (
                <details
                  key={`pred-week-${group.week}`}
                  className="rounded-2xl border border-border bg-background/60"
                  open={group.week <= 2}
                >
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                    Week {group.week} predictions
                  </summary>
                  <div className="overflow-x-auto border-t border-border">
                    <table className="w-full min-w-[880px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Player</th>
                          <th className="px-3 py-2">Boot</th>
                          <th className="px-3 py-2">2nd boot</th>
                          <th className="px-3 py-2">Immunity</th>
                          <th className="px-3 py-2">Safe</th>
                          <th className="px-3 py-2">Final 4 picks</th>
                          <th className="px-3 py-2">Idol</th>
                          <th className="px-3 py-2">Points</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={`${group.week}-${row.entryId}`} className="border-t border-border">
                            <td className="px-3 py-2">{row.entryName}</td>
                            <td className="px-3 py-2">{row.picks.bootCastaway ?? "-"}</td>
                            <td className="px-3 py-2">{row.picks.secondaryBootCastaway ?? "-"}</td>
                            <td className="px-3 py-2">
                              {[row.picks.immunityWinner, row.picks.secondaryImmunityWinner]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </td>
                            <td className="px-3 py-2">
                              {[row.picks.safePick, row.picks.secondarySafePick]
                                .filter(Boolean)
                                .join(", ") || "-"}
                            </td>
                            <td className="px-3 py-2">
                              {row.picks.finalPlacements
                                ? [
                                    `4th: ${row.picks.finalPlacements.fourthPlace ?? "-"}`,
                                    `3rd: ${row.picks.finalPlacements.thirdPlace ?? "-"}`,
                                    `2nd: ${row.picks.finalPlacements.secondPlace ?? "-"}`,
                                    `1st: ${row.picks.finalPlacements.firstPlace ?? "-"}`,
                                  ].join(" | ")
                                : "-"}
                            </td>
                            <td className="px-3 py-2">
                              {row.picks.idolPlayed == null
                                ? "-"
                                : row.picks.idolPlayed
                                ? "Yes"
                                : "No"}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {row.pointsAwarded.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-semibold">Weekly commissioner results</h2>
            <div className="mt-3 space-y-4">
              {data.weeklyResults.map((week) => {
                const eliminated = week.castawayResults.filter((row) => row.eliminated);
                const leader = week.castawayResults.find((row) => row.confessionalLeader) ?? null;
                const topConfessionals = week.castawayResults
                  .slice()
                  .sort((a, b) => b.confessionalCount - a.confessionalCount)
                  .slice(0, 3);

                return (
                  <details
                    key={`result-week-${week.week}`}
                    className="rounded-2xl border border-border bg-background/60"
                    open={week.week <= 2}
                  >
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Week {week.week} results
                    </summary>
                    <div className="border-t border-border px-3 py-3 text-sm">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            Eliminated
                          </span>
                          <div className="mt-1">
                            {eliminated.length > 0
                              ? eliminated.map((row) => row.castawayName).join(", ")
                              : "None"}
                          </div>
                        </div>
                        <div>
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            Confessional leader
                          </span>
                          <div className="mt-1">{leader?.castawayName ?? "-"}</div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          Top confessionals
                        </span>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {topConfessionals.map((row) => (
                            <span
                              key={`conf-${week.week}-${row.castawayId}`}
                              className="rounded-full border border-border bg-card px-2 py-0.5 text-xs"
                            >
                              {row.castawayName}: {row.confessionalCount}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
