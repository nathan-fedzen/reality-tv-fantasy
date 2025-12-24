"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LeagueVisibility, ShowType } from "@prisma/client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export default function CreateLeagueForm() {
    const router = useRouter();

    const [name, setName] = useState("");
    const [showType, setShowType] = useState<ShowType>(ShowType.SURVIVOR);
    const [visibility, setVisibility] = useState<LeagueVisibility>(LeagueVisibility.PRIVATE);
    const [maxPlayers, setMaxPlayers] = useState(12);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const joinPreview = useMemo(() => {
        return visibility === LeagueVisibility.PUBLIC
            ? "Anyone with the link can join."
            : "Only people with the invite link can join.";
    }, [visibility]);

    async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setError(null);
  setLoading(true);

  try {
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        showType,
        visibility,
        maxPlayers,
      }),
    });

    // Read raw text first (prevents silent JSON parsing failures)
    const raw = await res.text();
    let data: any = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }

    console.log("Create league response:", { status: res.status, raw, data });

    if (!res.ok) {
      setError(data?.error ?? `Failed to create league (HTTP ${res.status})`);
      return;
    }

    if (!data?.id || typeof data.id !== "string") {
      setError("League created but no id returned. Check console/server logs.");
      return;
    }

    router.push(`/leagues/${data.id}`);
  } catch (err) {
    console.error(err);
    setError("Network error. Please try again.");
  } finally {
    setLoading(false);
  }
}


    return (
        <Card>
            <CardHeader>
                <CardTitle>League details</CardTitle>
            </CardHeader>
            <CardContent>
                <form className="space-y-5" onSubmit={onSubmit}>
                    <div className="space-y-2">
                        <Label htmlFor="name">League name</Label>
                        <Input
                            id="name"
                            placeholder="Survivor S50 — Denver Crew"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={60}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Show</Label>
                        <Select value={showType} onValueChange={(v) => setShowType(v as ShowType)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select a show" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ShowType.SURVIVOR}>Survivor</SelectItem>
                                <SelectItem value={ShowType.DRAG_RACE}>Drag Race</SelectItem>
                                <SelectItem value={ShowType.GENERIC}>Generic</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>Visibility</Label>
                        <Select value={visibility} onValueChange={(v) => setVisibility(v as LeagueVisibility)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select visibility" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={LeagueVisibility.PRIVATE}>Private</SelectItem>
                                <SelectItem value={LeagueVisibility.PUBLIC}>Public</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{joinPreview}</p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="maxPlayers">Max players</Label>
                        <Input
                            id="maxPlayers"
                            type="number"
                            min={2}
                            max={50}
                            value={maxPlayers}
                            onChange={(e) => setMaxPlayers(Number(e.target.value))}
                            required
                        />
                    </div>

                    {error && (
                        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                            {error}
                        </div>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Creating..." : "Create league"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
