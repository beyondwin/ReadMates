import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Cloudflare Pages SPA redirects", () => {
  it("keeps BFF and OAuth functions ahead of the React Router fallback", () => {
    const redirectsPath = path.resolve(process.cwd(), "public/_redirects");

    expect(existsSync(redirectsPath)).toBe(true);

    const lines = readFileSync(redirectsPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const fallbackIndex = lines.indexOf("/* /index.html 200");

    expect(lines).toContain("/api/bff/* /api/bff/:splat 200");
    expect(lines).toContain("/oauth2/authorization/* /oauth2/authorization/:splat 200");
    expect(lines).toContain("/login/oauth2/code/* /login/oauth2/code/:splat 200");
    expect(fallbackIndex).toBeGreaterThan(lines.indexOf("/api/bff/* /api/bff/:splat 200"));
    expect(fallbackIndex).toBeGreaterThan(lines.indexOf("/oauth2/authorization/* /oauth2/authorization/:splat 200"));
    expect(fallbackIndex).toBeGreaterThan(lines.indexOf("/login/oauth2/code/* /login/oauth2/code/:splat 200"));
  });
});
