import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Lighthouse dependency runtime", () => {
  it("loads the Sentry runtime from the Lighthouse package context", async () => {
    const lighthousePackage = createRequire(import.meta.url).resolve("lighthouse/package.json", {
      paths: [resolve(process.cwd())],
    });
    const requireFromLighthouse = createRequire(lighthousePackage);

    const sentry = await import(requireFromLighthouse.resolve("@sentry/node"));

    expect(sentry.init).toBeTypeOf("function");
    expect(sentry.captureException).toBeTypeOf("function");
    expect(sentry.withScope).toBeTypeOf("function");
  });
});
