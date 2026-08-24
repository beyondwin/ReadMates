import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("platform-admin contracts in production mode", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not execute development Zod validation", async () => {
    const { parsePlatformAdminOnboardingResult } = await import(
      "./platform-admin-contracts"
    );
    const wireValue = { server: "trusted production DTO boundary" };
    expect(parsePlatformAdminOnboardingResult(wireValue)).toBe(wireValue);
  });
});
