import type { Metadata } from "next";

// The new-member welcome flow is private, like the app it leads into.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function StartLayout({ children }: LayoutProps<"/">) {
  return children;
}
