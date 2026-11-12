"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/patterns/field";

const RESEND_AFTER_SECONDS = 30;

const PROVIDER_LABEL = { google: "Google", microsoft: "Microsoft" } as const;
type Provider = keyof typeof PROVIDER_LABEL;

export function LoginForm({
  emailConfigured,
  providers = [],
  denied = false,
}: {
  emailConfigured: boolean;
  providers?: Provider[];
  denied?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [phase, setPhase] = React.useState<"email" | "sent">("email");
  const [busy, setBusy] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (phase !== "sent") return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  async function send() {
    setBusy(true);
    try {
      // Send both: the magic link and the OTP fallback (university mail
      // scanners can prefetch and burn one-time links; the code survives).
      const { error } = await authClient.signIn.magicLink({ email, callbackURL: "/" });
      if (error) throw new Error(error.message ?? "Failed to send");
      await authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
      setOtp("");
      setCooldown(RESEND_AFTER_SECONDS);
      setPhase("sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't send the sign-in email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function social(provider: Provider) {
    setBusy(true);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/",
      errorCallbackURL: "/login?error=not_invited",
    });
    if (error) {
      setBusy(false);
      toast.error(error.message ?? `We couldn't reach ${PROVIDER_LABEL[provider]}. Try the email link instead.`);
    }
  }

  async function verify(code: string) {
    setBusy(true);
    try {
      const { error } = await authClient.signIn.emailOtp({ email, otp: code });
      if (error) throw new Error(error.message ?? "That code didn't work");
      router.push("/");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setOtp("");
      toast.error(err instanceof Error ? err.message : "That code didn't work");
    }
  }

  if (phase === "email") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-col gap-4"
      >
        {denied ? (
          <p role="alert" className="rounded-lg border border-border bg-panel px-3.5 py-3 text-sm leading-relaxed text-fg-muted shadow-xs">
            That account isn&apos;t on this club&apos;s member list. Sign in with the address you
            were invited at, or ask an admin to invite you.
          </p>
        ) : null}
        {providers.length > 0 ? (
          <>
            <div className="flex flex-col gap-2">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="h-11"
                  disabled={busy}
                  onClick={() => void social(provider)}
                >
                  Continue with {PROVIDER_LABEL[provider]}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-xs text-fg-muted" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        ) : null}
        <Field label="Email">
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            autoCapitalize="none"
            inputMode="email"
            placeholder="you@university.edu"
            className="h-11 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="h-11" disabled={busy || !email}>
          {busy ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(otp);
      }}
      className="flex flex-col gap-4"
    >
      <p className="rounded-lg border border-border bg-panel px-3.5 py-3 text-sm leading-relaxed text-fg-muted shadow-xs">
        {emailConfigured ? (
          <>
            Check <span className="font-medium text-fg">{email}</span>. Tap the link in the email,
            or type the code from it here.
          </>
        ) : (
          <>
            Email isn&apos;t connected on this deployment yet, so the link and code for{" "}
            <span className="font-medium text-fg">{email}</span> were written to the server log
            instead. Add a <span className="font-mono text-xs">RESEND_API_KEY</span> to send real
            email.
          </>
        )}
      </p>
      {emailConfigured ? (
        <p className="text-xs leading-relaxed text-fg-muted">
          Nothing after a minute? Only invited members are sent a sign-in email. Check the
          address, look in spam, or ask an admin to invite you.
        </p>
      ) : null}
      <Field label="Six-digit code">
        <Input
          id="otp"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          placeholder="000000"
          className="tnum h-12 text-center font-mono text-lg tracking-[0.4em]"
          value={otp}
          onChange={(e) => {
            const code = e.target.value.replace(/\D/g, "").slice(0, 6);
            setOtp(code);
            // Pasting or autofilling the full code signs in without another tap.
            if (code.length === 6 && !busy) void verify(code);
          }}
        />
      </Field>
      <Button type="submit" size="lg" className="h-11" disabled={busy || otp.length !== 6}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => setPhase("email")}
          className="-mx-2 cursor-pointer rounded-md px-2 py-2 text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Use a different email
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || cooldown > 0}
          className="-mx-2 cursor-pointer rounded-md px-2 py-2 text-fg-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default disabled:text-fg-subtle"
        >
          {cooldown > 0 ? <span className="tnum">Resend in {cooldown}s</span> : "Send it again"}
        </button>
      </div>
    </form>
  );
}
