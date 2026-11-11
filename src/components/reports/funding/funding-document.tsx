import * as React from "react";
import {
  FR_BULLET_FIELDS,
  FR_FIELD_META,
  formatItemAmount,
  formatUsd,
  foundersOf,
  isCut,
  recommendationOf,
  voteLine,
  type FundingRequestContent,
  type FundingRequestFacts,
  type LineItem,
} from "@/lib/reports/funding-request";
import { cn } from "@/lib/utils";

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * The memo itself, laid out the way the club already writes it: title and
 * founders, the recommendation, a ruled Asked / Approved table with the line
 * items and the two rationales, the company summary with its arrow bullets,
 * then upside against concerns. One component serves the live preview, the
 * read-only page and the printed PDF, so what a member sees is what goes up.
 */
export function FundingDocument({
  facts,
  content,
  date,
  className,
}: {
  facts: FundingRequestFacts;
  content: FundingRequestContent;
  /** ISO date shown in the header: when it was finalized, or today for a draft. */
  date: string;
  className?: string;
}) {
  const founders = foundersOf(facts, content);
  const upside = content.upside.filter((s) => s.trim());
  const concerns = content.concerns.filter((s) => s.trim());
  const bullets = FR_BULLET_FIELDS.filter((f) => content[f].trim());

  return (
    <article
      className={cn(
        "fr-doc font-display text-[0.9375rem] leading-[1.55] text-fg print:text-[10.5pt] print:leading-[1.45] print:text-black",
        className
      )}
    >
      <header className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-2 font-sans text-2xs tracking-wide text-fg-subtle print:mb-5 print:border-black/30 print:text-black/60">
        <span>{facts.clubName}</span>
        <span className="tnum">Funding request · {shortDate(date)}</span>
      </header>

      <h1 className="text-[1.625rem] leading-tight font-semibold tracking-tight print:text-[20pt]">
        {facts.companyName}
      </h1>
      <p className="mt-1 text-fg-muted print:text-black/70">
        Founders: {founders || <Missing>the founders</Missing>}
      </p>

      <p className="mt-5">
        <strong>Recommendation:</strong> <Prompted text={recommendationOf(facts, content)} />
      </p>

      <p className="mt-4 mb-1.5">
        <strong>Details:</strong>
      </p>
      <div className="grid grid-cols-1 border border-border-strong sm:grid-cols-2 print:grid-cols-2 print:border-black/60">
        <Cell className="text-center font-semibold" order="order-1 sm:order-1 print:order-1">
          Asked: <span className="tnum">{formatUsd(facts.askedTotal)}</span>
        </Cell>
        <Cell className="text-center font-semibold" order="order-4 sm:order-2 print:order-2" right>
          Approved: <span className="tnum">{formatUsd(facts.approvedTotal)}</span>
        </Cell>
        <Cell order="order-2 sm:order-3 print:order-3" top>
          <Items items={content.askedItems} />
        </Cell>
        <Cell order="order-5 sm:order-4 print:order-4" top right>
          <Items items={content.approvedItems} />
        </Cell>
        <Cell order="order-3 sm:order-5 print:order-5" top>
          <strong>{FR_FIELD_META.rationaleFunding.documentLabel}:</strong>
          <Prose text={content.rationaleFunding} missing="why we are funding this" className="mt-2" />
        </Cell>
        <Cell order="order-6 sm:order-6 print:order-6" top right>
          <strong>{FR_FIELD_META.rationaleCuts.documentLabel}:</strong>
          <Prose
            text={content.rationaleCuts || (isCut(facts) ? "" : "N/A")}
            missing="why we approved less than the ask"
            className="mt-2"
          />
        </Cell>
      </div>

      <p className="mt-6">
        <strong>Company summary:</strong>
      </p>
      <Prose text={content.summary} missing="what the company does" className="mt-2" />

      {bullets.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3.5 pl-1 sm:pl-6 print:pl-6">
          {bullets.map((field) => (
            <li key={field} className="flex gap-3 break-inside-avoid">
              <span aria-hidden className="shrink-0 font-sans">
                →
              </span>
              <div className="min-w-0 whitespace-pre-line">
                <strong>{FR_FIELD_META[field].documentLabel}:</strong> {content[field].trim()}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2 print:grid-cols-2">
        <Numbered title={FR_FIELD_META.upside.documentLabel} items={upside} missing="an area of upside" />
        <Numbered title={FR_FIELD_META.concerns.documentLabel} items={concerns} missing="an area of concern" />
      </div>

      <footer className="mt-8 border-t border-border pt-2 font-sans text-2xs leading-relaxed text-fg-subtle print:border-black/30 print:text-black/60">
        {facts.vote && <div className="tnum">Club vote: {voteLine(facts.vote)}</div>}
        <div>
          {facts.preparedBy ? `Prepared by ${facts.preparedBy}` : "Prepared"} for {facts.clubName}
          {facts.memo && ` · Investment memo by ${facts.memo.authorName}, ${shortDate(facts.memo.date)}`}
        </div>
      </footer>
    </article>
  );
}

function Cell({
  children,
  className,
  order,
  top,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  /** Stacked on phones the two columns read Asked-then-Approved; side by side from `sm` and in print. */
  order: string;
  top?: boolean;
  right?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 border-border-strong px-3 py-2.5 print:border-black/60",
        top && "border-t",
        right && "max-sm:border-t sm:border-l print:border-l",
        order,
        className
      )}
    >
      {children}
    </div>
  );
}

function Items({ items }: { items: LineItem[] }) {
  const rows = items.filter((i) => i.name.trim() || i.amount);
  if (rows.length === 0) {
    return <p className="font-sans text-xs text-fg-subtle print:hidden">No line items.</p>;
  }
  return (
    <table className="w-full border-collapse font-sans text-[0.8125rem] leading-snug print:text-[9pt]">
      <tbody>
        {rows.map((item) => (
          <tr key={item.id} className="break-inside-avoid border-b border-border last:border-b-0 print:border-black/20">
            <td className="py-1 pr-3 align-top">{item.name}</td>
            <td className="tnum py-1 text-right align-bottom whitespace-nowrap">{formatItemAmount(item.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Numbered({ title, items, missing }: { title: string; items: string[]; missing: string }) {
  return (
    <section className="min-w-0">
      <p>
        <strong>{title}:</strong>
      </p>
      {items.length > 0 ? (
        <ol className="mt-1 list-decimal pl-6">
          {items.map((item, i) => (
            <li key={i} className="mt-1 break-inside-avoid pl-1 whitespace-pre-line">
              {item.trim()}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-1">
          <Missing>{missing}</Missing>
        </p>
      )}
    </section>
  );
}

function Prose({ text, missing, className }: { text: string; missing: string; className?: string }) {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean);
  if (paragraphs.length === 0) {
    return (
      <p className={className}>
        <Missing>{missing}</Missing>
      </p>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          <Prompted text={p} />
        </p>
      ))}
    </div>
  );
}

/** A gap the member still has to fill. Loud on screen and on paper, so it can't be sent by accident. */
function Missing({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-warning-bg px-1 font-sans text-[0.8125rem] text-warning print:bg-transparent print:text-black">
      [add: {children}]
    </span>
  );
}

/** Highlights "[add: …]" prompts left in drafted text. */
function Prompted({ text }: { text: string }) {
  const parts = text.split(/(\[add:[^\]]*\])/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("[add:") ? (
          <span key={i} className="rounded-sm bg-warning-bg px-1 text-warning print:bg-transparent print:text-black">
            {part}
          </span>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}
