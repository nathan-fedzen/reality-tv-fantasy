"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type AuctionData = {
  viewer: {
    entryId: string;
    isCommissioner: boolean;
    currencyBalance: number;
  };
  v1Advantages: Array<"DOUBLE_EPISODE" | "IDOL_INSURANCE" | "PREDICTION_SHIELD">;
  auctions: Array<{
    id: string;
    name: string;
    status: "SCHEDULED" | "OPEN" | "CLOSED" | "RESOLVED";
    opensAt: string | null;
    closesAt: string | null;
    resolvedAt: string | null;
    lots: Array<{
      id: string;
      advantageType: "DOUBLE_EPISODE" | "IDOL_INSURANCE" | "PREDICTION_SHIELD";
      title: string;
      description: string | null;
      quantity: number;
      startingBid: number;
      bidCount: number;
      myBid: {
        id: string;
        amount: number;
        isWinning: boolean;
        createdAt: string;
      } | null;
      winningBids: Array<{
        id: string;
        amount: number;
        entryId: string;
        displayName: string;
      }>;
      allBids: Array<{
        id: string;
        amount: number;
        isWinning: boolean;
        entryId: string;
        displayName: string;
      }>;
    }>;
  }>;
  ownedAdvantages: Array<{
    id: string;
    advantageType: "DOUBLE_EPISODE" | "IDOL_INSURANCE" | "PREDICTION_SHIELD";
    title: string;
    status: "ACTIVE" | "USED" | "EXPIRED";
    awardedAt: string;
    usedAt: string | null;
    effectConfig: unknown;
    lot: { title: string } | null;
  }>;
};

function parseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const err = (json as { error?: unknown }).error;
  return typeof err === "string" ? err : fallback;
}

export default function SurvivorAuctionPanel(props: { leagueId: string; week: number }) {
  const { leagueId, week } = props;
  const [isPending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<AuctionData | null>(null);
  const [bidAmounts, setBidAmounts] = useState<Record<string, string>>({});

  async function loadData() {
    setLoading(true);
    const res = await fetch(`/api/leagues/${leagueId}/survivor/auction`, {
      method: "GET",
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as AuctionData | null;
    if (!res.ok || !json) {
      setMessage(parseError(json, "Failed to load auction panel."));
      setLoading(false);
      return;
    }
    setData(json);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  const openAuctions = useMemo(
    () => (data?.auctions ?? []).filter((auction) => auction.status === "OPEN"),
    [data]
  );

  async function createStandardAuction() {
    startTransition(async () => {
      setMessage("");
      const res = await fetch(`/api/leagues/${leagueId}/survivor/auction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Mid-season V1 Auction (Week ${week})`,
          type: "HIDDEN_BID",
          lots: [
            {
              advantageType: "DOUBLE_EPISODE",
              title: "Double Episode",
              description: "Doubles one week's points when used.",
              quantity: 1,
              startingBid: 5,
            },
            {
              advantageType: "IDOL_INSURANCE",
              title: "Idol Insurance",
              description: "Protection bonus if a roster castaway is eliminated.",
              quantity: 1,
              startingBid: 5,
            },
            {
              advantageType: "PREDICTION_SHIELD",
              title: "Prediction Shield",
              description: "Guarantees a minimum prediction score for one week.",
              quantity: 1,
              startingBid: 5,
            },
          ],
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseError(json, "Failed to create auction."));
        return;
      }
      setMessage("Auction created.");
      await loadData();
    });
  }

  async function placeBid(auctionId: string, lotId: string) {
    startTransition(async () => {
      setMessage("");
      const amount = Number(bidAmounts[lotId] ?? "");
      const res = await fetch(
        `/api/leagues/${leagueId}/survivor/auction/${auctionId}/bid`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lotId, amount }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseError(json, "Failed to place bid."));
        return;
      }
      setMessage("Bid placed.");
      await loadData();
    });
  }

  async function resolveAuction(auctionId: string) {
    startTransition(async () => {
      setMessage("");
      const res = await fetch(
        `/api/leagues/${leagueId}/survivor/auction/${auctionId}/resolve`,
        {
          method: "POST",
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseError(json, "Failed to resolve auction."));
        return;
      }
      setMessage("Auction resolved.");
      await loadData();
    });
  }

  async function applyAdvantage(advantageId: string) {
    startTransition(async () => {
      setMessage("");
      const res = await fetch(
        `/api/leagues/${leagueId}/survivor/advantages/${advantageId}/use`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ week }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseError(json, "Failed to use advantage."));
        return;
      }
      setMessage("Advantage queued for this week.");
      await loadData();
    });
  }

  if (loading) {
    return (
      <section className="rounded-md border p-3 text-sm text-muted-foreground">
        Loading auction panel...
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-md border p-3 text-sm">
        Failed to load auction panel.
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-md border p-3">
      <div className="text-sm">
        <div className="font-medium">Mid-season auction + advantages</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Currency balance: <span className="font-semibold">{data.viewer.currencyBalance.toFixed(2)}</span>
        </p>
      </div>

      {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

      {data.viewer.isCommissioner && openAuctions.length === 0 && (
        <Button type="button" onClick={createStandardAuction} disabled={isPending}>
          Create Standard V1 Auction
        </Button>
      )}

      <div className="space-y-3">
        {data.auctions.length === 0 && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
            No auctions yet.
          </div>
        )}

        {data.auctions.map((auction) => (
          <div key={auction.id} className="rounded-md border p-2 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{auction.name}</div>
                <div className="text-xs text-muted-foreground">
                  Status: {auction.status}
                </div>
              </div>
              {data.viewer.isCommissioner && auction.status !== "RESOLVED" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => resolveAuction(auction.id)}
                >
                  Resolve
                </Button>
              )}
            </div>

            <div className="space-y-2">
              {auction.lots.map((lot) => (
                <div key={lot.id} className="rounded-md border p-2">
                  <div className="text-sm font-medium">{lot.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {lot.advantageType} · Starting bid {lot.startingBid.toFixed(2)} · Qty {lot.quantity}
                  </div>
                  {lot.description && (
                    <div className="text-xs text-muted-foreground">{lot.description}</div>
                  )}

                  <div className="mt-2 text-xs">
                    My bid: {lot.myBid ? lot.myBid.amount.toFixed(2) : "None"}
                  </div>

                  {auction.status === "OPEN" && (
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="w-32 rounded-md border px-2 py-1 text-sm"
                        value={bidAmounts[lot.id] ?? ""}
                        onChange={(e) =>
                          setBidAmounts((prev) => ({ ...prev, [lot.id]: e.target.value }))
                        }
                        disabled={isPending}
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isPending}
                        onClick={() => placeBid(auction.id, lot.id)}
                      >
                        Place bid
                      </Button>
                    </div>
                  )}

                  {auction.status === "RESOLVED" && lot.winningBids.length > 0 && (
                    <div className="mt-2 text-xs">
                      Winners:{" "}
                      {lot.winningBids
                        .map((winner) => `${winner.displayName} (${winner.amount.toFixed(2)})`)
                        .join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium">Advantage inventory</div>
        {data.ownedAdvantages.length === 0 && (
          <div className="rounded-md border bg-muted/20 p-2 text-xs text-muted-foreground">
            No owned advantages.
          </div>
        )}
        {data.ownedAdvantages.map((advantage) => (
          <div key={advantage.id} className="rounded-md border p-2">
            <div className="text-sm font-medium">{advantage.title}</div>
            <div className="text-xs text-muted-foreground">
              {advantage.advantageType} · {advantage.status}
            </div>
            {advantage.status === "ACTIVE" && (
              <div className="mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => applyAdvantage(advantage.id)}
                >
                  Use on week {week}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
