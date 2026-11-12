import type { Metadata } from "next";
import { socialProviders } from "@/lib/auth";
import { emailConfigured } from "@/lib/env";
import { demoMode } from "@/lib/demo";
import { loadSoleOrg } from "@/lib/intake";
import { Button } from "@/components/ui/button";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const providers = socialProviders();
  const demo = demoMode(await loadSoleOrg().catch(() => null));
  return (
    <AuthFrame
      title="Sign in to OpenVenture"
      description={
        providers.length > 0
          ? "No password. Use your school account, or we'll email you a link and a six-digit code."
          : "No password. We'll email you a link and a six-digit code."
      }
      footer="Members join by invitation. If your club uses OpenVenture, ask an admin to invite you."
    >
      {demo ? (
        <form method="post" action="/api/demo" className="mb-6 flex flex-col gap-2 rounded-lg border border-border bg-panel p-4 shadow-xs">
          <p className="text-sm leading-relaxed">
            <span className="font-medium">This is the public demo.</span>{" "}
            <span className="text-fg-muted">
              Look around a fictional club as its admin. Nothing you do is saved.
            </span>
          </p>
          <Button type="submit" size="lg" className="h-11">
            Explore the demo
          </Button>
          {params.demo === "busy" ? (
            <p role="alert" className="text-xs text-fg-muted">
              Lots of visitors from your network right now. Try again in a little while.
            </p>
          ) : null}
        </form>
      ) : null}
      <LoginForm
        emailConfigured={emailConfigured()}
        providers={providers}
        // A social sign-in that the roster check turned away lands back here.
        denied={params.error != null}
      />
    </AuthFrame>
  );
}
