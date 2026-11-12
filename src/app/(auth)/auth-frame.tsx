import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Shared frame for the screens outside the app shell (sign in, first-run
 * setup, page not found). Sits near the top on phones so the keyboard doesn't
 * cover the form, centred on larger screens. It is the page's `<main>`
 * landmark, so everything on these screens is reachable by landmark.
 */
export function AuthFrame({
  title,
  description,
  wide,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  wide?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center bg-chrome px-4 pb-8 pt-10 sm:justify-center sm:pt-8">
      <div className={cn("w-full", wide ? "max-w-md" : "max-w-sm")}>
        <Link
          href="/"
          aria-label="OpenVenture home"
          className="mb-6 flex size-10 items-center justify-center rounded-xl bg-accent text-md font-semibold text-accent-fg shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
        >
          OV
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 text-base leading-relaxed text-fg-muted">{description}</p>}
        {children && <div className="mt-6">{children}</div>}
        {footer && <div className="mt-6 text-sm text-fg-muted">{footer}</div>}
      </div>
    </main>
  );
}
