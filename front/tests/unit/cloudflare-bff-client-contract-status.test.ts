import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../functions/api/bff/__internal/client-contract-status";

type Env = {
  READMATES_HOST_CLIENT_CONTRACT_CAPABILITY?: "V2_ONLY" | "V2_V3";
  READMATES_BFF_SECRETS?: string;
  READMATES_BFF_SECRET?: string;
  READMATES_API_BASE_URL?: string;
  BFF_SECRET_ROTATION_STAGE?: string;
};

function context(env: Env = {}) {
  return {
    request: new Request("https://readmates.pages.dev/api/bff/__internal/client-contract-status"),
    env,
    params: {},
    waitUntil: () => {},
  } as Parameters<typeof onRequestGet>[0];
}

describe("GET /api/bff/__internal/client-contract-status", () => {
  it("returns the public-safe V2_V3 allowlist with no-store and no secret metadata", async () => {
    const response = await onRequestGet(
      context({
        READMATES_BFF_SECRETS: "test-bff-secret",
        READMATES_BFF_SECRET: "legacy-secret",
        READMATES_API_BASE_URL: "https://api.example.com",
        BFF_SECRET_ROTATION_STAGE: "staging",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");

    const bodyText = await response.text();
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    expect(body).toEqual({
      schemaVersion: 1,
      supportedHostClientContracts: ["v2", "v3"],
    });
    expect(Object.keys(body)).toEqual(["schemaVersion", "supportedHostClientContracts"]);
    expect(body).not.toHaveProperty("configuredSecretCount");
    expect(body).not.toHaveProperty("rotationStage");
    expect(body).not.toHaveProperty("primarySecretFingerprint");
    expect(bodyText).not.toContain("test-bff-secret");
    expect(bodyText).not.toContain("legacy-secret");
    expect(bodyText).not.toContain("api.example.com");
    expect(bodyText).not.toContain("staging");
    expect(bodyText.toLowerCase()).not.toContain("secret");
    expect(bodyText.toLowerCase()).not.toContain("origin");
    expect(bodyText.toLowerCase()).not.toContain("environment");
    expect(bodyText.toLowerCase()).not.toContain("deployment");
  });

  it("returns the injected v2-only allowlist without exposing config metadata", async () => {
    const response = await onRequestGet(
      context({
        READMATES_HOST_CLIENT_CONTRACT_CAPABILITY: "V2_ONLY",
        READMATES_BFF_SECRETS: "test-bff-secret",
        READMATES_API_BASE_URL: "https://api.example.com",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      schemaVersion: 1,
      supportedHostClientContracts: ["v2"],
    });
    expect(JSON.stringify(body)).not.toContain("v3");
    expect(body).not.toHaveProperty("configuredSecretCount");
    expect(body).not.toHaveProperty("rotationStage");
  });
});
