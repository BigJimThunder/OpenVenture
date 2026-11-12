import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AuthFrame } from "./(auth)/auth-frame";

export const metadata: Metadata = { title: "Page not found" };

/**
 * Any URL that matches no route, and `notFound()` from the public pages.
 * (Screens inside the app have their own, which keeps the sidebar.) Whoever
 * lands here may be a founder, a member or a stranger, so the way out is the
 * front page — it already routes each of them to the right place.
 */
export default function NotFound() {
  return (
    <AuthFrame
      title="We couldn't find that page"
      description="The link may be old or mistyped. Nothing is wrong with your account or your data."
      footer="If someone sent you this link, ask them for a fresh one."
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button size="lg" variant="secondary" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </AuthFrame>
  );
}
