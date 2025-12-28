"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ThemeToggle from "@/components/theme-toggle";

function NavLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "relative rounded-full px-4 py-1.5 text-sm font-semibold transition",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function AppNav({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click / escape
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onMouseDown(e: MouseEvent) {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex h-14 items-center gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2">
            <div className="font-semibold whitespace-nowrap">
              Reality TV Fantasy
            </div>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
              alpha
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-2 ml-6">
            <NavLink href="/dashboard" label="Dashboard" />
            {/* future
            <NavLink href="/rules" label="Rules" />
            <NavLink href="/account" label="Account" />
            */}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2 min-w-0">
            {/* User */}
            <div className="hidden sm:block min-w-0 max-w-[220px] truncate text-sm text-muted-foreground">
              {userName}
            </div>

            {/* Theme toggle */}
            <ThemeToggle />

            {/* Mobile menu */}
            <div className="relative md:hidden" ref={menuRef}>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:bg-accent transition"
              >
                Menu
              </button>

              {open && (
                <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-border bg-card shadow-lg p-1 z-50">
                  <NavLink
                    href="/dashboard"
                    label="Dashboard"
                    onClick={() => setOpen(false)}
                  />

                  <div className="my-1 border-t border-border" />

                  <form action="/api/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full rounded-full px-4 py-2 text-left text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition"
                      onClick={() => setOpen(false)}
                    >
                      Log out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

