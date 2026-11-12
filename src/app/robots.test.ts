import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import robots, { PRIVATE_PATHS } from "./robots";

const appDir = path.dirname(new URL(import.meta.url).pathname);

/** Top-level URL segments owned by a route group, e.g. `(app)` → inbox, pipeline… */
function screens(group: string): string[] {
  return readdirSync(path.join(appDir, group), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `/${entry.name}`);
}

describe("robots.txt", () => {
  it("disallows every signed-in screen, so a new one can't be left crawlable", () => {
    for (const screen of [...screens("(app)"), ...screens("(start)")]) {
      expect(PRIVATE_PATHS, `${screen} is missing from PRIVATE_PATHS in robots.ts`).toContain(screen);
    }
  });

  it("keeps the API out and the public pages in", () => {
    const { rules, sitemap } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.disallow).toContain("/api/");
    expect(rule.allow).toEqual(["/", "/apply", "/privacy"]);
    expect(rule.disallow).toContain("/unsubscribe");
    expect(rule.disallow).not.toContain("/apply");
    expect(sitemap).toMatch(/\/sitemap\.xml$/);
  });

  it("leaves sign-in crawlable so its noindex tag can be read", () => {
    for (const screen of screens("(auth)")) expect(PRIVATE_PATHS).not.toContain(screen);
  });
});
