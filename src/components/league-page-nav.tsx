import Link from "next/link";
import { cn } from "@/lib/utils";

type LeaguePageKey =
  | "overview"
  | "leaderboard"
  | "picks"
  | "weeks"
  | "survivors"
  | "guide"
  | "auction"
  | "commissioner-updates";

type LeaguePageNavProps = {
  leagueId: string;
  showType: string;
  isCommissioner: boolean;
  currentPage: LeaguePageKey;
  className?: string;
};

type NavItem = {
  key: LeaguePageKey;
  href: string;
  label: string;
  mobileLabel?: string;
  mobileWide?: boolean;
};

export default function LeaguePageNav({
  leagueId,
  showType,
  isCommissioner,
  currentPage,
  className,
}: LeaguePageNavProps) {
  const picksLabel = showType === "SURVIVOR" ? "Draft" : "Picks";
  const items: NavItem[] = [
    { key: "overview", href: `/leagues/${leagueId}`, label: "Overview" },
    { key: "leaderboard", href: `/leagues/${leagueId}/leaderboard`, label: "Leaderboard" },
    { key: "picks", href: `/leagues/${leagueId}/picks`, label: picksLabel },
    { key: "weeks", href: `/leagues/${leagueId}/weeks`, label: "Weeks" },
  ];

  if (showType === "SURVIVOR") {
    items.push({
      key: "survivors",
      href: `/leagues/${leagueId}/survivors`,
      label: "Survivor Stats",
      mobileLabel: "Survivors",
    });
    items.push({
      key: "guide",
      href: `/leagues/${leagueId}/guide`,
      label: "Player Guide",
      mobileLabel: "Guide",
    });
    items.push({
      key: "auction",
      href: `/leagues/${leagueId}/auction`,
      label: "Auction House",
      mobileLabel: "Auction",
    });
  }

  if (showType === "SURVIVOR" && isCommissioner) {
    items.push({
      key: "commissioner-updates",
      href: `/leagues/${leagueId}/commissioner-updates`,
      label: "Commissioner Updates",
      mobileLabel: "Commissioner",
      mobileWide: true,
    });
  }

  return (
    <nav aria-label="League pages" className={cn("rounded-2xl border border-border/70 bg-background/30 p-2", className)}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => {
          const isActive = item.key === currentPage;
          return (
            <li key={item.key} className={cn(item.mobileWide ? "col-span-2 sm:col-span-1" : "")}>
              <Link
                href={item.href}
                className={cn(
                  "inline-flex h-10 w-full touch-manipulation select-none items-center justify-center rounded-full border px-3 text-[13px] font-semibold leading-none transition duration-150 active:scale-[0.98] sm:text-sm",
                  isActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm active:bg-primary/90"
                    : "border-border bg-card hover:bg-accent active:bg-accent/85"
                )}
              >
                <span className="sm:hidden">{item.mobileLabel ?? item.label}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
