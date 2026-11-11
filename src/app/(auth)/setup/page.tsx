import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { getCtx } from "@/lib/actions/context";
import { seasonLabel, seasonStartYear } from "@/lib/utils";
import { AuthFrame } from "../auth-frame";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Set up your club" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  // Already a member (a stale tab, a bookmarked link): nothing to set up.
  if (await getCtx()) redirect("/inbox");

  const existing = await db.select({ name: organization.name }).from(organization).limit(1);

  if (existing.length > 0) {
    return (
      <AuthFrame
        title="You're not a member yet"
        description={
          <>
            {existing[0].name} is already set up here. Ask one of its admins to invite{" "}
            <span className="font-medium text-fg">{session.user.email}</span> from the Members
            page, then sign in again.
          </>
        }
      />
    );
  }

  const fiscalYear = seasonStartYear(new Date());
  return (
    <AuthFrame
      wide
      title="Set up your club"
      description="Three short steps. You'll be the first admin, and everything here can be changed later in Settings."
    >
      <SetupForm
        defaultFiscalYear={fiscalYear}
        fiscalYearLabel={seasonLabel(fiscalYear)}
        defaultName={session.user.name && session.user.name !== session.user.email ? session.user.name : ""}
      />
    </AuthFrame>
  );
}
