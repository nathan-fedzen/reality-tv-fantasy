"use client";

import { useMemo, useState } from "react";

type InviteLinkProps = {
  inviteToken: string;
  leagueId?: string;
  // if you already have a full URL computed server-side, pass it instead
  inviteUrl?: string;
};

export default function InviteLink({ inviteToken, inviteUrl }: InviteLinkProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => {
    if (inviteUrl) return inviteUrl;

    // Fallback: build a relative URL. Better to pass inviteUrl from the server.
    return `/join/${inviteToken}`;
  }, [inviteUrl, inviteToken]);

  async function handleCopy() {
    setError(null);

    try {
      await navigator.clipboard.writeText(
        // If url is relative, make it absolute for sharing
        url.startsWith("http") ? url : `${window.location.origin}${url}`
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      setError("Couldn’t copy. Try selecting the link and copying manually.");
    }
  }

  const displayText = url.startsWith("http") ? url : url; // keep relative-looking if you want

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <code
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.15)",
            background: "rgba(0,0,0,0.04)",
            wordBreak: "break-all",
          }}
        >
          {displayText}
        </code>

        <button
          type="button"
          onClick={handleCopy}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      {error && <div style={{ color: "crimson", fontSize: 12 }}>{error}</div>}
    </div>
  );
}
