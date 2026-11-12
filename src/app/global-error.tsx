"use client";

import * as React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { TriangleAlertIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/**
 * Last-resort boundary: the root layout itself failed, so this replaces the
 * whole document and has to bring its own <html>, styles and fonts. It leans
 * on nothing that could be the thing that broke — no providers, no data, no
 * router (the way out is a plain link, which forces a clean reload).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  // The theme provider is gone with the layout: re-apply the member's saved
  // choice (next-themes keeps it under "theme"), else follow the system.
  React.useLayoutEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("theme");
    } catch {}
    const dark =
      saved === "dark" ||
      (saved !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, []);

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <title>Something went wrong · OpenVenture</title>
        <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-chrome p-6 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-danger-bg text-danger">
            <TriangleAlertIcon className="size-5" aria-hidden />
          </span>
          <div role="alert">
            <h1 className="text-md font-semibold">OpenVenture didn&apos;t load</h1>
            <p className="mt-1 max-w-sm text-sm text-fg-muted">
              Nothing was lost — your data is safe. Try again, and if it keeps happening send an
              admin the reference below.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => retry()}>Try again</Button>
            {/* A full page load on purpose: client navigation may be what failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className={buttonVariants({ variant: "secondary" })}>
              Go to the home page
            </a>
          </div>
          {error.digest && (
            <code className="font-mono text-2xs text-fg-subtle">ref {error.digest}</code>
          )}
        </main>
      </body>
    </html>
  );
}
