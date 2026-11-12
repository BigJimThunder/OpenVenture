import type { Metadata, Route } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { getActivityFacets, getActivityLog, type ActivityEntry } from "@/lib/queries/activity-log";
import { EmptyState } from "@/components/patterns/empty-state";
import { NoAccess } from "@/components/patterns/no-access";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { fieldChrome } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Activity log" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  application: "Applications",
  grant: "Grants",
  grant_pool: "Pools",
  memo: "Memos",
  vote_round: "Votes",
  meeting: "Meetings",
  member: "Members",
  organization: "Club settings",
  company: "Companies",
  doc: "Docs",
  report: "Reports",
  action_item: "Action items",
  cap_table: "Cap tables",
  api_token: "Access tokens",
};
const typeLabel = (type: string) =>
  TYPE_LABEL[type] ?? type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Where an entry's subject lives, when it has a page. */
function entityHref(entry: ActivityEntry): Route | null {
  switch (entry.entityType) {
    case "application":
      return `/pipeline/${entry.entityId}` as Route;
    case "memo":
      return `/memos/${entry.entityId}` as Route;
    case "meeting":
      return `/meetings/${entry.entityId}` as Route;
    case "member":
      return `/members/${entry.entityId}` as Route;
    case "grant":
    case "grant_pool":
      return "/grants";
    case "organization":
      return "/settings";
    default:
      return null;
  }
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

/**
 * Everything that has changed in the club, by whom and when. Every mutation
 * writes here from inside the action wrapper; nothing in the app edits or
 * deletes these rows. Admins only.
 */
export default async function ActivityLogPage({ searchParams }: PageProps<"/activity">) {
  const ctx = await requireCtx();
  if (!can(ctx.member.role, "manageClub")) return <NoAccess />;

  const params = await searchParams;
  const type = one(params.type);
  const actor = one(params.actor);
  const q = one(params.q)?.trim().slice(0, 100);
  const beforeRaw = one(params.before);
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;

  const [{ entries, nextBefore }, facets] = await Promise.all([
    getActivityLog(ctx.org.id, { type, actor, q, before }),
    getActivityFacets(ctx.org.id),
  ]);

  const query = (extra: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries({ type, actor, q, ...extra })) if (v) next.set(k, v);
    const s = next.toString();
    return (s ? `/activity?${s}` : "/activity") as Route;
  };
  const filtered = Boolean(type || actor || q);
  const dayOf = (d: Date) => format(d, "EEEE, MMM d, yyyy");

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        eyebrow={
          <Link href="/settings#data" className="hover:text-fg-muted">
            Settings
          </Link>
        }
        title="Activity log"
        description="Every change in the club, who made it and when. Entries are written as the change happens and are never edited. Ballots are never listed here."
      />

      <form method="get" action="/activity" className="flex flex-wrap items-end gap-2 px-4 pb-4 md:px-6">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-fg-muted">
          Search
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="A company, a member, a word"
            className={cn(fieldChrome, "h-9 rounded-md px-2.5 text-sm text-fg max-md:h-10")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          About
          <NativeSelect name="type" defaultValue={type ?? ""} className="h-9 min-w-36 text-sm max-md:h-10">
            <option value="">Everything</option>
            {facets.types.map((t) => (
              <option key={t.type} value={t.type}>
                {typeLabel(t.type)} ({t.n})
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          By
          <NativeSelect name="actor" defaultValue={actor ?? ""} className="h-9 min-w-36 text-sm max-md:h-10">
            <option value="">Anyone</option>
            <option value="system">The app itself</option>
            {facets.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Button type="submit" variant="secondary" size="sm" className="max-md:h-10">
          Filter
        </Button>
        {filtered && (
          <Button variant="ghost" size="sm" asChild className="max-md:h-10">
            <Link href="/activity">Clear</Link>
          </Button>
        )}
      </form>

      <div className="px-4 pb-10 md:px-6">
        {entries.length === 0 ? (
          <EmptyState
            title={filtered ? "Nothing matches" : "Nothing yet"}
            description={
              filtered
                ? "No entries fit these filters. Clear them to see the whole log."
                : "Changes show up here as members use the app."
            }
          />
        ) : (
          <ol className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
            {entries.map((entry, i) => {
              const href = entityHref(entry);
              const newDay = i === 0 || dayOf(entries[i - 1].occurredAt) !== dayOf(entry.occurredAt);
              const changed = entry.diff ? Object.entries(entry.diff) : [];
              return (
                <li key={entry.id}>
                  {newDay && (
                    <div className="border-b border-border bg-bg-subtle px-4 py-1.5 text-xs font-medium text-fg-muted first:border-t-0 [li:not(:first-child)>&]:border-t">
                      {dayOf(entry.occurredAt)}
                    </div>
                  )}
                  <div className="flex gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                    <time dateTime={entry.occurredAt.toISOString()} className="tnum w-14 shrink-0 pt-px text-xs text-fg-muted">
                      {format(entry.occurredAt, "h:mm a")}
                    </time>
                    <div className="min-w-0 flex-1">
                      <p className="break-words">
                        {href ? (
                          <Link href={href} className="underline-offset-2 hover:underline">
                            {entry.summary}
                          </Link>
                        ) : (
                          entry.summary
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-muted">
                        {entry.actorName ?? (entry.actorType === "integration" ? "An integration" : "The app")}
                        {" · "}
                        {typeLabel(entry.entityType)}
                        {" · "}
                        <span className="font-mono text-[11px]">{entry.verb}</span>
                      </p>
                      {changed.length > 0 && (
                        <dl className="mt-1.5 flex flex-col gap-0.5 text-xs text-fg-muted">
                          {changed.slice(0, 6).map(([field, change]) => (
                            <div key={field} className="flex flex-wrap gap-x-1.5">
                              <dt className="font-medium">{field}</dt>
                              <dd className="min-w-0 break-words">
                                {show(change.from)} → {show(change.to)}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {nextBefore && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" asChild className="max-md:h-10">
              <Link href={query({ before: nextBefore.toISOString() })}>Older entries</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function show(value: unknown): string {
  if (value == null || value === "") return "empty";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}
