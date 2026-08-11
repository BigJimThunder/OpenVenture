/**
 * Deterministic website enrichment: fetch the company's homepage and read
 * what the founders already published about themselves — <title>, meta/OG
 * description, favicon. No third-party data providers, ever.
 *
 * parseSiteMeta is a pure function so the parsing is unit-testable without
 * network access; fetchSiteMeta is the thin I/O wrapper around it.
 */

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

/**
 * SSRF guard: this fetch runs server-side against a member-supplied domain.
 * Refuse anything that obviously points inside the deployment's own network.
 * (Cloud metadata IPs, localhost, RFC1918 literals. DNS-rebinding-grade
 * defense is out of scope for a club tool — this blocks the honest mistakes.)
 */
export function assertPublicHost(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Refusing non-http(s) URL: ${url.protocol}`);
  }
  const host = url.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/,
    /\.local$/,
    /\.internal$/,
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./, // link-local / cloud metadata
    /^0\./,
    /^\[?::1\]?$/,
    /^\[?f[cd][0-9a-f]{2}:/, // IPv6 ULA
    /^\[?fe80:/, // IPv6 link-local
  ];
  if (privatePatterns.some((p) => p.test(host))) {
    throw new Error(`Refusing private or local host: ${host}`);
  }
}

export type FetchedSite = { meta: SiteMeta; finalUrl: string };

/** Fetch the homepage for a domain or URL and parse its metadata. */
export async function fetchSiteMeta(domainOrUrl: string): Promise<FetchedSite> {
  const raw = domainOrUrl.trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  assertPublicHost(url);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
    headers: {
      // A browser-like UA — plenty of company sites serve bots an empty shell.
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Site responded ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html")) throw new Error(`Not an HTML page (${contentType || "unknown type"})`);

  // Stream with a byte cap instead of res.text() — don't buffer arbitrary bodies.
  const reader = res.body?.getReader();
  let html = "";
  if (reader) {
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (bytes >= MAX_BYTES) {
        await reader.cancel();
        break;
      }
    }
    html += new TextDecoder("utf-8").decode();
  }

  const finalUrl = res.url || url.toString();
  return { meta: parseSiteMeta(html, finalUrl), finalUrl };
}
