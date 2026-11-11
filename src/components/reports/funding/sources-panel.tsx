import type { FundingRequestSources } from "@/lib/queries/reports";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * What the club already wrote about this company, kept next to the fields so
 * nobody has to open three tabs to remember what was said in the coffee chat.
 */
export function SourcesPanel({ sources }: { sources: FundingRequestSources }) {
  const groups = [
    {
      title: "Investment memo",
      count: sources.memoSections.length,
      body: sources.memoSections.map((s) => (
        <div key={s.title}>
          <div className="text-xs font-medium text-fg">{s.title}</div>
          <p className="mt-0.5 whitespace-pre-wrap">{s.text.trim()}</p>
        </div>
      )),
    },
    {
      title: "Coffee chats",
      count: sources.coffeeChats.length,
      body: sources.coffeeChats.map((c, i) => (
        <div key={i}>
          {c.date && <div className="tnum text-xs font-medium text-fg">{shortDate(c.date)}</div>}
          {c.debrief && <p className="mt-0.5 whitespace-pre-wrap">{c.debrief}</p>}
          {c.notes.map((n) => (
            <p key={n.memberName + n.note} className="mt-1">
              {n.note} <span className="text-xs text-fg-subtle">— {n.memberName}</span>
            </p>
          ))}
        </div>
      )),
    },
    {
      title: "Notes",
      count: sources.notes.length,
      body: sources.notes.map((n, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {n.body} <span className="text-xs text-fg-subtle">— {n.authorName}</span>
        </p>
      )),
    },
  ].filter((g) => g.count > 0);

  if (groups.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-panel shadow-xs">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold">On file</h2>
        <p className="mt-0.5 text-xs text-fg-muted">What members already wrote. Open one to read it while you write.</p>
      </div>
      <div className="flex flex-col p-2">
        {groups.map((g) => (
          <details key={g.title} className="group rounded-md px-2">
            <summary className="flex cursor-pointer items-center justify-between py-2 text-sm font-medium max-md:py-3">
              {g.title}
              <span className="tnum text-xs font-normal text-fg-subtle">{g.count}</span>
            </summary>
            <div className="flex flex-col gap-3 pb-3 text-sm text-fg-muted">{g.body}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
