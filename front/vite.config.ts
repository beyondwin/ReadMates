import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const clubSlugPattern = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

function normalizedClubSlugFromProxyPath(proxyPath: string | undefined) {
  if (!proxyPath) {
    return "";
  }
  const value = new URL(proxyPath, "http://readmates.local").searchParams.get("clubSlug") ?? "";
  const normalized = value.trim().toLowerCase();
  return clubSlugPattern.test(normalized) && !normalized.includes("--") ? normalized : "";
}

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 600,
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
