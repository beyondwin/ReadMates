import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { normalizedClubSlug } from "./shared/security/club-slug";

function normalizedClubSlugFromProxyPath(proxyPath: string | undefined) {
  if (!proxyPath) {
    return "";
  }
  return normalizedClubSlug(new URL(proxyPath, "http://readmates.local").searchParams.get("clubSlug"));
}

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 350,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "vendor",
              test: /node_modules/,
            },
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      "/api/bff": {
        target: process.env.READMATES_API_BASE_URL ?? "http://127.0.0.1:18080",
        changeOrigin: true,
        secure: false,
        headers: {
          ...(process.env.READMATES_BFF_SECRET
            ? { "X-Readmates-Bff-Secret": process.env.READMATES_BFF_SECRET }
            : {}),
        },
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.removeHeader("X-Readmates-Club-Slug");
            proxyReq.removeHeader("X-Readmates-Club-Host");
            const clubSlug = normalizedClubSlugFromProxyPath(proxyReq.path);
            if (clubSlug) {
              proxyReq.setHeader("X-Readmates-Club-Slug", clubSlug);
            }
          });
        },
        rewrite: (proxyPath) => proxyPath.replace(/^\/api\/bff/, ""),
      },
      "/oauth2/authorization": {
        target: process.env.READMATES_API_BASE_URL ?? "http://127.0.0.1:18080",
        changeOrigin: true,
        secure: false,
        xfwd: true,
      },
      "/login/oauth2/code": {
        target: process.env.READMATES_API_BASE_URL ?? "http://127.0.0.1:18080",
        changeOrigin: true,
        secure: false,
        xfwd: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
