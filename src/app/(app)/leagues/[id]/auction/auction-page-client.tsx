"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import SurvivorAuctionPanel from "@/components/survivor/auction-panel";
import { SURVIVOR_SEASON_WEEKS } from "@/lib/survivor/season";

function parseError(json: unknown, fallback: string) {
  if (!json || typeof json !== "object") return fallback;
  const error = (json as { error?: unknown }).error;
  return typeof error === "string" ? error : fallback;
}

export default function AuctionPageClient(props: {
  leagueId: string;
  isCommissioner: boolean;
  initialActivatedAtIso: string | null;
}) {
  const { leagueId, isCommissioner, initialActivatedAtIso } = props;
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [activatedAtIso, setActivatedAtIso] = useState(initialActivatedAtIso);
  const [week, setWeek] = useState(1);

  const isActivated = !!activatedAtIso;

  async function activate() {
    startTransition(async () => {
      setMessage("");
      const res = await fetch(`/api/leagues/${leagueId}/survivor/auction/activate`, {
        method: "POST",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(parseError(json, "Failed to activate auction house."));
        return;
      }

      const activatedAt = (json as { activatedAt?: string | null })?.activatedAt ?? null;
      if (activatedAt) {
        setActivatedAtIso(activatedAt);
      }
      setMessage("Auction House activated.");
    });
  }

  if (!isActivated) {
    return (
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">Auction House Locked</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This feature opens only after the commissioner activates it.
          </p>
        </div>

        {message && <div className="rounded-md border px-3 py-2 text-sm">{message}</div>}

        {isCommissioner ? (
          <Button type="button" onClick={activate} disabled={isPending}>
            {isPending ? "Activating..." : "Activate Auction House"}
          </Button>
        ) : (
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Waiting for commissioner activation.
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <label className="text-sm font-medium">
          Advantage application week
          <select
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm sm:w-64"
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            disabled={isPending}
          >
            {Array.from({ length: SURVIVOR_SEASON_WEEKS }, (_, index) => index + 1).map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SurvivorAuctionPanel leagueId={leagueId} week={week} />
    </section>
  );
}
