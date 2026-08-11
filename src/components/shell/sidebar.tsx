"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboardIcon,
  KanbanIcon,
  FileTextIcon,
  BanknoteIcon,
  CalendarIcon,
  UsersIcon,
  GraduationCapIcon,
  BarChart3Icon,
  FlaskConicalIcon,
  TrendingUpIcon,
  BookOpenIcon,
  SettingsIcon,
  ScrollTextIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  {
    label: null,
    items: [{ href: "/", label: "Today", icon: LayoutDashboardIcon }],
  },
  {
    label: "Operate",
    items: [
      { href: "/applications", label: "Applications", icon: KanbanIcon },
      { href: "/memos", label: "Memos", icon: FileTextIcon },
      { href: "/grants", label: "Grants", icon: BanknoteIcon },
      { href: "/meetings", label: "Meetings", icon: CalendarIcon },
      { href: "/members", label: "Members", icon: UsersIcon },
      { href: "/onboarding", label: "Onboarding", icon: GraduationCapIcon },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/insights", label: "Insights", icon: BarChart3Icon },
      { href: "/outcomes", label: "Outcomes", icon: TrendingUpIcon },
      { href: "/lab", label: "Cap Table Lab", icon: FlaskConicalIcon },
      { href: "/reports", label: "LP Reports", icon: ScrollTextIcon },
      { href: "/docs", label: "Docs", icon: BookOpenIcon },
    ],
  },
] as const;

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg md:flex">
      <div className="flex h-13 items-center gap-2 px-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-accent text-accent-fg text-2xs font-bold">
          OV
        </div>
        <span className="truncate text-sm font-semibold">{orgName}</span>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
        {NAV.map((group, gi) => (
          <div key={gi} className="flex flex-col gap-0.5">
            {group.label && (
              <div className="px-2 pb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex h-7 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                    active
                      ? "bg-accent-subtle font-medium text-accent"
                      : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-border p-2">
        <Link
          href="/settings"
          className={cn(
            "flex h-7 items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-accent-subtle font-medium text-accent"
              : "text-fg-muted hover:bg-bg-subtle hover:text-fg"
          )}
        >
          <SettingsIcon className="size-4" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
