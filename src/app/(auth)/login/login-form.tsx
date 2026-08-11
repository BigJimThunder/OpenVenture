"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [phase, setPhase] = React.useState<"email" | "sent">("email");
  const [busy, setBusy] = React.useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Send both: the magic link and the OTP fallback (university mail
      // scanners can prefetch and burn one-time links; the code survives).
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/",
      });
      if (error) throw new Error(error.message ?? "Failed to send");
      await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      setPhase("sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send sign-in email");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp });
      if (error) throw new Error(error.message ?? "Invalid code");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        {phase === "email" ? (
          <form onSubmit={sendLink} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">School email</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                placeholder="you@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={busy || !email}>
              {busy ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="flex flex-col gap-3">
            <p className="text-xs text-fg-muted">
              We sent a link and a code to <span className="font-medium text-fg">{email}</span>.
              Click the link, or enter the code:
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="otp">6-digit code</Label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                placeholder="000000"
                className="text-center text-md tracking-[0.5em] tnum"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <Button type="submit" disabled={busy || otp.length !== 6}>
              {busy ? "Verifying…" : "Sign in"}
            </Button>
            <button
              type="button"
              onClick={() => setPhase("email")}
              className="text-xs text-fg-muted hover:text-fg cursor-pointer"
            >
              Use a different email
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
