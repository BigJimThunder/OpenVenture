import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/actions/context";
import { getShellCounts } from "@/lib/queries/dashboard";
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

  const counts = await getShellCounts(ctx.org.id, ctx.member.id);

  return (
    <div className="flex h-svh overflow-hidden print:block print:h-auto print:overflow-visible">
      <AppShell
        orgName={ctx.org.name}
        memberName={ctx.member.displayName}
        role={ctx.member.role}
        inboxCount={counts.inbox}
        pipelineCount={counts.pipeline}
      >
        {children}
      </AppShell>
    </div>
  );
}
