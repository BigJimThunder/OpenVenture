import { cn } from "@/lib/utils";

/**
 * The 48px per-screen header. Replaces the old global topbar: chrome is
 * suppressed and each screen states its own title, a quiet count/meta line,
 * and whatever view controls it owns on the right.
 */
export function ScreenHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4 md:px-5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        {meta && <span className="tnum truncate text-xs text-fg-subtle">{meta}</span>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/**
 * Bottom hint rail. Desktop only (phones have no keyboard). Costs 32px and teaches the keyboard path — which matters
 * here because nobody is trained and officers hand the app over in a
 * 20-minute conversation.
 */
export function ScreenFooter({
  note,
  children,
}: {
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <footer className="hidden h-8 shrink-0 items-center gap-3.5 border-t border-border px-4 text-2xs text-fg-subtle md:flex md:px-5">
      {note && <span className="truncate">{note}</span>}
      <span className="ml-auto flex items-center gap-3.5">{children}</span>
    </footer>
  );
}
