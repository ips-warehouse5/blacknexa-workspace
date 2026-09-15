import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
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
};

export default nextConfig;
