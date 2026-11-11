"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  InboxIcon,
  KanbanIcon,
  CalendarIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
} from "lucide-react";
import type { Route } from "next";
import { cn, initials } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/permissions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV_GROUPS } from "./nav";
import { ClubMark, isActivePath, useSignOut } from "./sidebar";
import { useCan, useViewer } from "./viewer";

const TABS: { href: Route; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/meetings", label: "Meetings", icon: CalendarIcon },
];

/**
 * Phone navigation. The three things that genuinely happen on a phone — the
 * inbox (votes live there), the pipeline (coffee-chat logging) and meetings
 * (attendance, run mode) — get a thumb-reachable tab each; everything else
 * sits one tap away in the menu sheet.
 */
export function MobileNav({
  orgName,
  inboxCount,
  onNewApplication,
  onSearch,
}: {
  orgName: string;
  inboxCount: number;
  onNewApplication: () => void;
  onSearch: () => void;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const canContribute = useCan("contribute");
  const isAdmin = useCan("manageClub");
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const tabActive = TABS.some((t) => isActivePath(pathname, t.href));

  return (
    <>
      <nav
        aria-label="Primary"
        className="pb-safe z-40 flex shrink-0 border-t border-border bg-panel md:hidden print:hidden"
      >
        {TABS.slice(0, 2).map((t) => (
          <Tab key={t.href} {...t} active={isActivePath(pathname, t.href)}>
            {t.href === "/inbox" && inboxCount > 0 && (
              <span className="tnum absolute left-1/2 top-1.5 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-fg">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </Tab>
        ))}
        {canContribute && (
          <button
            onClick={onNewApplication}
            aria-label="New application"
            className="flex h-14 flex-1 cursor-pointer items-center justify-center outline-none"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm active:scale-95">
              <PlusIcon className="size-5" />
            </span>
          </button>
        )}
        {TABS.slice(2).map((t) => (
          <Tab key={t.href} {...t} active={isActivePath(pathname, t.href)} />
        ))}
        <button
          onClick={() => setMenuOpen(true)}
          className={cn(
            "flex h-14 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium outline-none",
            !tabActive ? "text-accent" : "text-fg-subtle"
          )}
        >
          <MenuIcon className="size-5" />
          Menu
        </button>
      </nav>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="flex max-h-[85svh] flex-col gap-0 overflow-hidden p-0 md:hidden">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
            <ClubMark name={orgName} className="size-8 text-xs" />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold">{orgName}</div>
              <div className="truncate text-xs text-fg-subtle">
                {viewer.name} · {ROLE_LABEL[viewer.role]}
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <button
              onClick={() => {
                setMenuOpen(false);
                onSearch();
              }}
              className="mb-1 flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg bg-bg-subtle px-3 text-base text-fg-muted"
            >
              <SearchIcon className="size-[18px]" />
              Search
            </button>
            {NAV_GROUPS.map((group, i) => (
              <div key={group.label ?? i} className="py-1">
                {group.label && (
                  <div className="px-3 pb-1 pt-2 text-xs font-medium text-fg-subtle">{group.label}</div>
                )}
                {group.items
                  .filter((item) => !item.adminOnly || isAdmin)
                  .map((item) => {
                    const active = isActivePath(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex h-11 items-center gap-3 rounded-lg px-3 text-base",
                          active ? "bg-accent-subtle font-medium text-accent" : "text-fg"
                        )}
                      >
                        <item.icon className={cn("size-[18px]", !active && "text-fg-subtle")} />
                        {item.label}
                      </Link>
                    );
                  })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-4 py-3">
            <Link
              href={`/members/${viewer.memberId}`}
              onClick={() => setMenuOpen(false)}
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold text-accent">
                {initials(viewer.name)}
              </span>
              <span className="truncate text-sm font-medium">My profile</span>
            </Link>
            <button
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
              className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-bg-subtle"
            >
              <SunIcon className="size-[18px] dark:hidden" />
              <MoonIcon className="hidden size-[18px] dark:block" />
            </button>
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-fg-muted hover:bg-bg-subtle"
            >
              <LogOutIcon className="size-[18px]" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
  children,
}: {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium outline-none",
        active ? "text-accent" : "text-fg-subtle"
      )}
    >
      <Icon className="size-5" />
      {label}
      {children}
    </Link>
  );
}
