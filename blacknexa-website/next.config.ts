import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  // `next dev` rejects dev assets (JS chunks, HMR) requested from any host
  // but localhost, so over an ngrok tunnel the page renders but never
  // hydrates — theme toggle, forms and the hero video switch all go dead.
  // Wildcards because the free tunnel URL changes on every restart.
  // Dev-only; production builds ignore this.
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  images: {
    // Required so the image optimizer accepts our content-hash cache-busting
    // query string (?v=<hash>, see src/lib/asset-version.ts) on local
    // /public images — Next.js otherwise rejects any local image `src` that
    // has a search string unless the exact pathname is allowlisted here.
    // `search` is intentionally omitted (allows any query value) since the
    // hash changes per file/per deploy and can't be pinned to one exact
    // string; the pathname restriction still limits this to our own asset
    // folder, not arbitrary paths.
    localPatterns: [{ pathname: "/images/blacknexa/**" }],
  },
  async redirects() {
    // Marketing videos and the client brief use /waitlist.html; the query
    // string (?ref=CODE) is carried over by Next automatically.
    return [{ source: "/waitlist.html", destination: "/waitlist", permanent: true }];
  },
};

export default nextConfig;
