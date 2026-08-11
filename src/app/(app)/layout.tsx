import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/actions/context";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { GlobalShortcuts } from "@/components/shell/global-shortcuts";

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

  return (
    <div className="flex h-svh overflow-hidden print:block print:h-auto print:overflow-visible">
      <GlobalShortcuts />
      <div className="contents print:hidden">
        <Sidebar orgName={ctx.org.name} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <div className="contents print:hidden">
          <Topbar memberName={ctx.member.displayName} role={ctx.member.role} />
        </div>
        <main className="flex-1 overflow-y-auto print:overflow-visible">{children}</main>
      </div>
    </div>
  );
}
