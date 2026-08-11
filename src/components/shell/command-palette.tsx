"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
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
  ScrollTextIcon,
  SettingsIcon,
  PlusIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  SunMoonIcon,
  CheckIcon,
  UserIcon,
  ClockIcon,
  PiggyBankIcon,
  type LucideIcon,
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
import { paletteSearch, type PaletteResults } from "@/lib/actions/search";

/* ————————————————————————————————————————————————————————————————
   Linear-grade ⌘K: one input that ranks commands and searches records,
   nested pages (theme), g-chord hints, and localStorage recents.
   ———————————————————————————————————————————————————————————————— */

type NavPage = {
  href: string;
  label: string;
  icon: LucideIcon;
  shortcut?: string;
  keywords?: string;
};

export const NAV_PAGES: NavPage[] = [
  { href: "/", label: "Today", icon: LayoutDashboardIcon, shortcut: "G H", keywords: "home dashboard" },
  { href: "/applications", label: "Applications", icon: KanbanIcon, shortcut: "G A", keywords: "pipeline board kanban deals" },
  { href: "/memos", label: "Memos", icon: FileTextIcon, shortcut: "G M", keywords: "investment memo vote" },
  { href: "/grants", label: "Grants", icon: BanknoteIcon, shortcut: "G G", keywords: "checks money tracker" },
  { href: "/grants/budget", label: "Budget", icon: PiggyBankIcon, keywords: "pool burn down remaining treasurer" },
  { href: "/meetings", label: "Meetings", icon: CalendarIcon, shortcut: "G E", keywords: "agenda attendance" },
  { href: "/members", label: "Members", icon: UsersIcon, shortcut: "G U", keywords: "roster people" },
  { href: "/onboarding", label: "Onboarding", icon: GraduationCapIcon, keywords: "tasks checklist new members" },
  { href: "/insights", label: "Insights", icon: BarChart3Icon, shortcut: "G I", keywords: "analytics funnel charts" },
  { href: "/members/me/insights", label: "My investor profile", icon: UserIcon, keywords: "self analysis calibration conviction" },
  { href: "/outcomes", label: "Outcomes", icon: TrendingUpIcon, shortcut: "G O", keywords: "portfolio tiers" },
  { href: "/lab", label: "Cap Table Lab", icon: FlaskConicalIcon, shortcut: "G L", keywords: "dilution safe cap table sandbox" },
  { href: "/reports", label: "LP Reports", icon: ScrollTextIcon, shortcut: "G R", keywords: "quarterly letter" },
  { href: "/docs", label: "Docs", icon: BookOpenIcon, shortcut: "G D", keywords: "wiki thesis process" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, shortcut: "G S", keywords: "admin config export" },
];

const CREATE_COMMANDS = [
  {
    href: "/applications?new=1",
    label: "New application",
    icon: PlusIcon,
    shortcut: "C",
    keywords: "create add company deal",
  },
  {
    href: "/meetings?new=1",
    label: "New meeting",
    icon: PlusIcon,
    keywords: "create schedule agenda",
  },
];

/**
 * Subsequence fuzzy match. Rewards streaks and word starts; null = no match.
 * Small on purpose — ranking a dozen commands doesn't need a library.
 */
function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let streak = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      streak += 1;
      score += streak + (ti === 0 || t[ti - 1] === " " ? 4 : 0);
      qi++;
    } else {
      streak = 0;
    }
  }
  return qi === q.length ? score : null;
}

type RecentEntry = { label: string; sublabel?: string | null; href: string };
const RECENT_KEY = "ov.palette.recent";

function readRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed.slice(0, 8) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  try {
    const next = [entry, ...readRecents().filter((r) => r.href !== entry.href)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode) — recents just don't persist.
  }
}

const RESULT_GROUPS: { key: keyof PaletteResults; heading: string; icon: LucideIcon }[] = [
  { key: "applications", heading: "Applications", icon: KanbanIcon },
  { key: "memos", heading: "Memos", icon: FileTextIcon },
  { key: "members", heading: "Members", icon: UsersIcon },
  { key: "meetings", heading: "Meetings", icon: CalendarIcon },
  { key: "docs", heading: "Docs", icon: BookOpenIcon },
];

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [page, setPage] = React.useState<"root" | "theme">("root");
  const [query, setQuery] = React.useState("");
  // Results are keyed by the query that produced them, so a stale set simply
  // stops matching instead of needing a reset from an effect.
  const [results, setResults] = React.useState<{ q: string; data: PaletteResults } | null>(null);
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);
  const searchSeq = React.useRef(0);

  // Reset to a clean root page on open/close (adjust-during-render pattern).
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setRecents(readRecents());
    } else {
      setPage("root");
      setQuery("");
      setResults(null);
    }
  }

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

  // Debounced record search alongside command ranking. All setState happens
  // inside the timeout callback, never in the effect body.
  React.useEffect(() => {
    if (page !== "root") return;
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const t = setTimeout(async () => {
      const res = await paletteSearch({ q });
      if (seq !== searchSeq.current) return; // a newer query superseded this one
      if (res.ok) setResults({ q, data: res.data });
    }, 180);
    return () => clearTimeout(t);
  }, [query, page]);

  function go(href: string, recent?: RecentEntry) {
    if (recent) {
      pushRecent(recent);
    }
    onOpenChange(false);
    router.push(href);
  }

  function backToRoot() {
    setPage("root");
    setQuery("");
  }

  function onCommandKeyDown(e: React.KeyboardEvent) {
    if (page === "root") return;
    if (e.key === "Escape" || (e.key === "Backspace" && query === "")) {
      // Swallow before Radix's document listener closes the dialog.
      e.preventDefault();
      e.stopPropagation();
      backToRoot();
    }
  }

  const trimmed = query.trim();

  const rankedCommands = React.useMemo(() => {
    if (page !== "root") return [];
    const all = [
      ...CREATE_COMMANDS.map((c) => ({ ...c, kind: "create" as const })),
      ...NAV_PAGES.map((p) => ({ ...p, kind: "nav" as const })),
      {
        href: "#theme",
        label: "Change theme…",
        icon: SunMoonIcon,
        shortcut: undefined,
        keywords: "dark light mode appearance",
        kind: "prefs" as const,
      },
    ];
    if (!trimmed) return all;
    return all
      .map((c) => ({ c, score: fuzzyScore(trimmed, `${c.label} ${c.keywords ?? ""}`) }))
      .filter((x): x is { c: (typeof all)[number]; score: number } => x.score != null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [page, trimmed]);

  function runCommand(cmd: (typeof rankedCommands)[number]) {
    if (cmd.href === "#theme") {
      setPage("theme");
      setQuery("");
      return;
    }
    go(cmd.href, cmd.kind === "nav" ? { label: cmd.label, href: cmd.href } : undefined);
  }

  const activeResults =
    trimmed.length >= 2 && results?.q === trimmed ? results.data : null;
  const searching = trimmed.length >= 2 && activeResults == null;
  const hasRecordHits =
    activeResults != null && RESULT_GROUPS.some(({ key }) => activeResults[key].length > 0);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} shouldFilter={false}>
      <div onKeyDown={onCommandKeyDown} className="contents">
        {page === "theme" && (
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-2xs text-fg-subtle">
            <button
              onClick={backToRoot}
              className="cursor-pointer rounded border border-border bg-bg-subtle px-1.5 py-0.5 transition-colors hover:text-fg"
            >
              ← Back
            </button>
            <span>Theme</span>
          </div>
        )}
        <CommandInput
          placeholder={page === "theme" ? "Choose a theme…" : "Type a command or search…"}
          value={query}
          onValueChange={setQuery}
        />
        {/* Ranking is ours (fuzzy + server results), so cmdk must not re-filter. */}
        <CommandList data-palette-page={page}>
          {page === "theme" ? (
            <CommandGroup heading="Theme">
              {(
                [
                  ["light", "Light", SunIcon],
                  ["dark", "Dark", MoonIcon],
                  ["system", "System", MonitorIcon],
                ] as const
              ).map(([value, label, Icon]) => (
                <CommandItem
                  key={value}
                  value={label}
                  onSelect={() => {
                    setTheme(value);
                    onOpenChange(false);
                  }}
                >
                  <Icon />
                  {label}
                  {theme === value && <CheckIcon className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : trimmed ? (
            <>
              <CommandEmpty>
                {searching ? "Searching…" : "No matching commands or records."}
              </CommandEmpty>
              {rankedCommands.length > 0 && (
                <CommandGroup heading="Commands">
                  {rankedCommands.map((cmd) => (
                    <CommandItem
                      key={cmd.href}
                      value={`cmd:${cmd.href}`}
                      onSelect={() => runCommand(cmd)}
                    >
                      <cmd.icon />
                      {cmd.label}
                      {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {hasRecordHits &&
                RESULT_GROUPS.map(({ key, heading, icon: Icon }) => {
                  const hits = activeResults?.[key] ?? [];
                  if (hits.length === 0) return null;
                  return (
                    <CommandGroup key={key} heading={heading}>
                      {hits.map((hit) => (
                        <CommandItem
                          key={hit.id}
                          value={`${key}:${hit.id}`}
                          onSelect={() =>
                            go(hit.href, {
                              label: hit.label,
                              sublabel: heading,
                              href: hit.href,
                            })
                          }
                        >
                          {hit.colorToken ? (
                            <span
                              className="mx-1 size-2 shrink-0 rounded-full"
                              style={{ background: `var(--${hit.colorToken})` }}
                              aria-hidden
                            />
                          ) : (
                            <Icon />
                          )}
                          <span className="truncate">{hit.label}</span>
                          {hit.sublabel && (
                            <span className="ml-auto max-w-40 shrink-0 truncate pl-3 text-2xs capitalize text-fg-subtle">
                              {hit.sublabel}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  );
                })}
            </>
          ) : (
            <>
              {recents.length > 0 && (
                <>
                  <CommandGroup heading="Recent">
                    {recents.map((r) => (
                      <CommandItem
                        key={r.href}
                        value={`recent:${r.href}`}
                        onSelect={() => go(r.href, r)}
                      >
                        <ClockIcon />
                        <span className="truncate">{r.label}</span>
                        {r.sublabel && (
                          <span className="ml-auto shrink-0 pl-3 text-2xs text-fg-subtle">
                            {r.sublabel}
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}
              <CommandGroup heading="Create">
                {CREATE_COMMANDS.map((cmd) => (
                  <CommandItem key={cmd.href} value={cmd.href} onSelect={() => go(cmd.href)}>
                    <cmd.icon />
                    {cmd.label}
                    {cmd.shortcut && <CommandShortcut>{cmd.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Go to">
                {NAV_PAGES.map((p) => (
                  <CommandItem
                    key={p.href}
                    value={p.href}
                    onSelect={() => go(p.href, { label: p.label, href: p.href })}
                  >
                    <p.icon />
                    {p.label}
                    {p.shortcut && <CommandShortcut>{p.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Preferences">
                <CommandItem
                  value="#theme"
                  onSelect={() => {
                    setPage("theme");
                    setQuery("");
                  }}
                >
                  <SunMoonIcon />
                  Change theme…
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
        <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-2xs text-fg-subtle">
          <span>{page === "theme" ? "Backspace to go back" : "Search records, run commands"}</span>
          <span className="flex items-center gap-2">
            <Hint keys="↑↓" label="navigate" />
            <Hint keys="↵" label="open" />
            <Hint keys="esc" label="close" />
          </span>
        </div>
      </div>
    </CommandDialog>
  );
}

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-border bg-bg-subtle px-1 font-sans">{keys}</kbd>
      {label}
    </span>
  );
}
