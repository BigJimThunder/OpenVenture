import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
