"use client";

import { useEffect, useMemo, useState } from "react";

type ConfettiBurstProps = {
  triggerKey: string;
  count?: number;
};

type Piece = {
  id: string;
  left: number;
  delay: number;
  duration: number;
  rotate: number;
  size: number;
  drift: number;
  hue: number;
};

export default function ConfettiBurst({
  triggerKey,
  count = 36,
}: ConfettiBurstProps) {
  const [mounted, setMounted] = useState(false);
  const [run, setRun] = useState(0);

  // ✅ Only allow rendering AFTER hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Re-trigger when winner changes
  useEffect(() => {
    if (!mounted) return;
    setRun((v) => v + 1);
  }, [triggerKey, mounted]);

  const pieces = useMemo<Piece[]>(() => {
    if (!mounted) return [];

    const out: Piece[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        id: `${run}-${i}`,
        left: Math.random() * 100,
        delay: Math.random() * 0.15,
        duration: 1.2 + Math.random() * 0.9,
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 8,
        drift: (Math.random() - 0.5) * 220,
        hue: 320 + Math.random() * 90,
      });
    }
    return out;
  }, [run, count, mounted]);

  // 🚫 Render NOTHING on the server
  if (!mounted) return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="confetti-piece"
            style={
              {
                left: `${p.left}%`,
                width: `${p.size}px`,
                height: `${Math.max(6, p.size * 0.7)}px`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                transform: `rotate(${p.rotate}deg)`,
                background: `hsl(${p.hue} 90% 60%)`,
                "--drift": `${p.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <style>{`
        .confetti-piece {
          position: absolute;
          top: 0;
          border-radius: 999px;
          opacity: 0;
          animation-name: confetti-fall;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
        }

        @keyframes confetti-fall {
          0% {
            transform: translate3d(0, -10px, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          100% {
            transform: translate3d(var(--drift, 0px), 220px, 0)
              rotate(520deg);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
