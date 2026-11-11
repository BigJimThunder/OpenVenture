import type { Route } from "next";
import {
  InboxIcon,
  CircleCheckIcon,
  KanbanIcon,
  FileTextIcon,
  BanknoteIcon,
  CalendarIcon,
  UsersIcon,
  ChartColumnIcon,
  FlaskConicalIcon,
  TrendingUpIcon,
  ScrollTextIcon,
  BookOpenIcon,
  GraduationCapIcon,
  SettingsIcon,
} from "lucide-react";

export type NavItem = {
  href: Route;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Second key of the `g` chord — `g` then `p` opens Pipeline. */
  chord?: string;
  adminOnly?: boolean;
};

/** One source of truth for the sidebar, the phone menu, ⌘K and the g-chords. */
export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/inbox", label: "Inbox", icon: InboxIcon, chord: "i" },
      { href: "/my-work", label: "My work", icon: CircleCheckIcon, chord: "w" },
    ],
  },
  {
    label: "Operate",
    items: [
      { href: "/pipeline", label: "Pipeline", icon: KanbanIcon, chord: "p" },
      { href: "/memos", label: "Memos", icon: FileTextIcon, chord: "m" },
      { href: "/grants", label: "Grants", icon: BanknoteIcon, chord: "g" },
      { href: "/meetings", label: "Meetings", icon: CalendarIcon, chord: "e" },
      { href: "/members", label: "Members", icon: UsersIcon, chord: "u" },
    ],
  },
  {
    label: "Learn",
    items: [
      { href: "/insights", label: "Insights", icon: ChartColumnIcon, chord: "n" },
      { href: "/outcomes", label: "Outcomes", icon: TrendingUpIcon, chord: "o" },
      { href: "/lab", label: "Cap Table Lab", icon: FlaskConicalIcon, chord: "l" },
      { href: "/reports", label: "LP Reports", icon: ScrollTextIcon, chord: "r" },
    ],
  },
  {
    label: "Club",
    items: [
      { href: "/docs", label: "Docs", icon: BookOpenIcon, chord: "d" },
      { href: "/onboarding", label: "Onboarding", icon: GraduationCapIcon },
      { href: "/settings", label: "Settings", icon: SettingsIcon, chord: "s", adminOnly: true },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
