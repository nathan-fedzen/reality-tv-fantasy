import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { survivorEntryBalances } from "@/lib/survivor/currency";

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
  _req: Request,
  { params }: { params: Promise<{ id: string; auctionId: string }> }
) {
  const { id: leagueId, auctionId } = await params;

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
  if (!league.survivorAuctionActivatedAt) {
    return NextResponse.json({ error: "Auction House is not active yet." }, { status: 400 });
  }
  if (league.createdById !== user.id) {
    return NextResponse.json({ error: "Only commissioner can resolve auctions." }, { status: 403 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.survivorAuction.findFirst({
        where: { id: auctionId, leagueId },
        select: {
          id: true,
          status: true,
          closesAt: true,
          lots: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              title: true,
              advantageType: true,
              quantity: true,
              bids: {
                orderBy: [{ amount: "desc" }, { createdAt: "asc" }],
                select: {
                  id: true,
                  leagueEntryId: true,
                  amount: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
      if (!auction) throw new Error("AUCTION_NOT_FOUND");
      if (auction.status === "RESOLVED") throw new Error("ALREADY_RESOLVED");

      const bidderEntryIds = Array.from(
        new Set(
          auction.lots
            .flatMap((lot) => lot.bids.map((bid) => bid.leagueEntryId))
            .filter(Boolean)
        )
      );

      const balances = await survivorEntryBalances(tx, leagueId, bidderEntryIds);
      const remaining = new Map<string, number>();
      for (const entryId of bidderEntryIds) {
        remaining.set(entryId, balances.get(entryId) ?? 0);
      }

      const winningBidIds = new Set<string>();
      const winningRows: Array<{
        lotId: string;
        lotTitle: string;
        advantageType: "DOUBLE_EPISODE" | "IDOL_INSURANCE" | "PREDICTION_SHIELD";
        bidId: string;
        leagueEntryId: string;
        amount: number;
      }> = [];

      for (const lot of auction.lots) {
        const candidates = [...lot.bids].sort((a, b) => {
          const byAmount = toNumber(b.amount) - toNumber(a.amount);
          if (byAmount !== 0) return byAmount;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });

        let awarded = 0;
        for (const bid of candidates) {
          if (awarded >= lot.quantity) break;
          const amount = toNumber(bid.amount);
          const left = remaining.get(bid.leagueEntryId) ?? 0;
          if (amount > left) continue;

          winningBidIds.add(bid.id);
          winningRows.push({
            lotId: lot.id,
            lotTitle: lot.title,
            advantageType: lot.advantageType as
              | "DOUBLE_EPISODE"
              | "IDOL_INSURANCE"
              | "PREDICTION_SHIELD",
            bidId: bid.id,
            leagueEntryId: bid.leagueEntryId,
            amount,
          });
          remaining.set(bid.leagueEntryId, left - amount);
          awarded += 1;
        }
      }

      await tx.survivorAuctionBid.updateMany({
        where: { auctionId: auction.id },
        data: { isWinning: false },
      });

      if (winningBidIds.size > 0) {
        await tx.survivorAuctionBid.updateMany({
          where: { id: { in: Array.from(winningBidIds) } },
          data: { isWinning: true },
        });
      }

      for (const winner of winningRows) {
        const owned = await tx.survivorOwnedAdvantage.create({
          data: {
            leagueId,
            leagueEntryId: winner.leagueEntryId,
            lotId: winner.lotId,
            advantageType: winner.advantageType,
            title: winner.lotTitle,
            status: "ACTIVE",
            effectConfig: {
              kind: winner.advantageType,
            },
          },
          select: { id: true },
        });

        await tx.survivorPointTransaction.createMany({
          data: [
            {
              leagueId,
              leagueEntryId: winner.leagueEntryId,
              ownedAdvantageId: owned.id,
              source: "AUCTION_SPEND",
              amount: new Prisma.Decimal(-winner.amount),
              reason: `Auction spend for ${winner.lotTitle}`,
              metadata: {
                auctionId: auction.id,
                lotId: winner.lotId,
                bidId: winner.bidId,
                amount: winner.amount,
              },
            },
            {
              leagueId,
              leagueEntryId: winner.leagueEntryId,
              ownedAdvantageId: owned.id,
              source: "ADVANTAGE_AWARD",
              amount: new Prisma.Decimal(0),
              reason: `Awarded ${winner.lotTitle}`,
              metadata: {
                auctionId: auction.id,
                lotId: winner.lotId,
                bidId: winner.bidId,
              },
            },
          ],
        });
      }

      await tx.survivorAuction.update({
        where: { id: auction.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });

      return winningRows;
    });

    return NextResponse.json({
      ok: true,
      winners: result,
      message: "Auction resolved.",
    });
  } catch (err) {
    if (err instanceof Error) {
      switch (err.message) {
        case "AUCTION_NOT_FOUND":
          return NextResponse.json({ error: "Auction not found." }, { status: 404 });
        case "ALREADY_RESOLVED":
          return NextResponse.json({ error: "Auction is already resolved." }, { status: 400 });
        default:
          break;
      }
    }
    return NextResponse.json({ error: "Failed to resolve auction." }, { status: 500 });
  }
}
