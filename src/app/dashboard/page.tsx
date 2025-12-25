import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import LogoutButton from "@/components/logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const memberships = await prisma.leagueMember.findMany({
    where: { userId: user.id },
    select: {
      role: true,
      joinedAt: true,
      league: {
        select: {
          id: true,
          name: true,
          showType: true,
          visibility: true,
          maxPlayers: true,
          updatedAt: true,
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { league: { updatedAt: "desc" } },
  });

  const leagues = memberships.map((m) => ({
    ...m.league,
    myRole: m.role,
    joinedAt: m.joinedAt,
  }));

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your leagues and quick links.
          </p>
        </div>

        <LogoutButton className="rounded-md border px-3 py-2 text-xs font-semibold" />
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">Your leagues</div>

          {leagues.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">
              You’re not in any leagues yet.
              <div className="mt-2">
                <Link
                  href="/leagues/new"
                  className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-semibold"
                >
                  Create a league
                </Link>
              </div>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {leagues.map((league) => (
                <li key={league.id}>
                  <Link
                    href={`/leagues/${league.id}`}
                    className="block rounded-md border p-3 hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{league.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {league.showType} • {league.visibility} •{" "}
                          {league._count.members}/{league.maxPlayers} members
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Your role: {league.myRole}
                        </div>
                      </div>

                      <span className="shrink-0 text-xs font-semibold">
                        View →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">Quick actions</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link
              href="/leagues/new"
              className="inline-flex items-center rounded-md border px-3 py-2 text-xs font-semibold"
            >
              Create league
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
