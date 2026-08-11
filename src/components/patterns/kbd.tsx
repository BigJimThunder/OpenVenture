import { cn } from "@/lib/utils";

/**
 * Keyboard hint. Shown next to every action that has a shortcut — menus, the
 * command palette, the peek panel's property rows — so members pick up the
 * keyboard path by reading the UI rather than a docs page.
 */
export function Kbd({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  /** "on-accent" for hints sitting on a filled accent button. */
  tone?: "default" | "on-accent";
}) {
  return (
    <kbd
      className={cn(
        "rounded-sm border px-1 font-mono text-[10px] leading-[1.4] font-normal",
        tone === "on-accent"
          ? "border-white/25 text-accent-fg"
          : "border-border bg-bg-subtle text-fg-subtle",
        className
      )}
    >
      {children}
    </kbd>
  );
}
