"use client";

import { useState } from "react";

export default function CopyButton({
  text,
  className = "",
  label = "Copy",
}: {
  text: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Fallback for some browsers
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-label={label}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="break-all text-left text-muted-foreground">{text}</span>
        <span className="shrink-0 text-xs font-medium">
          {copied ? "Copied!" : "Copy"}
        </span>
      </div>
    </button>
  );
}
