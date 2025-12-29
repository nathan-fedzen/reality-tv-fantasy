"use client";

import { useState, useTransition } from "react";
import { updateDisplayName } from "@/app/(app)/account/actions";

export default function DisplayNameForm({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState(initialValue);
  const [msg, setMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const res = await updateDisplayName(fd);
          setMsg(res.ok ? "Saved!" : res.error ?? "Error");
        })
      }
      className="flex gap-2 items-center"
    >
      <input
        name="displayName"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-1 rounded-md border px-3 py-2 bg-background"
        placeholder="Your display name"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md border px-3 py-2 hover:bg-accent disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Save"}
      </button>

      {msg && <p className="text-sm text-muted-foreground ml-2">{msg}</p>}
    </form>
  );
}
