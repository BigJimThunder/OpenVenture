"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronLeftIcon,
  ListIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { refreshAnnualReport } from "@/lib/actions/annual-report";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SECTION_TITLES,
  annualProgress,
  type AnnualContent,
  type AnnualDerived,
  type EssayMaterial,
  type SectionId,
} from "@/lib/reports/annual";
import { cn } from "@/lib/utils";
import { CompaniesEditor, CompanyEditor } from "./company-editor";
import { Field } from "./fields";
import { Outline } from "./outline";
import { Preview } from "./preview";
import { FinalizeButton } from "./report-actions";
import {
  CoverEditor,
  LookingForwardEditor,
  MissionEditor,
  ProgramsEditor,
  TeamEditor,
  type EditorProps,
} from "./section-editors";
import { useAnnualDraft, type SaveStatus } from "./use-annual-draft";

function SaveIndicator({ status, error, onRetry }: { status: SaveStatus; error: string | null; onRetry: () => void }) {
  if (status === "error") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-danger" role="alert">
        <AlertCircleIcon className="size-3.5 shrink-0" />
        <span className="max-w-56 truncate max-md:hidden" title={error ?? undefined}>
          {error ?? "Not saved"}
        </span>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-fg-subtle" aria-live="polite">
      {status === "saved" ? (
        <>
          <CheckIcon className="size-3.5 text-success" />
          Saved
        </>
      ) : (
        <>
          <Loader2Icon className="size-3.5 animate-spin" />
          Saving…
        </>
      )}
    </span>
  );
}

const SECTION_EDITORS: Record<Exclude<SectionId, "companies">, React.ComponentType<EditorProps>> = {
  team: TeamEditor,
  mission: MissionEditor,
  programs: ProgramsEditor,
  looking_forward: LookingForwardEditor,
};

/**
 * The annual report builder: outline rail, editor, live preview. The first
 * draft arrives assembled from the year's data; this screen is where members
 * add the parts only they can write.
 */
export function AnnualBuilder({
  reportId,
  fiscalYear,
  initialContent,
  derived,
  materials,
  viewerId,
  canEditAll,
  aiEnabled,
}: {
  reportId: string;
  fiscalYear: number;
  initialContent: AnnualContent;
  derived: AnnualDerived;
  materials: Record<string, EssayMaterial>;
  viewerId: string;
  /** Partners and admins; analysts edit only the spreads they author. */
  canEditAll: boolean;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const draft = useAnnualDraft(reportId, initialContent);
  const { content, apply } = draft;
  const mine = content.companies.filter((c) => c.included && c.authorMemberId === viewerId);
  const [selected, setSelected] = React.useState<string>(() =>
    canEditAll || mine.length === 0 ? "cover" : `company:${mine[0].id}`
  );
  const [tab, setTab] = React.useState<"edit" | "preview">("edit");
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement | null>(null);

  const progress = React.useMemo(() => annualProgress(content, derived), [content, derived]);

  const select = React.useCallback((target: string) => {
    setSelected(target);
    setTab("edit");
    setOutlineOpen(false);
    scroller.current?.scrollTo({ top: 0 });
  }, []);

  async function refresh() {
    setRefreshing(true);
    await draft.flush();
    const res = await refreshAnnualReport({ reportId });
    setRefreshing(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    draft.reset(res.data.content);
    router.refresh();
    const added = [
      res.data.addedCompanies > 0 ? `${res.data.addedCompanies} new company spread${res.data.addedCompanies === 1 ? "" : "s"}` : "",
      res.data.addedMembers > 0 ? `${res.data.addedMembers} new member${res.data.addedMembers === 1 ? "" : "s"}` : "",
    ].filter(Boolean);
    toast.success(added.length > 0 ? `Numbers refreshed; added ${added.join(" and ")}` : "Numbers refreshed. Your writing was not touched.");
  }

  const companyId = selected.startsWith("company:") ? selected.slice("company:".length) : null;
  const sectionId = (["team", "mission", "companies", "programs", "looking_forward"] as const).find(
    (s) => s === selected
  );
  const section = sectionId ? content.sections.find((s) => s.id === sectionId) : undefined;
  const companyName = companyId ? derived.companies.find((c) => c.companyId === companyId)?.name : undefined;
  const heading =
    selected === "cover"
      ? "Cover and contents"
      : companyId
        ? (companyName ?? "Company")
        : section
          ? section.title.trim() || SECTION_TITLES[section.id]
          : "";

  const editorProps: EditorProps = {
    reportId,
    content,
    derived,
    apply,
    canEdit: canEditAll,
    viewerId,
    aiEnabled,
  };
  const SectionEditor = sectionId && sectionId !== "companies" ? SECTION_EDITORS[sectionId] : null;

  const outline = (
    <Outline
      content={content}
      derived={derived}
      progress={progress}
      selected={selected}
      onSelect={select}
      apply={apply}
      canEdit={canEditAll}
    />
  );

  const refreshButton = canEditAll && (
    <Button
      variant="secondary"
      size="sm"
      disabled={refreshing}
      onClick={refresh}
      title="Recount the year and pull in new companies and members. Nothing you wrote changes."
    >
      <RefreshCwIcon className={cn(refreshing && "animate-spin")} />
      Refresh numbers
    </Button>
  );

  return (
    <div className="flex h-full flex-col">
      <ScreenHeader
        title={`Annual report ${derived.label}`}
        meta={<span className="max-md:hidden">{derived.inProgress ? "Draft · year in progress" : "Draft"}</span>}
        actions={
          <>
            <SaveIndicator status={draft.status} error={draft.error} onRetry={() => void draft.flush()} />
            <span className="max-lg:hidden">{refreshButton}</span>
            <Button variant="secondary" size="sm" asChild className="max-md:hidden">
              <Link href={`/reports/annual/${fiscalYear}/view`}>
                <BookOpenIcon />
                Read
              </Link>
            </Button>
            <FinalizeButton
              reportId={reportId}
              fiscalYear={fiscalYear}
              missing={progress.missing.map((m) => m.text)}
              beforeFinalize={async () => {
                await draft.flush();
                return true;
              }}
            />
          </>
        }
      />

      {/* Below xl the preview is a tab; below lg the outline is a sheet. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5 xl:hidden">
        <Button variant="ghost" size="sm" className="min-w-0 max-md:h-10 lg:hidden" onClick={() => setOutlineOpen(true)}>
          <ListIcon />
          <span className="truncate">{heading}</span>
          <span className="tnum shrink-0 text-fg-subtle">
            {progress.ready}/{progress.total}
          </span>
        </Button>
        <span className="max-lg:hidden" />
        <Tabs value={tab} onValueChange={(v) => setTab(v as "edit" | "preview")}>
          <TabsList className="max-md:h-10">
            <TabsTrigger value="edit" className="max-md:h-9 max-md:px-4">
              Edit
            </TabsTrigger>
            <TabsTrigger value="preview" className="max-md:h-9 max-md:px-4">
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border lg:block">{outline}</aside>

        <div
          ref={scroller}
          className={cn("min-w-0 flex-1 overflow-y-auto", tab === "preview" && "max-xl:hidden")}
        >
          <div className="mx-auto max-w-[44rem] px-4 pt-5 pb-24 md:px-8 md:pt-7">
            {companyId && (
              <button
                type="button"
                className="mb-3 flex cursor-pointer items-center gap-1 text-xs text-fg-muted hover:text-fg"
                onClick={() => select("companies")}
              >
                <ChevronLeftIcon className="size-3.5" />
                All company spreads
              </button>
            )}
            {!canEditAll && !companyId && (
              <p className="mb-5 rounded-lg border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
                Partners edit this part of the report.{" "}
                {mine.length > 0
                  ? "You can write the essays you are the author of: pick one under Our Theses in the outline."
                  : "You have no essay assigned yet; a partner chooses each essay's author."}
              </p>
            )}
            {section && canEditAll && (
              <div className="mb-6">
                <Field
                  label="Section title"
                  htmlFor="ar-section-title"
                  hint={section.included ? undefined : "This section is switched off in the outline and will not appear in the report."}
                >
                  <Input
                    id="ar-section-title"
                    value={section.title}
                    maxLength={120}
                    placeholder={SECTION_TITLES[section.id]}
                    onChange={(e) =>
                      apply({ op: "set", path: ["sections", section.id, "title"], value: e.target.value })
                    }
                  />
                </Field>
              </div>
            )}
            {selected === "cover" && <CoverEditor {...editorProps} />}
            {sectionId === "companies" && (
              <CompaniesEditor {...editorProps} onOpen={(id) => select(`company:${id}`)} />
            )}
            {SectionEditor && <SectionEditor {...editorProps} />}
            {companyId && (
              <CompanyEditor key={companyId} {...editorProps} companyId={companyId} material={materials[companyId]} />
            )}
          </div>
        </div>

        <aside
          className={cn(
            "overflow-y-auto bg-bg-subtle xl:block xl:w-[34rem] xl:shrink-0 xl:border-l xl:border-border 2xl:w-[40rem]",
            tab === "preview" ? "max-xl:min-w-0 max-xl:flex-1" : "max-xl:hidden"
          )}
          aria-label="Preview"
        >
          <div className="p-3 md:p-5">
            <Preview content={content} derived={derived} />
          </div>
        </aside>
      </div>

      <Dialog open={outlineOpen} onOpenChange={setOutlineOpen}>
        <DialogContent className="p-2 pt-4">
          <DialogHeader className="px-3">
            <DialogTitle>Sections</DialogTitle>
            <DialogDescription>Pick a part to work on. Switches decide what is in the report.</DialogDescription>
          </DialogHeader>
          {outline}
          {refreshButton && <div className="px-5 pb-3">{refreshButton}</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
