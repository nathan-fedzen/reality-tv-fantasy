import { NextResponse } from "next/server";
import {
  Prisma,
  SurvivorAdvantageType,
  SurvivorAuctionStatus,
  SurvivorAuctionType,
} from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { survivorEntryCurrencyBalance } from "@/lib/survivor/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const V1_ADVANTAGES: SurvivorAdvantageType[] = [
  "DOUBLE_EPISODE",
  "IDOL_INSURANCE",
  "PREDICTION_SHIELD",
];

type CreateAuctionPayload = {
  name: string;
  type?: SurvivorAuctionType;
  opensAt?: string | null;
  closesAt?: string | null;
  lots: Array<{
    advantageType: SurvivorAdvantageType;
    title: string;
    description?: string | null;
    quantity?: number;
    startingBid?: number;
  }>;
};

function parseIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      showType: true,
      createdById: true,
      survivorAuctionActivatedAt: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });

  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json({ error: "Survivor-only route." }, { status: 400 });
  }
  if (league.members.length === 0) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const isCommissioner = league.createdById === user.id;
  const isActivated = !!league.survivorAuctionActivatedAt;
  if (!isActivated && !isCommissioner) {
    return NextResponse.json({ error: "Auction House is not active yet." }, { status: 403 });
  }

  const [entry, auctions, ownedAdvantages] = await Promise.all([
    prisma.leagueEntry.upsert({
      where: { leagueId_userId: { leagueId, userId: user.id } },
      create: { leagueId, userId: user.id },
      update: {},
      select: { id: true },
    }),
    prisma.survivorAuction.findMany({
      where: { leagueId },
      orderBy: { createdAt: "desc" },
      include: {
        lots: {
          orderBy: { createdAt: "asc" },
          include: {
            bids: {
              orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
              include: {
                leagueEntry: {
                  select: {
                    id: true,
                    user: { select: { id: true, name: true, displayName: true, email: true } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.survivorOwnedAdvantage.findMany({
      where: { leagueId, leagueEntry: { userId: user.id } },
      orderBy: { awardedAt: "desc" },
      select: {
        id: true,
        advantageType: true,
        title: true,
        status: true,
        awardedAt: true,
        usedAt: true,
        effectConfig: true,
        lot: { select: { title: true } },
      },
    }),
  ]);

  const balance = await survivorEntryCurrencyBalance(prisma, leagueId, entry.id);

  const auctionsView = auctions.map((auction) => {
    const isResolved = auction.status === "RESOLVED";
    return {
      id: auction.id,
      name: auction.name,
      type: auction.type,
      status: auction.status,
      opensAt: auction.opensAt,
      closesAt: auction.closesAt,
      resolvedAt: auction.resolvedAt,
      lots: auction.lots.map((lot) => {
        const myBid = lot.bids.find((bid) => bid.leagueEntryId === entry.id) ?? null;
        const sortedBids = [...lot.bids].sort((a, b) => {
          const byAmount = toNumber(b.amount) - toNumber(a.amount);
          if (byAmount !== 0) return byAmount;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        const winningBids = sortedBids.filter((bid) => bid.isWinning);

        return {
          id: lot.id,
          advantageType: lot.advantageType,
          title: lot.title,
          description: lot.description,
          quantity: lot.quantity,
          startingBid: toNumber(lot.startingBid),
          myBid: myBid
            ? {
                id: myBid.id,
                amount: toNumber(myBid.amount),
                isWinning: myBid.isWinning,
                createdAt: myBid.createdAt,
              }
            : null,
          bidCount: lot.bids.length,
          winningBids: isResolved
            ? winningBids.map((bid) => ({
                id: bid.id,
                amount: toNumber(bid.amount),
                entryId: bid.leagueEntry.id,
                displayName:
                  bid.leagueEntry.user.displayName ??
                  bid.leagueEntry.user.name ??
                  bid.leagueEntry.user.email ??
                  "Unknown",
              }))
            : [],
          allBids:
            isCommissioner || isResolved
              ? sortedBids.map((bid) => ({
                  id: bid.id,
                  amount: toNumber(bid.amount),
                  isWinning: bid.isWinning,
                  entryId: bid.leagueEntry.id,
                  displayName:
                    bid.leagueEntry.user.displayName ??
                    bid.leagueEntry.user.name ??
                    bid.leagueEntry.user.email ??
                    "Unknown",
                }))
              : [],
        };
      }),
    };
  });

  return NextResponse.json({
    viewer: {
      entryId: entry.id,
      isCommissioner,
      currencyBalance: balance,
    },
    isActivated,
    activatedAt: league.survivorAuctionActivatedAt,
    v1Advantages: V1_ADVANTAGES,
    auctions: auctionsView,
    ownedAdvantages,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leagueId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: { id: true, showType: true, createdById: true, survivorAuctionActivatedAt: true },
  });
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json({ error: "Survivor-only route." }, { status: 400 });
  }
  if (league.createdById !== user.id) {
    return NextResponse.json({ error: "Only commissioner can create auctions." }, { status: 403 });
  }
  if (!league.survivorAuctionActivatedAt) {
    return NextResponse.json(
      { error: "Activate Auction House before creating auctions." },
      { status: 400 }
    );
  }

  let body: CreateAuctionPayload;
  try {
    body = (await req.json()) as CreateAuctionPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Auction name is required." }, { status: 400 });

  if (!Array.isArray(body.lots) || body.lots.length === 0) {
    return NextResponse.json({ error: "At least one lot is required." }, { status: 400 });
  }

  const opensAt = parseIsoDate(body.opensAt);
  const closesAt = parseIsoDate(body.closesAt);
  if (body.opensAt && !opensAt) {
    return NextResponse.json({ error: "Invalid opensAt date." }, { status: 400 });
  }
  if (body.closesAt && !closesAt) {
    return NextResponse.json({ error: "Invalid closesAt date." }, { status: 400 });
  }
  if (opensAt && closesAt && closesAt <= opensAt) {
    return NextResponse.json({ error: "closesAt must be after opensAt." }, { status: 400 });
  }

  const lots = body.lots.map((lot, index) => {
    const title = (lot.title ?? "").trim();
    const quantity = Math.max(1, Math.floor(Number(lot.quantity ?? 1)));
    const startingBid = Number(lot.startingBid ?? 0);
    if (!V1_ADVANTAGES.includes(lot.advantageType)) {
      throw new Error(`Lot ${index + 1} has unsupported advantage type.`);
    }
    if (!title) throw new Error(`Lot ${index + 1} is missing a title.`);
    if (!Number.isFinite(startingBid) || startingBid < 0) {
      throw new Error(`Lot ${index + 1} has invalid starting bid.`);
    }
    return {
      advantageType: lot.advantageType,
      title,
      description: lot.description?.trim() || null,
      quantity,
      startingBid,
    };
  });

  const now = new Date();
  const initialStatus: SurvivorAuctionStatus =
    opensAt && opensAt > now ? "SCHEDULED" : "OPEN";

  try {
    const created = await prisma.survivorAuction.create({
      data: {
        leagueId,
        name,
        type: body.type ?? "HIDDEN_BID",
        status: initialStatus,
        opensAt,
        closesAt,
        lots: {
          create: lots.map((lot) => ({
            advantageType: lot.advantageType,
            title: lot.title,
            description: lot.description,
            quantity: lot.quantity,
            startingBid: new Prisma.Decimal(lot.startingBid),
          })),
        },
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ ok: true, auction: created });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create auction." }, { status: 500 });
  }
}
