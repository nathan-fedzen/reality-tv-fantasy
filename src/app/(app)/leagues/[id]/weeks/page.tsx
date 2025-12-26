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
      createdById: true,
      startsAt: true,
      startedAt: true,
      episodes: { select: { week: true }, orderBy: { week: "asc" } },
    },
  });

  if (!league) return <main className="p-6">League not found.</main>;

  const now = new Date();
  const hasStarted =
    league.startedAt !== null || (league.startsAt ? now >= league.startsAt : false);

  const savedWeeks = new Set(league.episodes.map((e) => e.week));
  const weeksToShow = Array.from({ length: 20 }, (_, i) => i + 1); // MVP: show 1..20

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Weekly Results</h1>
        <Link className="text-sm underline" href={`/leagues/${league.id}`}>
          Back
        </Link>
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {league.name} • {hasStarted ? "League started" : "Locked until league starts"}
      </p>

      <ul className="mt-6 space-y-2">
        {weeksToShow.map((week) => {
          const isSaved = savedWeeks.has(week);
          return (
            <li key={week}>
              <Link
                href={`/leagues/${league.id}/weeks/${week}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-zinc-50"
              >
                <span className="text-sm font-medium">Week {week}</span>
                <span className="text-xs font-semibold">
                  {isSaved ? "Entered" : "Not entered"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
