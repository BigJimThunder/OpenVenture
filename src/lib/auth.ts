import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, emailOTP } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendEmail, magicLinkEmail } from "@/lib/email";
import { appUrl } from "@/lib/notify";

/**
 * Magic link + email OTP. The OTP is the escape hatch for university mail
 * tenants whose link-scanning prefetch would consume a one-time link.
 * Signups are restricted: an auth user is only useful once linked to a
 * member row, and member rows are invite-only (see ensureMember()).
 */
export const auth = betterAuth({
  // BETTER_AUTH_URL when set (custom domain); otherwise the Vercel production
  // URL, so a fresh deploy sends working sign-in links with no configuration.
  baseURL: appUrl(),
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-do-not-use-in-prod",
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
  plugins: [
    magicLink({
      expiresIn: 60 * 15,
      sendMagicLink: async ({ email, url }) => {
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
