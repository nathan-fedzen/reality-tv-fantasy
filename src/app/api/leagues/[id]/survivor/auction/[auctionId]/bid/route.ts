import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { survivorEntryCurrencyBalance } from "@/lib/survivor/currency";

type BidPayload = {
  lotId: string;
  amount: number;
};

function toNumber(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; auctionId: string }> }
) {
  const { id: leagueId, auctionId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: BidPayload;
  try {
    body = (await req.json()) as BidPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const lotId = (body.lotId ?? "").trim();
  const amount = Number(body.amount);
  if (!lotId) return NextResponse.json({ error: "lotId is required." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Bid amount must be positive." }, { status: 400 });
  }

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      showType: true,
      survivorAuctionActivatedAt: true,
      members: { where: { userId: user.id }, select: { id: true } },
    },
  });
  if (!league) return NextResponse.json({ error: "League not found." }, { status: 404 });
  if (league.showType !== "SURVIVOR") {
    return NextResponse.json({ error: "Survivor-only route." }, { status: 400 });
  }
  if (!league.survivorAuctionActivatedAt) {
    return NextResponse.json({ error: "Auction House is not active yet." }, { status: 400 });
  }
  if (league.members.length === 0) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.leagueEntry.upsert({
        where: { leagueId_userId: { leagueId, userId: user.id } },
        create: { leagueId, userId: user.id },
        update: {},
        select: { id: true },
      });

      const auction = await tx.survivorAuction.findFirst({
        where: { id: auctionId, leagueId },
        select: {
          id: true,
          status: true,
          opensAt: true,
          closesAt: true,
          lots: { select: { id: true } },
        },
      });
      if (!auction) throw new Error("AUCTION_NOT_FOUND");

      const now = new Date();
      if (auction.status === "SCHEDULED" && (!auction.opensAt || now >= auction.opensAt)) {
        await tx.survivorAuction.update({
          where: { id: auction.id },
          data: { status: "OPEN" },
        });
        auction.status = "OPEN";
      }
      if (auction.status !== "OPEN") throw new Error("AUCTION_NOT_OPEN");
      if (auction.closesAt && now > auction.closesAt) throw new Error("AUCTION_CLOSED");

      const lot = await tx.survivorAuctionLot.findFirst({
        where: {
          id: lotId,
          auctionId: auction.id,
        },
        select: {
          id: true,
          startingBid: true,
        },
      });
      if (!lot) throw new Error("LOT_NOT_FOUND");

      const minBid = toNumber(lot.startingBid);
      if (amount < minBid) {
        throw new Error("BID_BELOW_START");
      }

      const existingBids = await tx.survivorAuctionBid.findMany({
        where: { auctionId: auction.id, leagueEntryId: entry.id },
        select: { id: true, lotId: true, amount: true },
      });

      const committed =
        existingBids.reduce((acc, bid) => {
          if (bid.lotId === lot.id) return acc;
          return acc + toNumber(bid.amount);
        }, 0) + amount;

      const balance = await survivorEntryCurrencyBalance(tx, leagueId, entry.id);
      if (committed > balance) throw new Error("INSUFFICIENT_BALANCE");

      await tx.survivorAuctionBid.deleteMany({
        where: { auctionId: auction.id, lotId: lot.id, leagueEntryId: entry.id },
      });

      const created = await tx.survivorAuctionBid.create({
        data: {
          auctionId: auction.id,
          lotId: lot.id,
          leagueEntryId: entry.id,
          amount: new Prisma.Decimal(amount),
        },
        select: {
          id: true,
          amount: true,
          createdAt: true,
        },
      });

      return { bid: created, committed, balance };
    });

    return NextResponse.json({
      ok: true,
      bid: {
        id: result.bid.id,
        amount: toNumber(result.bid.amount),
        createdAt: result.bid.createdAt,
      },
      committed: result.committed,
      balance: result.balance,
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "AUCTION_NOT_FOUND":
          return NextResponse.json({ error: "Auction not found." }, { status: 404 });
        case "AUCTION_NOT_OPEN":
        case "AUCTION_CLOSED":
          return NextResponse.json({ error: "Auction is not open for bidding." }, { status: 400 });
        case "LOT_NOT_FOUND":
          return NextResponse.json({ error: "Lot not found for this auction." }, { status: 404 });
        case "BID_BELOW_START":
          return NextResponse.json({ error: "Bid is below starting bid." }, { status: 400 });
        case "INSUFFICIENT_BALANCE":
          return NextResponse.json(
            { error: "Insufficient currency balance for this bid." },
            { status: 400 }
          );
        default:
          break;
      }
    }

    return NextResponse.json({ error: "Failed to place bid." }, { status: 500 });
  }
}
