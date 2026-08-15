import { redirect } from "next/navigation";
import { getCtx } from "@/lib/actions/context";
import { Landing } from "@/components/marketing/landing";

/**
 * Public landing. Signed-in members go straight to the app; everyone else
 * gets the project's front door. Auth flows keep pointing at "/" — this
 * redirect is what routes them onward after sign-in.
 */
export default async function RootPage() {
  const ctx = await getCtx();
  if (ctx) redirect("/inbox");
  return <Landing />;
}
