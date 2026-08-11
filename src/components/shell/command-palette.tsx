"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  InboxIcon,
  CheckSquareIcon,
  KanbanIcon,
  FileTextIcon,
  BanknoteIcon,
  CalendarIcon,
  UsersIcon,
  BarChart3Icon,
  TrendingUpIcon,
  FlaskConicalIcon,
  ScrollTextIcon,
  BookOpenIcon,
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

const PAGES: { href: Route; label: string; icon: React.ComponentType; shortcut?: string }[] = [
  { href: "/", label: "Inbox", icon: InboxIcon, shortcut: "g h" },
  { href: "/my-work", label: "My work", icon: CheckSquareIcon, shortcut: "g w" },
  { href: "/pipeline", label: "Pipeline", icon: KanbanIcon, shortcut: "g a" },
  { href: "/memos", label: "Memos", icon: FileTextIcon, shortcut: "g m" },
  { href: "/grants", label: "Grants", icon: BanknoteIcon, shortcut: "g g" },
  { href: "/meetings", label: "Meetings", icon: CalendarIcon, shortcut: "g e" },
  { href: "/members", label: "Members", icon: UsersIcon },
  { href: "/insights", label: "Insights", icon: BarChart3Icon, shortcut: "g i" },
  { href: "/outcomes", label: "Outcomes", icon: TrendingUpIcon },
  { href: "/lab", label: "Cap Table Lab", icon: FlaskConicalIcon },
  { href: "/reports", label: "LP Reports", icon: ScrollTextIcon },
  { href: "/docs", label: "Docs", icon: BookOpenIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export type PaletteAction = {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ComponentType;
  run: () => void;
};

/**
 * The screen's current selection, offered to ⌘K so the palette can act on it
 * instead of only navigating — the same action vocabulary as the peek panel.
 */
export type PaletteContext = {
  /** e.g. "Quillmate · APP-141" */
  label: string;
  actions: PaletteAction[];
};

/**
 * Held in a ref, not state: a screen re-publishes its context on every render
 * (the actions close over fresh state), and routing that through setState
 * would re-render the shell in a loop. The palette snapshots the ref when it
 * opens, which is the only moment the value is needed.
 */
const PaletteContextRef = React.createContext<React.RefObject<PaletteContext | null> | null>(null);

export function PaletteContextProvider({
  value,
  children,
}: {
  value: React.RefObject<PaletteContext | null>;
  children: React.ReactNode;
}) {
  return <PaletteContextRef.Provider value={value}>{children}</PaletteContextRef.Provider>;
}

/** Publish the current selection to ⌘K. Clears automatically on unmount. */
export function usePaletteContext(ctx: PaletteContext | null) {
  const ref = React.useContext(PaletteContextRef);
  // No dep array: the actions capture fresh state, so refresh after every commit.
  React.useEffect(() => {
    if (ref) ref.current = ctx;
  });
  React.useEffect(() => {
    return () => {
      if (ref) ref.current = null;
    };
  }, [ref]);
}

export function CommandPalette({
  open,
  onOpenChange,
  context,
  onNewApplication,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context?: PaletteContext | null;
  onNewApplication?: () => void;
}) {
  const router = useRouter();

  function go(href: Route) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {context && context.actions.length > 0 && (
          <>
            <CommandGroup heading={context.label}>
              {context.actions.map((a) => (
                <CommandItem
                  key={a.id}
                  onSelect={() => {
                    onOpenChange(false);
                    a.run();
                  }}
                >
                  {a.icon ? <a.icon /> : null}
                  {a.label}
                  {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Create">
          <CommandItem
            onSelect={() => {
              onOpenChange(false);
              onNewApplication?.();
            }}
          >
            <PlusIcon />
            New application
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
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
