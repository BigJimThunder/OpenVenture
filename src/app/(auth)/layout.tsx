import type { Metadata } from "next";

// Sign-in and first-run setup are for members, not search results. They stay
// crawlable (see robots.ts) precisely so crawlers can read this tag.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return children;
}
