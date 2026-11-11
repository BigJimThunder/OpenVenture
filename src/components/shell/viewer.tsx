"use client";

import * as React from "react";
import type { MemberRole } from "@/db/schema";
import { can, whoCan, type Capability } from "@/lib/permissions";

/**
 * The signed-in member, available to every client component under the app
 * shell. Use `useCan("manageMoney")` to decide whether to render a control —
 * the server action still enforces the rule; this only keeps the UI honest.
 */
export type Viewer = { memberId: string; name: string; role: MemberRole };

const ViewerContext = React.createContext<Viewer | null>(null);

export function ViewerProvider({ value, children }: { value: Viewer; children: React.ReactNode }) {
  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const v = React.useContext(ViewerContext);
  if (!v) throw new Error("useViewer must be used inside the app shell");
  return v;
}

export function useCan(capability: Capability): boolean {
  return can(useViewer().role, capability);
}

/**
 * Renders children only when the viewer has the capability. Pass `fallback`
 * to show a quiet explanation instead of nothing.
 */
export function Can({
  capability,
  children,
  fallback = null,
}: {
  capability: Capability;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  return useCan(capability) ? <>{children}</> : <>{fallback}</>;
}

export { whoCan };
