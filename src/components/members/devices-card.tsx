"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { signOutOtherDevices } from "@/lib/actions/sessions";
import type { DeviceSession } from "@/lib/queries/sessions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Where this member is signed in, with a way to end the other sessions. */
export function DevicesCard({ sessions }: { sessions: DeviceSession[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const others = sessions.filter((s) => !s.current).length;

  async function signOutOthers() {
    setBusy(true);
    const res = await signOutOtherDevices({});
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      res.data.signedOut === 0
        ? "No other devices were signed in."
        : `Signed out of ${res.data.signedOut} other ${res.data.signedOut === 1 ? "device" : "devices"}.`
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-2">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {s.device}
                {s.current ? <span className="text-fg-muted"> · this device</span> : null}
              </span>
              <span className="tnum shrink-0 text-xs text-fg-muted">
                {s.current ? "now" : s.lastSeen}
              </span>
            </li>
          ))}
        </ul>
        {others > 0 ? (
          <Button variant="secondary" size="sm" className="self-start" disabled={busy} onClick={() => void signOutOthers()}>
            {busy ? "Signing out…" : "Sign out everywhere else"}
          </Button>
        ) : (
          <p className="text-xs text-fg-muted">You&apos;re only signed in here. Sessions last 30 days.</p>
        )}
      </CardContent>
    </Card>
  );
}
