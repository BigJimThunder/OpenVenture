import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your club" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const existing = await db.select({ id: organization.id }).from(organization).limit(1);

  return (
    <div className="flex min-h-svh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        {existing.length > 0 ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold">You&apos;re not a member yet</h1>
            <p className="mt-2 text-sm text-fg-muted">
              This club is already set up. Ask an admin to invite{" "}
              <span className="font-medium text-fg">{session.user.email}</span> from
              Settings → Members.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="text-lg font-semibold">Set up your club</h1>
              <p className="mt-1 text-xs text-fg-muted">
                Takes under a minute. You&apos;ll be the first admin; everything here can be
                changed later in Settings.
              </p>
            </div>
            <SetupForm defaultFiscalYear={new Date().getFullYear()} />
          </>
        )}
      </div>
    </div>
  );
}
