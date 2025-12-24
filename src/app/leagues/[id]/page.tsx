import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CopyButton from "@/components/copy-button";


export default async function LeaguePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    const session = await getSession();
    if (!session) redirect("/login");

    if (!id || id === "undefined") {
        return <main className="p-6">Invalid league id.</main>;
    }

    const league = await prisma.league.findUnique({
        where: { id },
        include: {
            members: { include: { user: { select: { email: true, name: true } } } },
            invites: { take: 1 },
        },
    });

    if (!league) {
        return <main className="p-6">League not found.</main>;
    }

    const inviteToken = league.invites[0]?.token;
    const joinUrl = inviteToken ? `/join/${inviteToken}` : null;

    return (
        <main className="mx-auto w-full max-w-md p-4 pb-10">
            <h1 className="text-2xl font-semibold">{league.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
                {league.showType} • {league.visibility} • Max {league.maxPlayers}
            </p>

            <div className="mt-6 space-y-4">
                {joinUrl && (
                    <div className="rounded-md border p-3 text-sm">
                        <div className="font-medium">Invite link</div>

                        <CopyButton
                            text={`${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}${joinUrl}`}
                            className="mt-2 w-full rounded-md border px-3 py-2"
                        />
                    </div>
                )}


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
            </div>
        </main>
    );
}

