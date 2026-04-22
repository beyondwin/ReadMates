import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    chunkSizeWarningLimit: 600,
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
