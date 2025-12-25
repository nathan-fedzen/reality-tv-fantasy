"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      className={[
        "rounded px-3 py-2 text-sm",
        active ? "bg-black text-white" : "text-muted-foreground hover:text-foreground hover:bg-muted",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export default function AppNav({ userName }: { userName: string }) {
  return (
    <header className="border-b">
      <div className="mx-auto max-w-5xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="font-semibold">Reality TV Fantasy</div>
          <span className="text-xs text-muted-foreground">alpha</span>
        </div>

        <nav className="flex items-center gap-2">
          <NavLink href="/dashboard" label="Dashboard" />
          {/* future: <NavLink href="/settings" label="Settings" /> */}
        </nav>

        <div className="text-sm text-muted-foreground truncate max-w-[180px]">
          {userName}
        </div>
      </div>
    </header>
  );
}
