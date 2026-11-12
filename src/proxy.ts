import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy with a per-request nonce.
 *
 * Scripts: only this app's own bundles, admitted by nonce (`strict-dynamic`
 * lets them load their chunks). No inline script without the nonce, no eval
 * in production, no third-party script origin.
 *
 * Everything else is as tight as the product allows:
 *   - images: the annual report shows photos and logos by URL, so https: is
 *     allowed for images only;
 *   - frames: the three video hosts the onboarding track can embed;
 *   - styles: inline `style` attributes are everywhere (charts, drag and
 *     drop, popovers), so 'unsafe-inline' stays for styles.
 *
 * The other security headers are static and live in next.config.ts.
 * Authorization is NOT done here — it lives in every action and loader.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV === "development";
  const https =
    request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    `connect-src 'self'`,
    `frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(https ? [`upgrade-insecure-requests`] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next reads the nonce for its own scripts from this request header.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: API routes return JSON or files, and static assets
      // need no policy of their own.
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|txt|xml|webmanifest)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
