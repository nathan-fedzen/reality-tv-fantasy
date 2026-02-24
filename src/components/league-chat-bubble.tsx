"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type MessageRow = {
  id: string;
  body: string;
  createdAt: string;
  authorMemberId: string;
  authorUserId: string;
  authorName: string;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function LeagueChatBubble(props: {
  leagueId: string;
  currentUserId: string;
}) {
  const { leagueId, currentUserId } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const hasMessages = messages.length > 0;

  async function loadMessages() {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/messages?limit=120`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { messages?: MessageRow[]; error?: string }
        | null;

      if (!res.ok) {
        setError(json?.error ?? "Failed to load chat.");
        return;
      }
      setMessages(Array.isArray(json?.messages) ? json!.messages : []);
    } catch {
      setError("Failed to load chat.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    void loadMessages();

    const timer = window.setInterval(() => {
      void loadMessages();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [isOpen, leagueId]);

  useEffect(() => {
    if (!isOpen) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isOpen]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;

    setIsSending(true);
    setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!res.ok) {
        setError(json?.error ?? "Failed to send message.");
        return;
      }

      setDraft("");
      await loadMessages();
    } catch {
      setError("Failed to send message.");
    } finally {
      setIsSending(false);
    }
  }

  const toggleLabel = useMemo(() => (isOpen ? "Close Chat" : "League Chat"), [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed right-0 top-1/2 z-40 -translate-y-1/2 rounded-l-2xl border border-r-0 border-primary/35 bg-primary/15 px-3 py-3 text-xs font-semibold text-primary shadow-lg backdrop-blur-sm transition hover:bg-primary/25"
        aria-expanded={isOpen}
        aria-label={toggleLabel}
      >
        <span className="[writing-mode:vertical-rl] rotate-180 tracking-wide">
          {toggleLabel}
        </span>
      </button>

      {isOpen && (
        <aside className="fixed inset-y-0 right-0 z-50 w-[min(94vw,400px)] border-l border-border bg-background/95 shadow-2xl backdrop-blur-md">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold">League chat</p>
                <p className="text-[11px] text-muted-foreground">General channel</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-accent"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3">
              {isLoading && !hasMessages && (
                <p className="text-xs text-muted-foreground">Loading messages...</p>
              )}
              {!isLoading && !hasMessages && (
                <p className="text-xs text-muted-foreground">
                  No messages yet. Start the conversation.
                </p>
              )}
              <div className="space-y-2">
                {messages.map((message) => {
                  const mine = message.authorUserId === currentUserId;
                  return (
                    <div
                      key={message.id}
                      className={[
                        "max-w-[92%] rounded-2xl border px-3 py-2",
                        mine
                          ? "ml-auto border-primary/40 bg-primary/12"
                          : "mr-auto border-border bg-card/80",
                      ].join(" ")}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate font-semibold">
                          {mine ? "You" : message.authorName}
                        </span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {message.body}
                      </p>
                    </div>
                  );
                })}
              </div>
              <div ref={bottomRef} />
            </div>

            <form onSubmit={onSubmit} className="border-t border-border p-3">
              {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Send a message..."
                  className="max-h-32 min-h-10 flex-1 resize-y rounded-xl border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/35"
                  rows={2}
                  maxLength={1000}
                />
                <button
                  type="submit"
                  disabled={isSending || !draft.trim()}
                  className="rounded-xl border border-primary/35 bg-primary/15 px-3 py-2 text-xs font-semibold text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </div>
        </aside>
      )}
    </>
  );
}

