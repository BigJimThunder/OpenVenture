"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { CheckIcon, ExternalLinkIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { updateApplicationFacts, updateCompanyProfile } from "@/lib/actions/applications";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { StageDot } from "@/components/patterns/entity-ref";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InlineField } from "./inline-field";

type Lookup = { id: string; name: string };
type SectorLookup = Lookup & { colorToken: string };

type FactPatch = Omit<Parameters<typeof updateApplicationFacts>[0], "applicationId">;
type CompanyPatch = Omit<Parameters<typeof updateCompanyProfile>[0], "applicationId">;

/**
 * The record's facts, grouped and editable in place. Every value is its own
 * click-to-edit control — there is no "edit mode" to enter and forget to save.
 */
export function ApplicationFacts({
  applicationId,
  facts,
  company,
  sectors,
  allSectors,
  sources,
  appliedAt,
}: {
  applicationId: string;
  facts: {
    applicantName: string | null;
    applicantEmail: string | null;
    department: string | null;
    classYear: number | null;
    teamSize: number | null;
    campusSource: string | null;
    sourceId: string | null;
    sourceDetail: string | null;
  };
  company: { domain: string | null; websiteUrl: string | null };
  sectors: SectorLookup[];
  allSectors: SectorLookup[];
  sources: Lookup[];
  appliedAt: Date;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");

  const saveFact = React.useCallback(
    async (patch: FactPatch) => {
      const res = await updateApplicationFacts({ applicationId, ...patch });
      if (res.ok) router.refresh();
      return res.ok ? ({ ok: true } as const) : ({ ok: false, error: res.error } as const);
    },
    [applicationId, router]
  );
  const saveCompany = React.useCallback(
    async (patch: CompanyPatch) => {
      const res = await updateCompanyProfile({ applicationId, ...patch });
      if (res.ok) router.refresh();
      return res.ok ? ({ ok: true } as const) : ({ ok: false, error: res.error } as const);
    },
    [applicationId, router]
  );

  const source = sources.find((s) => s.id === facts.sourceId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Group title="Company">
        <Row label="Website">
          <span className="flex min-w-0 items-center gap-1">
            <InlineField
              label="Website"
              value={company.domain}
              canEdit={canEdit}
              type="url"
              placeholder="Add website"
              onSave={(v) => saveCompany({ website: v })}
            />
            {company.domain && (
              <a
                href={company.websiteUrl ?? `https://${company.domain}`}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={`Open ${company.domain}`}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-accent max-md:size-10"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </span>
        </Row>
        <Row label="Sector">
          <SectorPicker
            selected={sectors}
            all={allSectors}
            canEdit={canEdit}
            onSave={async (sectorIds) => {
              const res = await saveCompany({ sectorIds });
              if (!res.ok) toast.error(res.error);
            }}
          />
        </Row>
      </Group>

      <Group title="Founder">
        <Row label="Name">
          <InlineField
            label="Founder"
            value={facts.applicantName}
            canEdit={canEdit}
            placeholder="Add founder"
            maxLength={120}
            onSave={(v) => saveFact({ applicantName: v })}
          />
        </Row>
        <Row label="Email">
          <span className="flex min-w-0 items-center gap-1">
            <InlineField
              label="Email"
              type="email"
              value={facts.applicantEmail}
              canEdit={canEdit}
              placeholder="Add email"
              maxLength={200}
              onSave={(v) => saveFact({ applicantEmail: v })}
            />
            {facts.applicantEmail && (
              <a
                href={`mailto:${facts.applicantEmail}`}
                aria-label={`Email ${facts.applicantEmail}`}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-accent max-md:size-10"
              >
                <ExternalLinkIcon className="size-3.5" />
              </a>
            )}
          </span>
        </Row>
        <Row label="Department">
          <InlineField
            label="Department"
            value={facts.department}
            canEdit={canEdit}
            placeholder="Add department"
            maxLength={120}
            onSave={(v) => saveFact({ department: v })}
          />
        </Row>
        <Row label="Class year">
          <InlineField
            label="Class year"
            type="number"
            value={facts.classYear != null ? String(facts.classYear) : null}
            canEdit={canEdit}
            placeholder="Add class year"
            inputClassName="tnum"
            className="tnum"
            onSave={(v) => saveFact({ classYear: v == null ? null : Number(v) })}
          />
        </Row>
        <Row label="Team size">
          <InlineField
            label="Team size"
            type="number"
            value={facts.teamSize != null ? String(facts.teamSize) : null}
            canEdit={canEdit}
            placeholder="Add team size"
            inputClassName="tnum"
            className="tnum"
            display={facts.teamSize === 1 ? "1 person" : `${facts.teamSize} people`}
            onSave={(v) => saveFact({ teamSize: v == null ? null : Number(v) })}
          />
        </Row>
      </Group>

      <Group title="Sourcing">
        <Row label="Deal source">
          <SourcePicker
            current={source}
            sources={sources}
            canEdit={canEdit}
            onSave={async (sourceId) => {
              const res = await saveFact({ sourceId });
              if (!res.ok) toast.error(res.error);
            }}
          />
        </Row>
        <Row label="Came via">
          <InlineField
            label="Campus source"
            value={facts.campusSource}
            canEdit={canEdit}
            placeholder="Hackathon, class, dorm…"
            maxLength={120}
            onSave={(v) => saveFact({ campusSource: v })}
          />
        </Row>
        <Row label="Applied">
          <span className="tnum">{format(appliedAt, "MMM d, yyyy")}</span>
        </Row>
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-2xs font-medium tracking-[0.06em] text-fg-subtle uppercase">{title}</h3>
      <dl className="flex flex-col">{children}</dl>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3 max-md:min-h-11">
      <dt className="w-24 shrink-0 text-xs text-fg-muted">{label}</dt>
      <dd className="flex min-w-0 flex-1 items-center text-sm">{children}</dd>
    </div>
  );
}

const triggerClass =
  "-mx-1.5 flex min-h-7 min-w-0 cursor-pointer flex-wrap items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-sm transition-colors outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 max-md:min-h-10";

function SectorChip({ sector }: { sector: SectorLookup }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-subtle px-2 py-0.5 text-xs">
      <StageDot colorToken={sector.colorToken} />
      {sector.name}
    </span>
  );
}

function SectorPicker({
  selected,
  all,
  canEdit,
  onSave,
}: {
  selected: SectorLookup[];
  all: SectorLookup[];
  canEdit: boolean;
  onSave: (sectorIds: string[]) => Promise<void>;
}) {
  // Optimistic ids while saves are in flight; dropped once the server catches up.
  const serverKey = selected.map((s) => s.id).sort().join(",");
  const [local, setLocal] = React.useState<string[] | null>(null);
  const [seenKey, setSeenKey] = React.useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setLocal(null);
  }
  const ids = new Set(local ?? selected.map((s) => s.id));
  const shown = local ? all.filter((s) => ids.has(s.id)) : selected;

  const chips =
    shown.length > 0 ? (
      shown.map((s) => <SectorChip key={s.id} sector={s} />)
    ) : canEdit ? (
      <span className="inline-flex items-center gap-1 text-fg-subtle">
        <PlusIcon className="size-3" />
        Add sector
      </span>
    ) : (
      <span className="text-fg-subtle">—</span>
    );

  if (!canEdit) return <span className="flex flex-wrap items-center gap-1">{chips}</span>;
  if (all.length === 0) {
    return <span className="text-xs text-fg-subtle">No sectors yet — an admin adds them in Settings.</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Edit sectors" className={triggerClass}>
        {chips}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-52 overflow-y-auto">
        {all.map((s) => (
          <DropdownMenuCheckboxItem
            key={s.id}
            checked={ids.has(s.id)}
            // Keep the menu open: sectors are often picked two at a time.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => {
              const next = new Set(ids);
              if (checked) next.add(s.id);
              else next.delete(s.id);
              setLocal([...next]);
              void onSave([...next]);
            }}
            className="max-md:h-11"
          >
            <StageDot colorToken={s.colorToken} />
            {s.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SourcePicker({
  current,
  sources,
  canEdit,
  onSave,
}: {
  current: Lookup | null;
  sources: Lookup[];
  canEdit: boolean;
  onSave: (sourceId: string | null) => Promise<void>;
}) {
  if (!canEdit) return <span className={cn(!current && "text-fg-subtle")}>{current?.name ?? "—"}</span>;
  if (sources.length === 0) {
    return <span className="text-xs text-fg-subtle">No deal sources yet — an admin adds them in Settings.</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Edit deal source" className={triggerClass}>
        <span className={cn(!current && "text-fg-subtle")}>{current?.name ?? "Set source"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-48 overflow-y-auto">
        {sources.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => void onSave(s.id)} className="gap-2 max-md:h-11">
            <span className="flex-1">{s.name}</span>
            {s.id === current?.id && <CheckIcon className="size-3.5 text-accent" />}
          </DropdownMenuItem>
        ))}
        {current && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void onSave(null)} className="text-fg-muted max-md:h-11">
              Clear
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
