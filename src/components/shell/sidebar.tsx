"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronsUpDownIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
  UserIcon,
  SparklesIcon,
  PlugIcon,
  GraduationCapIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { cn, initials } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/permissions";
import { Kbd } from "@/components/patterns/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV_GROUPS, type NavItem } from "./nav";
import { useCan, useViewer } from "./viewer";

export type SetupProgress = { done: number; total: number };

export function ClubMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-md bg-fg text-[10px] font-semibold tracking-tight text-bg",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

export function useSignOut() {
  const router = useRouter();
  return React.useCallback(async () => {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);
}

export function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  orgName,
  inboxCount,
  pipelineCount,
  setup,
  onNewApplication,
  onSearch,
}: {
  orgName: string;
  inboxCount: number;
  pipelineCount: number;
  setup?: SetupProgress | null;
  onNewApplication?: () => void;
  onSearch?: () => void;
}) {
  const pathname = usePathname();
  const viewer = useViewer();
  const canContribute = useCan("contribute");
  const isAdmin = useCan("manageClub");
  const { resolvedTheme, setTheme } = useTheme();
  const signOut = useSignOut();

  return (
    <aside className="hidden w-60 shrink-0 flex-col md:flex">
      <div className="flex h-12 items-center gap-2 px-3.5">
        <ClubMark name={orgName} />
        <span className="truncate text-sm font-semibold tracking-tight">{orgName}</span>
      </div>

      <div className="flex gap-1.5 px-2.5 pb-2">
        <button
          onClick={onSearch}
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md border border-border bg-panel px-2.5 text-xs text-fg-subtle shadow-xs outline-none transition-colors hover:border-border-strong hover:text-fg-muted focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <SearchIcon className="size-3.5 shrink-0" />
          <span className="truncate">Search</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
        {canContribute && (
          <button
            onClick={onNewApplication}
            aria-label="New application (C)"
            title="New application · C"
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border bg-panel text-fg-muted shadow-xs outline-none transition-colors hover:border-border-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <PlusIcon className="size-4" />
          </button>
        )}
      </div>

      <nav className="scrollbar-none flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 pb-2 pt-1">
        {NAV_GROUPS.map((group, i) => (
          <div key={group.label ?? i} className="flex flex-col gap-px">
            {group.label && (
              <div className="px-2 pb-1 text-2xs font-medium text-fg-subtle">{group.label}</div>
            )}
            {group.items
              .filter((item) => !item.adminOnly || isAdmin)
              .map((item) => (
                <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)}>
                  {item.href === "/inbox" && inboxCount > 0 && (
                    <span className="tnum ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-accent-fg">
                      {inboxCount}
                    </span>
                  )}
                  {item.href === "/pipeline" && pipelineCount > 0 && (
                    <span className="tnum ml-auto text-2xs text-fg-subtle">{pipelineCount}</span>
                  )}
                </NavLink>
              ))}
          </div>
        ))}
      </nav>

      {setup && setup.done < setup.total && (
        <Link
          href="/welcome"
          className="mx-2.5 mb-2 flex flex-col gap-1.5 rounded-lg border border-border bg-panel p-2.5 shadow-xs transition-colors hover:border-border-strong"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <SparklesIcon className="size-3.5 text-accent" />
            Finish setting up
            <span className="tnum ml-auto text-2xs font-normal text-fg-subtle">
              {setup.done}/{setup.total}
            </span>
          </span>
          <span className="h-1 overflow-hidden rounded-full bg-bg-subtle">
            <span
              className="block h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.round((setup.done / setup.total) * 100)}%` }}
            />
          </span>
        </Link>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger className="mx-2.5 mb-2.5 flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-left outline-none transition-colors hover:bg-fg/5 focus-visible:ring-2 focus-visible:ring-accent/50">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-2xs font-semibold text-accent">
            {initials(viewer.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium">{viewer.name}</span>
            <span className="block truncate text-2xs text-fg-subtle">{ROLE_LABEL[viewer.role]}</span>
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 text-fg-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem asChild>
            <Link href={`/members/${viewer.memberId}`}>
              <UserIcon />
              My profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/members/me/insights">
              <SparklesIcon />
              My investor profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/start?step=welcome">
              <GraduationCapIcon />
              My onboarding
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/connect">
              <PlugIcon />
              Connect your AI
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
            }}
          >
            <SunIcon className="dark:hidden" />
            <MoonIcon className="hidden dark:block" />
            <span className="dark:hidden">Dark theme</span>
            <span className="hidden dark:inline">Light theme</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </aside>
  );
}

function NavLink({
  item,
  active,
  children,
}: {
  item: NavItem;
  active: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-[30px] items-center gap-2.5 rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
        active
          ? "bg-panel font-medium text-fg shadow-xs ring-1 ring-border"
          : "text-fg-muted hover:bg-fg/5 hover:text-fg"
      )}
    >
      <item.icon className={cn("size-4 shrink-0", active ? "text-accent" : "text-fg-subtle")} />
      <span className="truncate">{item.label}</span>
      {children}
    </Link>
  );
}
