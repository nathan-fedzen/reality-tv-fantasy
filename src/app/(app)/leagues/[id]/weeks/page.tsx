import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function WeeksIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const league = await prisma.league.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      showType: true,
      createdById: true,
      startsAt: true,
      startedAt: true,
      episodes: {
        select: {
          week: true,
          survivorCastawayResults: { select: { id: true } },
        },
        orderBy: { week: "asc" },
      },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);
  const isCommissioner = league.createdById === user.id;

  const enteredWeeks = new Set(
    league.episodes
      .filter((episode) =>
        league.showType === "SURVIVOR"
          ? episode.survivorCastawayResults.length > 0
          : true
      )
      .map((episode) => episode.week)
  );

  const totalWeeks = league.showType === "SURVIVOR" ? 13 : 20;
  const weeksToShow = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Weekly Results</h1>
        <Link className="text-sm underline" href={`/leagues/${league.id}`}>
          Back
        </Link>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {league.name} - {hasStarted ? "League started" : "Locked until league starts"}
      </p>

      {league.showType === "SURVIVOR" && isCommissioner && (
        <div className="mt-3">
          <Link
            href={`/leagues/${league.id}/commissioner-updates`}
            className="inline-flex rounded-full border border-primary/35 bg-primary/12 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/18"
          >
            Commissioner updates
          </Link>
        </div>
      )}

      <ul className="mt-6 space-y-2">
        {weeksToShow.map((week) => {
          const isEntered = enteredWeeks.has(week);
          return (
            <li key={week}>
              <Link
                href={`/leagues/${league.id}/weeks/${week}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-zinc-50"
              >
                <span className="text-sm font-medium">Week {week}</span>
                <span className="text-xs font-semibold">
                  {isEntered ? "Entered" : "Not entered"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
