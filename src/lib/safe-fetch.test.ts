import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isPublicAddress, safeGet, UnsafeUrlError } from "./safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::10.0.0.1", "[::1]",
    "not-an-ip", "",
  ])("%s is not public", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.63.255.255", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "%s is public",
    (ip) => expect(isPublicAddress(ip)).toBe(true)
  );
});

describe("safeGet", () => {
  let server: http.Server;
  let port: number;
  const hits: string[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url ?? "");
      if (req.url === "/hop") return void res.writeHead(302, { location: `http://127.0.0.1:${port}/secret` }).end();
      if (req.url === "/loop") return void res.writeHead(302, { location: "/loop" }).end();
      if (req.url === "/big") return void res.writeHead(200, { "content-type": "text/html" }).end("x".repeat(50_000));
      res.writeHead(200, { "content-type": "text/html" }).end("<title>hello</title>");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => void server.close(() => resolve())));

  // "site.test" is a public name that points at our local server.
  const lookup = ((_host: string, _opts: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
    cb(null, [{ address: "127.0.0.1", family: 4 }])) as never;
  const trustSite = (_address: string, hostname: string) => hostname === "site.test";

  it("refuses literal private addresses, localhost, odd schemes and credentials — before connecting", async () => {
    hits.length = 0;
    for (const url of [
      `http://127.0.0.1:${port}/`, `http://[::1]:${port}/`, `http://localhost:${port}/`, "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.5/", "https://192.168.1.1/", "https://172.16.0.9/", "https://router.local/", "https://db.internal/",
      "file:///etc/passwd", "ftp://example.com/", `http://user:pass@127.0.0.1:${port}/`,
    ]) {
      await expect(safeGet(url)).rejects.toBeInstanceOf(UnsafeUrlError);
    }
    expect(hits).toEqual([]);
  });

  it("refuses a public-looking name that resolves to a private address", async () => {
    hits.length = 0;
    await expect(safeGet(`http://innocent.example:${port}/`, { lookup })).rejects.toThrow(/private address/);
    expect(hits).toEqual([]);
  });

  it("fetches an allowed site", async () => {
    const res = await safeGet(`http://site.test:${port}/`, { lookup, policy: trustSite });
    expect(res.status).toBe(200);
    expect(res.body).toContain("<title>hello</title>");
  });

  it("re-checks every redirect: an allowed site cannot bounce the request inside", async () => {
    hits.length = 0;
    await expect(safeGet(`http://site.test:${port}/hop`, { lookup, policy: trustSite })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toEqual(["/hop"]); // /secret was never requested
  });

  it("stops at the redirect limit and at the byte cap", async () => {
    await expect(safeGet(`http://site.test:${port}/loop`, { lookup, policy: trustSite, maxRedirects: 2 })).rejects.toThrow(/Too many redirects/);
    const big = await safeGet(`http://site.test:${port}/big`, { lookup, policy: trustSite, maxBytes: 1000 });
    expect(big.body.length).toBe(1000);
  });
});
