import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/actions/context";
import { getShellCounts } from "@/lib/queries/dashboard";
import { getSetupProgress } from "@/lib/queries/setup-progress";
import { AppShell } from "@/components/shell/app-shell";

/**
 * Auth-guarded shell. This layout AND every server action independently
 * enforce auth — never rely on middleware alone.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const ctx = await getCtx();
  if (!ctx) {
    // Signed in but not a member → first-run setup (or "ask for an invite").
    const session = await auth.api.getSession({ headers: await headers() });
    redirect(session?.user ? "/setup" : "/login");
  }

  // New members finish the welcome flow first. /start sits outside this
  // layout, so this cannot loop; token requests are never browser sessions.
  if (ctx.via === "session" && !ctx.member.onboardedAt) redirect("/start");

  // Only admins see the getting-started checklist — and only until it's done.
  const [counts, setup] = await Promise.all([
    getShellCounts(ctx.org.id, ctx.member.id),
    ctx.member.role === "admin" ? getSetupProgress(ctx.org) : null,
  ]);

  return (
    <div className="flex h-svh overflow-hidden bg-chrome print:block print:h-auto print:overflow-visible print:bg-transparent">
      <AppShell
        orgName={ctx.org.name}
        viewer={{ memberId: ctx.member.id, name: ctx.member.displayName, role: ctx.member.role }}
        inboxCount={counts.inbox}
        pipelineCount={counts.pipeline}
        setup={
          setup && !setup.complete && !setup.dismissed
            ? { done: setup.done, total: setup.total }
            : null
        }
      >
        {children}
      </AppShell>
    </div>
  );
}
