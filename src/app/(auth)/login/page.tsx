import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-fg text-lg font-bold">
            OV
          </div>
          <h1 className="text-lg font-semibold">Sign in to OpenVenture</h1>
          <p className="mt-1 text-xs text-fg-muted">
            We&apos;ll email you a magic link and a 6-digit code.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
