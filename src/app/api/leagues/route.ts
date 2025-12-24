import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LeagueVisibility, ShowType } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateLeagueBody = {
    name: string;
    showType: ShowType;
    visibility: LeagueVisibility;
    maxPlayers: number;
};

export async function POST(req: Request) {
    const session = await getSession();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true },
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let body: CreateLeagueBody;
    try {
        body = (await req.json()) as CreateLeagueBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = (body.name ?? "").trim();
    const maxPlayers = Number(body.maxPlayers);

    if (!name) {
        return NextResponse.json({ error: "League name is required" }, { status: 400 });
    }
    if (!Object.values(ShowType).includes(body.showType)) {
        return NextResponse.json({ error: "Invalid showType" }, { status: 400 });
    }
    if (!Object.values(LeagueVisibility).includes(body.visibility)) {
        return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    }
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 50) {
        return NextResponse.json({ error: "maxPlayers must be between 2 and 50" }, { status: 400 });
    }

    const token = uuidv4();

    const league = await prisma.league.create({
        data: {
            name,
            showType: body.showType,
            visibility: body.visibility,
            maxPlayers,
            createdById: user.id,
            members: {
                create: {
                    userId: user.id,
                    role: "COMMISSIONER",
                },
            },
        },
        select: { id: true },
    });

    // Create invite separately (simple + reliable)
    const invite = await prisma.leagueInvite.create({
        data: {
            leagueId: league.id,
            token,
            isActive: true,
        },
        select: { token: true },
    });

    return NextResponse.json(
        { id: league.id, inviteToken: invite.token },
        { status: 201 }
    );

}
