import type { MetadataRoute } from "next";
import { loadSoleOrg } from "@/lib/intake";
import { appUrl } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";

// The application form opens and closes from Settings, so this is answered
// per request rather than frozen at build time.
export const dynamic = "force-dynamic";

/**
 * The public surface is two pages: the landing page, and the club's
 * application form while it is open. A closed form is left out rather than
 * sending crawlers to a "not accepting applications" page.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const org = await loadSoleOrg().catch(() => null);
  const pages: MetadataRoute.Sitemap = [{ url: appUrl("/"), changeFrequency: "monthly", priority: 1 }];
  if (org && orgSettings(org).apply.enabled) {
    pages.push({ url: appUrl("/apply"), changeFrequency: "weekly", priority: 0.8 });
  }
  return pages;
}
