import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/actions/context";
import { loadSoleOrg } from "@/lib/intake";
import { orgSettings } from "@/lib/org-settings";
import { Landing } from "@/components/marketing/landing";

/**
 * Public landing. Signed-in members go straight to the app; someone signed in
 * who is not a member yet goes to first-run setup; everyone else gets the
 * project's front door. Auth flows keep pointing at "/" — these redirects are
 * what route people onward after sign-in.
 */
export default async function RootPage() {
  const ctx = await getCtx();
  if (ctx) redirect("/inbox");
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) redirect("/setup");

  // "Apply for a grant" is only offered when this deployment's club has
  // actually opened its form.
  const org = await loadSoleOrg().catch(() => null);
  const applying = org && orgSettings(org).apply.enabled ? { clubName: org.name } : null;
  return <Landing applying={applying} />;
}
