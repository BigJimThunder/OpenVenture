import type { Metadata } from "next";
import { socialProviders } from "@/lib/auth";
import { emailConfigured } from "@/lib/env";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const providers = socialProviders();
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
      <LoginForm
        emailConfigured={emailConfigured()}
        providers={providers}
        // A social sign-in that the roster check turned away lands back here.
        denied={params.error != null}
      />
    </AuthFrame>
  );
}
