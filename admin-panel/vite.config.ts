import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react()],

    resolve: {
      // Mirrors "paths" in tsconfig.app.json — keep the two in step.
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },

    server: {
      port: 5174,
      /*
       * The API is proxied rather than called cross-origin so that the browser
       * treats it as same-origin in development. That keeps CORS out of the
       * local loop entirely, and means VITE_API_BASE_URL can stay a relative
       * "/api/v1" in every environment.
       */
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:4000",
          changeOrigin: true,
        },
      },
    },

    build: {
      outDir: "dist",
      sourcemap: mode !== "production",
      /*
       * Chunking is left to Vite. Every screen is already a lazy route, so the
       * split that matters is route-level and happens on its own; hand-tuning
       * vendor chunks on top of that is guesswork until there is a bundle
       * report saying otherwise.
       */
    },
  };
});
