import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Fetching a URL somebody else chose (a founder's website), from inside the
 * deployment's network, without letting that URL reach anything private.
 *
 * Checking the hostname is not enough: a public name can resolve to a private
 * address, resolve differently a second time (DNS rebinding), or redirect
 * somewhere internal. So the check is made on the address the socket actually
 * connects to (a custom DNS lookup that refuses private results), and again
 * on every redirect hop, which are followed by hand.
 */

function ipv4IsPublic(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return false; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

export function isPublicAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(ip)) return ipv4IsPublic(ip);
  if (!net.isIPv6(ip)) return false;
  // IPv4 carried inside IPv6 (::ffff:a.b.c.d, 64:ff9b::a.b.c.d): judge the IPv4.
  const dotted = ip.match(/(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) return ipv4IsPublic(dotted);
  const mapped = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const hi = parseInt(mapped[1], 16);
    const lo = parseInt(mapped[2], 16);
    return ipv4IsPublic(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === "::" || ip === "::1") return false; // unspecified, loopback
  const first = parseInt(ip.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && /^2001:0?db8:/.test(ip)) return false; // documentation
  return true;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

type Policy = (address: string, hostname: string) => boolean;
type Lookup = typeof dns.lookup;

export type SafeGetOptions = {
  headers?: Record<string, string>;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Tests only: resolve names without the network. */
  lookup?: Lookup;
  /** Tests only: which addresses count as public. */
  policy?: Policy;
};

export type SafeResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  /** The URL the body came from, after redirects. */
  url: string;
};

function assertAllowedUrl(url: URL, policy: Policy) {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeUrlError(`Refusing non-http(s) URL: ${url.protocol}`);
  }
  if (url.username || url.password) throw new UnsafeUrlError("Refusing a URL with credentials in it");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    if (!policy("127.0.0.1", host)) throw new UnsafeUrlError(`Refusing private or local host: ${host}`);
  }
  // A literal address never goes through DNS, so it is checked here.
  if (net.isIP(host) && !policy(host, host)) {
    throw new UnsafeUrlError(`Refusing private or local address: ${host}`);
  }
}

function requestOnce(url: URL, opts: Required<Pick<SafeGetOptions, "maxBytes">> & SafeGetOptions, deadline: number, policy: Policy) {
  return new Promise<SafeResponse>((resolve, reject) => {
    const resolveName = opts.lookup ?? dns.lookup;
    // Runs when the socket connects: whatever the name resolves to *now* is
    // what gets checked, so a second, different DNS answer cannot slip by.
    const guardedLookup = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
      resolveName(hostname, { ...options, all: true }, (err, result) => {
        if (err) return callback(err);
        const addresses = (Array.isArray(result) ? result : [{ address: result, family: 4 }]) as dns.LookupAddress[];
        if (addresses.length === 0) return callback(new Error(`No address for ${hostname}`));
        const blocked = addresses.find((a) => !policy(a.address, hostname));
        if (blocked) return callback(new UnsafeUrlError(`Refusing ${hostname}: it resolves to a private address`));
        if (options.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      });
    }) as unknown as net.LookupFunction;

    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(
      url,
      { method: "GET", headers: opts.headers, lookup: guardedLookup, agent: false, timeout: Math.max(1, deadline - Date.now()) },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, headers: res.headers, body: "", url: url.toString() });
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          chunks.push(chunk);
          if (bytes >= opts.maxBytes) res.destroy(); // enough: a page, not a mirror job
        });
        const finish = () =>
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks).subarray(0, opts.maxBytes).toString("utf8"), url: url.toString() });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("The site took too long to respond")));
    req.on("error", reject);
    req.end();
  });
}

/** GET a public URL. Throws UnsafeUrlError for anything that is not. */
export async function safeGet(input: string | URL, options: SafeGetOptions = {}): Promise<SafeResponse> {
  const policy: Policy = options.policy ?? ((address) => isPublicAddress(address));
  const maxRedirects = options.maxRedirects ?? 4;
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  let url = new URL(input);

  for (let hop = 0; ; hop++) {
    assertAllowedUrl(url, policy);
    if (Date.now() >= deadline) throw new Error("The site took too long to respond");
    const res = await requestOnce(url, { ...options, maxBytes: options.maxBytes ?? 2 * 1024 * 1024 }, deadline, policy);
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.location;
    if (!location) return res;
    if (hop >= maxRedirects) throw new Error("Too many redirects");
    url = new URL(location, url); // …and round again, through every check
  }
}
