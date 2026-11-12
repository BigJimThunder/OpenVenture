import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail, magicLinkEmail } from "@/lib/email";
import { appUrl } from "@/lib/notify";
import { authSecret } from "@/lib/env";
import { claimSignInMail, maySignIn } from "@/lib/sign-in-policy";

/**
 * Magic link + email OTP, and optionally Google / Microsoft sign-in. The OTP
 * is the escape hatch for university mail tenants whose link-scanning
 * prefetch would consume a one-time link.
 *
 * Sign-in is invite-only, enforced in three places (src/lib/sign-in-policy.ts):
 *   - no sign-in email is sent to an address that isn't an invited or active
 *     member (the response is the same either way);
 *   - no auth account is created for such an address, whichever way it
 *     arrives — link, code or a social provider;
 *   - an auth user is only useful once linked to a member row (getCtx).
 */

/**
 * Social sign-in is on when its credentials are set. Microsoft additionally
 * needs the school's tenant id: on the shared "common" tenant an account's
 * email is whatever its owner typed, which must never be trusted as identity.
 */
export function socialProviders(): ("google" | "microsoft")[] {
  const on: ("google" | "microsoft")[] = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) on.push("google");
  if (
    process.env.MICROSOFT_CLIENT_ID &&
    process.env.MICROSOFT_CLIENT_SECRET &&
    process.env.MICROSOFT_TENANT_ID
  ) {
    on.push("microsoft");
  }
  return on;
}

/**
 * Demo entry (src/app/api/demo/route.ts) asks for a sign-in link the
 * ordinary way and collects it here instead of emailing it, so a visitor is
 * signed in by better-auth's own verification — no session is forged.
 */
export const linkCapture = new AsyncLocalStorage<{ url?: string }>();

export const auth = betterAuth({
  // BETTER_AUTH_URL when set (custom domain); otherwise the Vercel production
  // URL, so a fresh deploy sends working sign-in links with no configuration.
  baseURL: appUrl(),
  // Never a public fallback in production — see src/lib/env.ts.
  secret: authSecret(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,
  },
  socialProviders: {
    ...(socialProviders().includes("google")
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(socialProviders().includes("microsoft")
      ? {
          microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID!,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
            tenantId: process.env.MICROSOFT_TENANT_ID!,
          },
        }
      : {}),
  },
  databaseHooks: {
    user: {
      create: {
        // The last gate: whatever path produced this sign-up, an address
        // that isn't on the roster does not get an account.
        before: async (candidate) => (await maySignIn(candidate.email)) ? undefined : false,
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
        const capture = linkCapture.getStore();
        if (capture) {
          capture.url = url;
          return;
        }
        if (!(await maySignIn(email)) || !(await claimSignInMail(email, "link"))) return;
        await sendEmail({
          to: email,
          subject: "Sign in to OpenVenture",
          html: magicLinkEmail(url),
        });
      },
    }),
    emailOTP({
      expiresIn: 60 * 15,
      otpLength: 6,
      async sendVerificationOTP({ email, otp }) {
        if (!(await maySignIn(email)) || !(await claimSignInMail(email, "code"))) return;
        await sendEmail({
          to: email,
          subject: `${otp} is your OpenVenture code`,
          html: magicLinkEmail("#", otp),
        });
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
