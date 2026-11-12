import type { NextConfig } from "next";

/**
 * Headers every response carries. The Content-Security-Policy is not here: it
 * needs a per-request nonce, so it is set in src/proxy.ts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // The floating dev badge sits on top of the sidebar account menu.
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  async redirects() {
    // /applications was renamed to /pipeline in the board redesign. Slack
    // pings and calendar invites already carry the old links, so keep them
    // resolving permanently rather than 404ing a founder's application.
    return [
      { source: "/applications", destination: "/pipeline", permanent: true },
      { source: "/applications/:id", destination: "/pipeline/:id", permanent: true },
    ];
  },
};

export default nextConfig;
