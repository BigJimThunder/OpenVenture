import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/notify";

/**
 * Every top-level path that belongs to members rather than the public: the
 * signed-in app, onboarding, and the API. `robots.test.ts` fails if a screen
 * is added under `src/app/(app)` without being listed here.
 *
 * `/login` and `/setup` are deliberately absent. They carry a `noindex` tag
 * (see `(auth)/layout.tsx`), and a crawler has to be allowed to fetch a page
 * to see that tag — blocking them here is what gets a bare URL listed.
 */
export const PRIVATE_PATHS = [
  "/api/",
  "/applications",
  "/connect",
  "/docs",
  "/grants",
  "/inbox",
  "/insights",
  "/lab",
  "/meetings",
  "/members",
  "/memos",
  "/my-work",
  "/onboarding",
  "/outcomes",
  "/pipeline",
  "/reports",
  "/schedule",
  "/settings",
  "/start",
  "/welcome",
];

/** The landing page and the club's application form are the public surface. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/apply"], disallow: PRIVATE_PATHS },
    sitemap: appUrl("/sitemap.xml"),
  };
}
