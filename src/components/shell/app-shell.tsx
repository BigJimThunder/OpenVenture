"use client";

import * as React from "react";
import { Sidebar } from "./sidebar";
import {
  CommandPalette,
  PaletteContextProvider,
  type PaletteContext,
} from "./command-palette";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";

/**
 * Client half of the app shell. Owns the surfaces that must exist on every
 * screen — sidebar, ⌘K palette, the new-application composer — and the global
 * shortcuts that open them.
 */
export function AppShell({
  orgName,
  memberName,
  role,
  inboxCount,
  pipelineCount,
  children,
}: {
  orgName: string;
  memberName: string;
  role: string;
  inboxCount: number;
  pipelineCount: number;
  children: React.ReactNode;
}) {
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [composerOpen, setComposerOpen] = React.useState(false);

  // The active screen writes its selection here; the palette reads it on open.
  const contextRef = React.useRef<PaletteContext | null>(null);
  const [snapshot, setSnapshot] = React.useState<PaletteContext | null>(null);

  const openPalette = React.useCallback(() => {
    setSnapshot(contextRef.current);
    setPaletteOpen(true);
  }, []);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette();
        return;
      }
      // `C` creates from anywhere — but never while typing, and never when a
      // dialog already owns the keyboard.
      if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (paletteOpen || composerOpen || isTypingTarget(e.target)) return;
        e.preventDefault();
        setComposerOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, composerOpen, openPalette]);

  return (
    <PaletteContextProvider value={contextRef}>
      <div className="contents print:hidden">
        <Sidebar
          orgName={orgName}
          memberName={memberName}
          role={role}
          inboxCount={inboxCount}
          pipelineCount={pipelineCount}
          onNewApplication={() => setComposerOpen(true)}
        />
      </div>
      {/* The one scroll container: document-style pages overflow here; screen-style
          pages (h-full roots) fit exactly and manage their own inner scroll. */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto print:block print:overflow-visible">
        {children}
      </div>
      <div className="print:hidden">
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          context={snapshot}
          onNewApplication={() => setComposerOpen(true)}
        />
        <NewApplicationDialog open={composerOpen} onOpenChange={setComposerOpen} />
      </div>
    </PaletteContextProvider>
  );
}

/** True when the event came from a field the member is typing into. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
