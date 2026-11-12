"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  BarChart3,
  CalendarDays,
  CircleCheck,
  FileText,
  FlaskConical,
  Inbox,
  Kanban,
  Landmark,
  ScrollText,
  Search,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, BarTitle, Dot, Window, styles, usd } from "./kit";

/**
 * The hero: the pipeline board, rebuilt small and alive. It plays a few moves
 * on its own until the visitor touches it; from then on it is theirs — drag a
 * card between stages with a mouse, or tap / press Enter to advance one.
 * Every company is fictional and matches the demo seed.
 */

const STAGES = [
  { name: "Applied", cat: 10, note: "back to Applied" },
  { name: "Screening", cat: 2, note: "owner notified" },
  { name: "Coffee Chat", cat: 3, note: "two members assigned" },
  { name: "Pitched Group", cat: 4, note: "memo due before the vote" },
  { name: "Decision", cat: 5, note: "a blind vote can open" },
] as const;

type Card = {
  id: string;
  name: string;
  blurb: string;
  amount: number;
  age: string;
  late?: boolean;
  owner: string;
  priority: 1 | 2 | 3;
  stage: number;
};

const INITIAL: Card[] = [
  { id: "APP-4", name: "StudySwap", blurb: "Peer tutoring exchange with token credits", amount: 800, age: "5 hours", owner: "JB", priority: 1, stage: 0 },
  { id: "APP-9", name: "PageForge", blurb: "Markdown-native zine publishing", amount: 950, age: "1 day", owner: "PR", priority: 1, stage: 0 },
  { id: "APP-15", name: "BikeChain", blurb: "P2P bike rental with smart locks", amount: 1500, age: "3 days", owner: "PR", priority: 2, stage: 0 },
  { id: "APP-11", name: "EchoCast", blurb: "Podcast clip search for lecture archives", amount: 1400, age: "2 days", owner: "JW", priority: 2, stage: 1 },
  { id: "APP-7", name: "Quokka Health", blurb: "Symptom triage for campus clinics", amount: 2500, age: "5 days", owner: "PR", priority: 2, stage: 1 },
  { id: "APP-22", name: "VoltVan", blurb: "EV charging co-op for commuter students", amount: 3800, age: "6 days", owner: "LM", priority: 2, stage: 1 },
  { id: "APP-19", name: "RecipeRx", blurb: "Meal plans from dining-hall ingredients", amount: 400, age: "4 days", owner: "MK", priority: 3, stage: 2 },
  { id: "APP-12", name: "TapTix", blurb: "NFC event ticketing for student orgs", amount: 2000, age: "12 days", owner: "EK", priority: 3, stage: 2 },
  { id: "APP-3", name: "Solara Labs", blurb: "DIY solar balcony kits for renters", amount: 4000, age: "19 days", late: true, owner: "PR", priority: 2, stage: 2 },
  { id: "APP-5", name: "Ferrite Robotics", blurb: "Magnetic grippers for warehouse cobots", amount: 4000, age: "3 days", owner: "TR", priority: 3, stage: 3 },
  { id: "APP-17", name: "FormFree", blurb: "Accessibility-first form builder", amount: 1100, age: "6 days", owner: "SG", priority: 3, stage: 3 },
  { id: "APP-1", name: "Lecture Loop", blurb: "AI note-taking synced to the course catalog", amount: 2400, age: "2 days", owner: "SG", priority: 3, stage: 4 },
];

/** What the board does while nobody is touching it: [card, stage it moves to]. */
const SCRIPT: [string, number][] = [
  ["APP-5", 4],
  ["APP-12", 3],
  ["APP-11", 2],
  ["APP-9", 1],
  ["APP-19", 3],
];

const NAV = [
  { group: null, items: [{ icon: Inbox, label: "Inbox", count: "5" }, { icon: CircleCheck, label: "My work" }] },
  {
    group: "Operate",
    items: [
      { icon: Kanban, label: "Pipeline", count: "12", active: true },
      { icon: FileText, label: "Memos" },
      { icon: Landmark, label: "Grants" },
      { icon: CalendarDays, label: "Meetings" },
      { icon: Users, label: "Members" },
    ],
  },
  {
    group: "Learn",
    items: [
      { icon: BarChart3, label: "Insights" },
      { icon: FlaskConical, label: "Cap Table Lab" },
      { icon: ScrollText, label: "Reports" },
    ],
  },
];

function move(cards: Card[], id: string, stage: number): Card[] {
  const card = cards.find((c) => c.id === id);
  if (!card || card.stage === stage) return cards;
  // A moved card lands on top of its new column with the clock restarted.
  return [{ ...card, stage, age: "just now", late: false }, ...cards.filter((c) => c.id !== id)];
}

export function HeroBoard() {
  const [cards, setCards] = React.useState(INITIAL);
  const [status, setStatus] = React.useState("Live preview. Every company is fictional.");
  const [activeId, setActiveId] = React.useState<string | null>(null);
  // True only in the browser: the drag overlay is portaled to <body>.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const taken = React.useRef(false); // the visitor has taken over
  const root = React.useRef<HTMLDivElement>(null);
  const nodes = React.useRef(new Map<string, HTMLElement>());
  const rects = React.useRef(new Map<string, { x: number; y: number }>());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));


  // FLIP: after every render, each card that changed place glides from where
  // it was. Positions are kept relative to the board so scrolling is not a move.
  React.useLayoutEffect(() => {
    const origin = root.current?.getBoundingClientRect();
    if (!origin) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.current.forEach((el, id) => {
      const r = el.getBoundingClientRect();
      const next = { x: r.left - origin.left, y: r.top - origin.top };
      const prev = rects.current.get(id);
      rects.current.set(id, next);
      if (!prev || still) return;
      const dx = prev.x - next.x;
      const dy = prev.y - next.y;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, zIndex: 5 },
          { transform: "none", zIndex: 5 },
        ],
        { duration: 560, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }
      );
    });
  }, [cards]);

  // Autoplay, only while the board is on screen and untouched.
  React.useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let step = 0;
    let visible = false;
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    const timer = window.setInterval(() => {
      if (taken.current || !visible || document.hidden) return;
      if (step === SCRIPT.length) {
        step = 0;
        setCards(INITIAL);
        setStatus("Live preview. Every company is fictional.");
        return;
      }
      const [id, stage] = SCRIPT[step++];
      const card = INITIAL.find((c) => c.id === id)!;
      setCards((cs) => move(cs, id, stage));
      setStatus(`${card.name} moved to ${STAGES[stage].name} · ${STAGES[stage].note}`);
    }, 2600);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  function place(id: string, stage: number) {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (card.stage === stage) return;
    setCards((cs) => move(cs, id, stage));
    setStatus(`You moved ${card.name} to ${STAGES[stage].name} · ${STAGES[stage].note}`);
  }

  function advance(id: string) {
    taken.current = true;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (card.stage === STAGES.length - 1) {
      setStatus(`${card.name} is at Decision · a blind vote can open`);
      return;
    }
    place(id, card.stage + 1);
  }

  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    setActiveId(null);
    if (event.over == null) return;
    // Let the card glide from where it was dropped, not from its old slot.
    const origin = root.current?.getBoundingClientRect();
    const dropped = event.active.rect.current.translated;
    if (origin && dropped) rects.current.set(id, { x: dropped.left - origin.left, y: dropped.top - origin.top });
    place(id, Number(event.over.id));
  }

  const active = activeId ? cards.find((c) => c.id === activeId) : null;
  const name = (id: string | number) => cards.find((c) => c.id === id)?.name ?? "The card";

  return (
    <Window className="text-left">
      <div
        ref={root}
        className="flex"
        onPointerDownCapture={() => (taken.current = true)}
        onKeyDownCapture={() => (taken.current = true)}
      >
        {/* The app's sidebar. Decoration here: nothing in it is a control. */}
        <div aria-hidden className="hidden w-52 shrink-0 flex-col gap-4 border-r border-border bg-chrome p-3 lg:flex">
          <div className="flex items-center gap-2 px-1 pt-0.5">
            <span className="inline-flex size-6 items-center justify-center rounded-md bg-fg text-[0.5625rem] font-bold text-bg">
              CV
            </span>
            <span className="text-sm font-semibold">Cardinal Ventures</span>
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md border border-border-strong bg-panel px-2.5 text-xs text-fg-subtle">
            <Search className="size-3.5" />
            Search
            <span className="ml-auto font-mono text-[0.625rem]">⌘K</span>
          </div>
          {NAV.map((section) => (
            <div key={section.group ?? "you"} className="flex flex-col gap-0.5">
              {section.group && <p className="px-2 pb-1 text-2xs text-fg-subtle">{section.group}</p>}
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    "flex h-7 items-center gap-2 rounded-md px-2 text-xs",
                    "active" in item && item.active ? "bg-bg-subtle font-medium text-fg" : "text-fg-muted"
                  )}
                >
                  <item.icon className={cn("size-3.5", "active" in item && item.active && "text-accent")} />
                  {item.label}
                  {"count" in item && item.count && <span className="tnum ml-auto text-2xs text-fg-subtle">{item.count}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4 text-sm">
            <BarTitle meta="12 open · $24,850 requested">Pipeline</BarTitle>
            <div aria-hidden className="ml-auto flex rounded-md border border-border-strong p-0.5 text-xs">
              <span className="rounded-[5px] bg-bg-subtle px-2.5 py-0.5 font-medium">Board</span>
              <span className="px-2.5 py-0.5 text-fg-subtle">List</span>
            </div>
          </div>

          <DndContext
            id="landing-board"
            sensors={sensors}
            accessibility={{
              announcements: {
                onDragStart: ({ active }) => `Picked up ${name(active.id)}.`,
                onDragOver: ({ active, over }) =>
                  over ? `${name(active.id)} is over ${STAGES[Number(over.id)].name}.` : undefined,
                onDragEnd: ({ active, over }) =>
                  over ? `${name(active.id)} was moved to ${STAGES[Number(over.id)].name}.` : `${name(active.id)} was put back.`,
                onDragCancel: ({ active }) => `${name(active.id)} was put back.`,
              },
            }}
            onDragStart={(e) => setActiveId(String(e.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={onDragEnd}
          >
            <div className="scrollbar-none flex h-[29rem] snap-x gap-2 overflow-x-auto overflow-y-hidden p-3">
              {STAGES.map((stage, i) => (
                <Column key={stage.name} index={i} cards={cards.filter((c) => c.stage === i)}>
                  {(card) => (
                    <BoardCard
                      key={card.id}
                      card={card}
                      dimmed={activeId === card.id}
                      onAdvance={() => advance(card.id)}
                      register={(el) => {
                        if (el) nodes.current.set(card.id, el);
                        else nodes.current.delete(card.id);
                      }}
                    />
                  )}
                </Column>
              ))}
            </div>
            {mounted &&
              createPortal(
                <DragOverlay dropAnimation={null}>
                  {active ? <CardFace card={active} className="rotate-2 cursor-grabbing border-accent/60 shadow-lg" /> : null}
                </DragOverlay>,
                document.body
              )}
          </DndContext>

          <div className="flex min-h-10 shrink-0 items-center gap-3 border-t border-border px-4 text-xs text-fg-muted">
            <span aria-hidden className={cn(styles.pulse, "size-1.5 shrink-0 rounded-full bg-success")} />
            <p role="status" aria-live="polite" className="truncate">
              {status}
            </p>
            <p className="ml-auto hidden shrink-0 text-fg-subtle sm:block">
              <span className="pointer-coarse:hidden">Drag a card between stages</span>
              <span className="hidden pointer-coarse:inline">Tap a card to advance it</span>
            </p>
          </div>
        </div>
      </div>
    </Window>
  );
}

function Column({
  index,
  cards,
  children,
}: {
  index: number;
  cards: Card[];
  children: (card: Card) => React.ReactNode;
}) {
  const stage = STAGES[index];
  const { setNodeRef, isOver } = useDroppable({ id: index });
  const total = cards.reduce((n, c) => n + c.amount, 0);
  return (
    <div className="flex w-[11.25rem] shrink-0 snap-start flex-col lg:w-auto lg:min-w-0 lg:flex-1">
      <div className="flex items-center gap-1.5 px-1 pb-2">
        <Dot n={stage.cat} />
        <span className="truncate text-xs font-medium">{stage.name}</span>
        <span className="tnum text-2xs text-fg-subtle">{cards.length}</span>
        <span className="tnum ml-auto text-2xs text-fg-subtle">{total > 0 ? usd(total) : ""}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-transparent bg-bg-subtle p-2 transition-colors",
          isOver && "border-accent/50 bg-accent-subtle/50"
        )}
      >
        {cards.map(children)}
      </div>
    </div>
  );
}

function BoardCard({
  card,
  dimmed,
  onAdvance,
  register,
}: {
  card: Card;
  dimmed: boolean;
  onAdvance: () => void;
  register: (el: HTMLElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: card.id });
  const next = STAGES[card.stage + 1];
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        register(el);
      }}
      {...listeners}
      {...attributes}
      aria-roledescription="application card"
      aria-label={`${card.id} ${card.name}, in ${STAGES[card.stage].name}.${next ? ` Press Enter to move it to ${next.name}.` : ""}`}
      onClick={onAdvance}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAdvance();
        }
      }}
      className={cn(
        "relative cursor-grab rounded-md outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-accent/60 pointer-coarse:cursor-pointer",
        dimmed && "opacity-35"
      )}
    >
      <CardFace card={card} className="hover:border-border-strong" />
    </div>
  );
}

function CardFace({ card, className }: { card: Card; className?: string }) {
  return (
    <div className={cn("rounded-md border border-border bg-panel p-2.5 shadow-xs transition-colors", className)}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[0.625rem] text-fg-subtle">{card.id}</span>
        <span aria-hidden className="flex items-end gap-px">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={cn("w-[3px] rounded-[1px]", n <= card.priority ? "bg-fg-muted" : "bg-border-strong")}
              style={{ height: 3 + n * 2 }}
            />
          ))}
        </span>
        <Avatar initials={card.owner} className="ml-auto" />
      </div>
      <p className="mt-1 truncate text-sm font-semibold leading-tight">{card.name}</p>
      <p className="mt-0.5 line-clamp-2 min-h-[2.1rem] text-xs leading-[1.05rem] text-fg-muted">{card.blurb}</p>
      <div className="tnum mt-2 flex items-baseline justify-between text-2xs">
        <span className="text-fg-muted">{usd(card.amount)}</span>
        <span className={card.late ? "font-medium text-warning" : "text-fg-subtle"}>{card.age}</span>
      </div>
    </div>
  );
}
