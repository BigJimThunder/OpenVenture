"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sidebar, type SetupProgress } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { NAV_ITEMS } from "./nav";
import { ViewerProvider, type Viewer } from "./viewer";
import {
  CommandPalette,
  PaletteContextProvider,
  type PaletteContext,
} from "./command-palette";
import { can } from "@/lib/permissions";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";

/**
 * Client half of the app shell. Owns the surfaces that must exist on every
 * screen — sidebar (desktop), tab bar (phone), ⌘K palette, the
 * new-application composer — and the global shortcuts that open them:
 *
 *   ⌘K or /   search and commands
 *   C         new application
 *   G then …  jump to a screen (G P → Pipeline; letters are listed in ⌘K)
 */
export function AppShell({
  orgName,
  viewer,
  inboxCount,
  pipelineCount,
  setup,
  children,
}: {
  orgName: string;
  viewer: Viewer;
  inboxCount: number;
  pipelineCount: number;
  setup?: SetupProgress | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const canContribute = can(viewer.role, "contribute");
  const isAdmin = can(viewer.role, "manageClub");

  // The active screen writes its selection here; the palette reads it on open.
  const contextRef = React.useRef<PaletteContext | null>(null);
  const [snapshot, setSnapshot] = React.useState<PaletteContext | null>(null);

  const openPalette = React.useCallback(() => {
    setSnapshot(contextRef.current);
    setPaletteOpen(true);
  }, []);

  const openComposer = React.useCallback(() => {
    if (canContribute) setComposerOpen(true);
  }, [canContribute]);

  React.useEffect(() => {
    let chordArmedAt = 0;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Single-key shortcuts never fire while typing or while an overlay
      // (dialog, menu, palette) owns the keyboard.
      if (paletteOpen || composerOpen || isTypingTarget(e.target) || overlayOpen()) return;

      const key = e.key.toLowerCase();
      if (chordArmedAt && Date.now() - chordArmedAt < 1200) {
        chordArmedAt = 0;
        const dest = NAV_ITEMS.find((n) => n.chord === key && (!n.adminOnly || isAdmin));
        if (dest) {
          e.preventDefault();
          router.push(dest.href);
        }
        return;
      }
      if (key === "g") {
        chordArmedAt = Date.now();
        return;
      }
      if (key === "/") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (key === "c" && canContribute) {
        e.preventDefault();
        setComposerOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, composerOpen, openPalette, canContribute, isAdmin, router]);

  return (
    <ViewerProvider value={viewer}>
      <PaletteContextProvider value={contextRef}>
        <div className="contents print:hidden">
          <Sidebar
            orgName={orgName}
            inboxCount={inboxCount}
            pipelineCount={pipelineCount}
            setup={setup}
            onNewApplication={openComposer}
            onSearch={openPalette}
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:py-2 md:pr-2 print:block print:p-0">
          {/* The one scroll container: document-style pages overflow here;
              screen-style pages (h-full roots) fit exactly and manage their
              own inner scroll. On desktop it is a sheet lifted off the chrome. */}
          <main
            id="main"
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-bg md:rounded-xl md:border md:border-border md:shadow-xs print:block print:overflow-visible print:rounded-none print:border-0 print:shadow-none"
          >
            {children}
          </main>
          <MobileNav
            orgName={orgName}
            inboxCount={inboxCount}
            onNewApplication={openComposer}
            onSearch={openPalette}
          />
        </div>
        <div className="print:hidden">
          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            context={snapshot}
            onNewApplication={canContribute ? openComposer : undefined}
          />
          {canContribute && (
            <NewApplicationDialog open={composerOpen} onOpenChange={setComposerOpen} />
          )}
        </div>
      </PaletteContextProvider>
    </ViewerProvider>
  );
}

/** True when the event came from a field the member is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** True when a Radix dialog or menu is open and owns the keyboard. */
export function overlayOpen(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"]')
  );
}
