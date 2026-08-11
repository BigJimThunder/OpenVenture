"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  InboxIcon,
  CheckSquareIcon,
  KanbanIcon,
  FileTextIcon,
  BanknoteIcon,
  CalendarIcon,
  UsersIcon,
  BarChart3Icon,
  FlaskConicalIcon,
  TrendingUpIcon,
  ScrollTextIcon,
  BookOpenIcon,
  GraduationCapIcon,
  SettingsIcon,
  ChevronDownIcon,
  PlusIcon,
  SunIcon,
  MoonIcon,
  LogOutIcon,
} from "lucide-react";
import type { Route } from "next";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/patterns/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PERSONAL: NavItem[] = [
  { href: "/", label: "Inbox", icon: InboxIcon },
  { href: "/my-work", label: "My work", icon: CheckSquareIcon },
];

const OPERATE: NavItem[] = [
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon },
  { href: "/memos", label: "Memos", icon: FileTextIcon },
  { href: "/grants", label: "Grants", icon: BanknoteIcon },
  { href: "/meetings", label: "Meetings", icon: CalendarIcon },
  { href: "/members", label: "Members", icon: UsersIcon },
];

const LEARN: NavItem[] = [
  { href: "/insights", label: "Insights", icon: BarChart3Icon },
  { href: "/outcomes", label: "Outcomes", icon: TrendingUpIcon },
  { href: "/lab", label: "Cap Table Lab", icon: FlaskConicalIcon },
  { href: "/reports", label: "LP Reports", icon: ScrollTextIcon },
];

export function Sidebar({
  orgName,
  memberName,
  role,
  inboxCount,
  pipelineCount,
  onNewApplication,
}: {
  orgName: string;
  memberName: string;
  role: string;
  inboxCount: number;
  pipelineCount: number;
  onNewApplication?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  async function signOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden w-55 shrink-0 flex-col border-r border-border bg-bg md:flex">
      <DropdownMenu>
        <DropdownMenuTrigger className="m-2 flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-semibold outline-none transition-colors hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/50">
          <span className="flex size-5 items-center justify-center rounded-[5px] bg-accent text-[10px] font-bold text-accent-fg">
            OV
          </span>
          <span className="truncate">{orgName}</span>
          <ChevronDownIcon className="ml-auto size-3 text-fg-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <div className="text-sm font-medium text-fg">{memberName}</div>
            <div className="text-2xs capitalize text-fg-subtle">{role.replace("_", " ")}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <SettingsIcon />
              Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/docs">
              <BookOpenIcon />
              Docs
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/onboarding">
              <GraduationCapIcon />
              Onboarding
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut}>
            <LogOutIcon />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        onClick={onNewApplication}
        className="mx-2 mb-2 flex h-7 cursor-pointer items-center gap-2 rounded-md border border-border bg-panel px-2 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        <PlusIcon className="size-3.5" />
        <span>New application</span>
        <Kbd className="ml-auto">C</Kbd>
      </button>

      <nav className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-2 pb-2">
        <NavGroup>
          {PERSONAL.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)}>
              {item.href === "/" && inboxCount > 0 && (
                <span className="tnum ml-auto flex h-4 min-w-[18px] items-center justify-center rounded-full bg-accent-subtle px-1.5 text-[10.5px] font-semibold text-accent">
                  {inboxCount}
                </span>
              )}
            </NavLink>
          ))}
        </NavGroup>

        <NavGroup label="Operate">
          {OPERATE.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)}>
              {item.href === "/pipeline" && (
                <span className="tnum ml-auto text-2xs text-fg-subtle">{pipelineCount}</span>
              )}
            </NavLink>
          ))}
        </NavGroup>

        <NavGroup label="Learn">
          {LEARN.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </NavGroup>
      </nav>

      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <span className="truncate text-2xs text-fg-subtle">{memberName}</span>
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
          className="flex size-6 cursor-pointer items-center justify-center rounded-[5px] text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
        >
          <SunIcon className="size-3.5 dark:hidden" />
          <MoonIcon className="hidden size-3.5 dark:block" />
        </button>
      </div>
    </aside>
  );
}

function NavGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-px">
      {label && (
        <div className="px-2 pb-[3px] text-[10.5px] font-medium tracking-[0.06em] uppercase text-fg-subtle">
          {label}
        </div>
      )}
      {children}
    </div>
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
      className={cn(
        "flex h-[27px] items-center gap-2.5 rounded-md px-2 text-[12.5px] transition-colors",
        active
          ? "bg-bg-subtle font-medium text-fg"
          : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
      )}
    >
      <item.icon className="size-[15px] shrink-0" />
      <span className="truncate">{item.label}</span>
      {children}
    </Link>
  );
}
