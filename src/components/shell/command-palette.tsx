"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  KanbanIcon,
  FileTextIcon,
  CalendarIcon,
  UserIcon,
  BookOpenIcon,
  PlusIcon,
  LoaderIcon,
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
import { searchEverything, type SearchHit } from "@/lib/actions/search";
import { NAV_ITEMS } from "./nav";
import { useCan } from "./viewer";

const HIT_ICON: Record<SearchHit["kind"], React.ComponentType> = {
  application: KanbanIcon,
  memo: FileTextIcon,
  member: UserIcon,
  meeting: CalendarIcon,
  doc: BookOpenIcon,
};

const HIT_GROUP: Record<SearchHit["kind"], string> = {
  application: "Applications",
  memo: "Memos",
  member: "Members",
  meeting: "Meetings",
  doc: "Docs",
};

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
  const isAdmin = useCan("manageClub");
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [searching, setSearching] = React.useState(false);

  // Debounced server search. A sequence guard drops stale responses so fast
  // typing can't show results for an older query.
  const seq = React.useRef(0);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function onQueryChange(next: string) {
    setQuery(next);
    if (timer.current) clearTimeout(timer.current);
    const q = next.trim();
    const mine = ++seq.current;
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      const res = await searchEverything(q).catch(() => []);
      if (seq.current === mine) {
        setHits(res);
        setSearching(false);
      }
    }, 140);
  }

  // Always open clean: reset as the palette closes.
  function handleOpenChange(next: boolean) {
    if (!next) onQueryChange("");
    onOpenChange(next);
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href as Route);
  }

  const grouped = (Object.keys(HIT_GROUP) as SearchHit["kind"][])
    .map((kind) => ({ kind, items: hits.filter((h) => h.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        value={query}
        onValueChange={onQueryChange}
        placeholder="Search companies, founders, memos, members…"
      />
      <CommandList>
        <CommandEmpty>
          {searching ? (
            <span className="inline-flex items-center gap-2 text-fg-subtle">
              <LoaderIcon className="size-3.5 animate-spin" /> Searching…
            </span>
          ) : (
            <>Nothing matches “{query.trim()}”.</>
          )}
        </CommandEmpty>

        {grouped.map((g) => {
          const Icon = HIT_ICON[g.kind];
          return (
            <CommandGroup key={g.kind} heading={HIT_GROUP[g.kind]}>
              {g.items.map((h) => (
                <CommandItem
                  key={`${h.kind}-${h.id}`}
                  // cmdk filters on `value`; include the query so server hits
                  // matched on a field we don't display (email, domain) stay.
                  value={`${h.title} ${h.ref ?? ""} ${h.subtitle ?? ""} ${query}`}
                  onSelect={() => go(h.href)}
                >
                  <Icon />
                  <span className="max-w-[55%] shrink-0 truncate font-medium">{h.title}</span>
                  {h.subtitle && (
                    <span className="truncate text-xs text-fg-subtle">{h.subtitle}</span>
                  )}
                  {h.ref && <CommandShortcut>{h.ref}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}

        {context && context.actions.length > 0 && (
          <>
            <CommandGroup heading={context.label}>
              {context.actions.map((a) => (
                <CommandItem
                  key={a.id}
                  onSelect={() => {
                    handleOpenChange(false);
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

        {onNewApplication && (
          <>
            <CommandGroup heading="Create">
              <CommandItem
                onSelect={() => {
                  handleOpenChange(false);
                  onNewApplication();
                }}
              >
                <PlusIcon />
                New application
                <CommandShortcut>C</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        <CommandGroup heading="Go to">
          {NAV_ITEMS.filter((p) => !p.adminOnly || isAdmin).map((p) => (
            <CommandItem key={p.href} onSelect={() => go(p.href)}>
              <p.icon />
              {p.label}
              {p.chord && <CommandShortcut>G {p.chord.toUpperCase()}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
