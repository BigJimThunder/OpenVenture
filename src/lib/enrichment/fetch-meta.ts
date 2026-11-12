/**
 * Deterministic website enrichment: fetch the company's homepage and read
 * what the founders already published about themselves — <title>, meta/OG
 * description, favicon. No third-party data providers, ever.
 *
 * parseSiteMeta is a pure function so the parsing is unit-testable without
 * network access; fetchSiteMeta is the thin I/O wrapper around it.
 */

import { safeGet } from "@/lib/safe-fetch";

export type SiteMeta = {
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  /** Visible page text, whitespace-collapsed and capped — input for the optional LLM pass. */
  textExcerpt: string | null;
};

const MAX_BYTES = 2 * 1024 * 1024; // 2MB cap — a homepage, not a mirror job
const FETCH_TIMEOUT_MS = 10_000;
const EXCERPT_CHARS = 4_000;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? m);
}

function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  const out = decodeEntities(s).replace(/\s+/g, " ").trim();
  return out.length > 0 ? out : null;
}

/** Extract one attribute value from a single tag string, any attribute order. */
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? null) : null;
}

function findMeta(html: string, key: string): string | null {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const id = attr(tag, "property") ?? attr(tag, "name");
    if (id?.toLowerCase() === key) {
      const content = clean(attr(tag, "content"));
      if (content) return content;
    }
  }
  return null;
}

function findFavicon(html: string, baseUrl: string): string | null {
  let best: { href: string; score: number } | null = null;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    const href = attr(tag, "href");
    if (!href) continue;
    // Prefer big touch icons over 16px favicons.
    const score = rel.includes("apple-touch-icon")
      ? 3
      : rel === "icon" || rel.includes("shortcut")
        ? 2
        : 0;
    if (score > 0 && (!best || score > best.score)) best = { href, score };
  }
  try {
    const href = best?.href ?? "/favicon.ico";
    const resolved = new URL(decodeEntities(href), baseUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function visibleText(html: string): string | null {
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return clean(stripped.slice(0, EXCERPT_CHARS * 4))?.slice(0, EXCERPT_CHARS) ?? null;
}

export function parseSiteMeta(html: string, baseUrl: string): SiteMeta {
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: findMeta(html, "og:title") ?? clean(titleTag),
    description: findMeta(html, "og:description") ?? findMeta(html, "description"),
    faviconUrl: findFavicon(html, baseUrl),
    textExcerpt: visibleText(html),
  };
}

export type FetchedSite = { meta: SiteMeta; finalUrl: string };

/**
 * Fetch the homepage for a domain or URL and parse its metadata. The address
 * is founder-supplied, so the request goes through `safeGet`, which refuses
 * anything that resolves or redirects to a private network.
 */
export async function fetchSiteMeta(domainOrUrl: string): Promise<FetchedSite> {
  const raw = domainOrUrl.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

  const res = await safeGet(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    headers: {
      // A browser-like UA — plenty of company sites serve bots an empty shell.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
      "accept-encoding": "identity",
    },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`Site responded ${res.status}`);
  const contentType = String(res.headers["content-type"] ?? "");
  if (!contentType.includes("html")) throw new Error(`Not an HTML page (${contentType || "unknown type"})`);

  return { meta: parseSiteMeta(res.body, res.url), finalUrl: res.url };
}
