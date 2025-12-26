import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CopyButton from "@/components/copy-button";
import DeleteLeagueButton from "@/components/delete-league-button";
import InviteControls from "@/components/invite-controls";
import StartLeagueButton from "@/components/start-league-button";

export default async function LeaguePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!id || id === "undefined") {
    return <main className="p-6">Invalid league id.</main>;
  }

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      members: { include: { user: { select: { email: true, name: true } } } },
      invites: { take: 1, orderBy: { createdAt: "desc" } },
    },
  });

  if (!league) {
    return <main className="p-6">League not found.</main>;
  }

  const invite = league.invites[0] ?? null;
  const inviteToken = invite?.token ?? null;
  const inviteIsActive = invite?.isActive ?? false;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";

  const inviteUrl = inviteToken ? `${baseUrl}/join/${inviteToken}` : null;

  const isCreator = league.createdById === user.id;

  // ✅ League started/reveal logic:
  // - startedAt set by commissioner (testing)
  // - OR now >= startsAt (premiere time)
  const now = new Date();
  const hasStarted =
    league.startedAt !== null ||
    (league.startsAt ? now >= league.startsAt : false);

  return (
    <main className="mx-auto w-full max-w-md p-4 pb-10">
      <h1 className="text-2xl font-semibold">{league.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {league.showType} • {league.visibility} • Max {league.maxPlayers}
      </p>

      {/* ✅ Primary actions */}
      <div className="mt-4 space-y-2">
        <Link
          href={`/leagues/${league.id}/picks`}
          className="inline-flex w-full items-center justify-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          {hasStarted ? "View Picks" : "Make Your Picks"}
        </Link>

        <Link
          href={`/leagues/${league.id}/weeks`}
          className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Weekly Results
        </Link>
        
        <Link
          href={`/leagues/${league.id}/leaderboard`}
          className="inline-flex w-full items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Leaderboard
        </Link>

      </div>


      <div className="mt-6 space-y-4">
        {/* ✅ Commissioner Tools */}
        {isCreator && !hasStarted && (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium">Commissioner tools</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Start the league early for testing/simulations. This will reveal
              picks and lock editing.
            </p>

            <div className="mt-3">
              <StartLeagueButton leagueId={league.id} />
            </div>
          </div>
        )}

        <div className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="font-medium">Invite link</div>
            <span className="text-xs font-semibold">
              {invite ? (inviteIsActive ? "Active" : "Disabled") : "None"}
            </span>
          </div>

          {inviteUrl ? (
            <CopyButton
              text={inviteUrl}
              className="mt-2 w-full rounded-md border px-3 py-2"
            />
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              No invite link yet.
            </p>
          )}

          {isCreator && (
            <div className="mt-3">
              <InviteControls leagueId={league.id} isActive={inviteIsActive} />
            </div>
          )}
        </div>

        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">Members</div>
          <ul className="mt-2 list-disc pl-5">
            {league.members.map((m) => (
              <li key={m.id}>
                {m.user.email} — {m.role}
              </li>
            ))}
          </ul>
        </div>

        {isCreator && (
          <div className="rounded-md border p-3 text-sm">
            <div className="font-medium text-red-700">Danger zone</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Delete this league (intended for cleaning up test leagues).
            </p>

            <div className="mt-3">
              <DeleteLeagueButton leagueId={league.id} leagueName={league.name} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
