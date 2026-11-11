import type { Metadata } from "next";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFrame
      title="Sign in to OpenVenture"
      description="No password. We'll email you a link and a six-digit code."
      footer="Members join by invitation. If your club uses OpenVenture, ask an admin to invite you."
    >
      <LoginForm emailConfigured={Boolean(process.env.RESEND_API_KEY)} />
    </AuthFrame>
  );
}
