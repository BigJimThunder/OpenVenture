"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  LayoutDashboardIcon,
  KanbanIcon,
  FileTextIcon,
  BanknoteIcon,
  CalendarIcon,
  UsersIcon,
  BarChart3Icon,
  FlaskConicalIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

const PAGES = [
  { href: "/", label: "Today", icon: LayoutDashboardIcon, shortcut: "g h" },
  { href: "/applications", label: "Applications", icon: KanbanIcon, shortcut: "g a" },
  { href: "/memos", label: "Memos", icon: FileTextIcon, shortcut: "g m" },
  { href: "/grants", label: "Grants", icon: BanknoteIcon, shortcut: "g g" },
  { href: "/meetings", label: "Meetings", icon: CalendarIcon, shortcut: "g e" },
  { href: "/members", label: "Members", icon: UsersIcon },
  { href: "/insights", label: "Insights", icon: BarChart3Icon, shortcut: "g i" },
  { href: "/lab", label: "Cap Table Lab", icon: FlaskConicalIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search or jump to…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Create">
          <CommandItem onSelect={() => go("/applications/new")}>
            <PlusIcon />
            New application
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {PAGES.map((p) => (
            <CommandItem key={p.href} onSelect={() => go(p.href)}>
              <p.icon />
              {p.label}
              {p.shortcut && <CommandShortcut>{p.shortcut}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
