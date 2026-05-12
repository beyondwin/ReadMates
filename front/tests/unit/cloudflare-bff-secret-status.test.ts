import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../functions/api/bff/__internal/secret-status";

type Env = {
  READMATES_BFF_SECRETS?: string;
  READMATES_BFF_SECRET?: string;
  BFF_SECRET_ROTATION_STAGE?: string;
};

function context(env: Env) {
  return {
    request: new Request("https://readmates.pages.dev/api/bff/__internal/secret-status"),
    env,
    params: {},
    waitUntil: () => {},
  } as Parameters<typeof onRequestGet>[0];
}

describe("GET /api/bff/__internal/secret-status", () => {
  it("returns configuredSecretCount=3, rotationStage=stable, and a 6-hex-char fingerprint for multi-secret env", async () => {
    const response = await onRequestGet(
      context({
        READMATES_BFF_SECRETS: "secret-alpha,secret-beta,secret-gamma",
        BFF_SECRET_ROTATION_STAGE: undefined,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await response.json() as {
      configuredSecretCount: number;
      rotationStage: string;
      primarySecretFingerprint: string | null;
    };
    expect(body.configuredSecretCount).toBe(3);
    expect(body.rotationStage).toBe("stable");
    expect(body.primarySecretFingerprint).toMatch(/^[0-9a-f]{6}$/);
  });

  it("returns configuredSecretCount=1 for legacy single-secret env", async () => {
    const response = await onRequestGet(
      context({
        READMATES_BFF_SECRET: "single-legacy-secret",
      }),
    );

    const body = await response.json() as {
      configuredSecretCount: number;
      rotationStage: string;
      primarySecretFingerprint: string | null;
    };
    expect(body.configuredSecretCount).toBe(1);
    expect(body.primarySecretFingerprint).toMatch(/^[0-9a-f]{6}$/);
  });

  it("does not expose the raw secret value anywhere in the response body", async () => {
    const rawSecret = "super-sensitive-bff-secret-value";
    const response = await onRequestGet(
      context({
        READMATES_BFF_SECRETS: rawSecret,
      }),
    );

    const bodyText = await response.text();
    expect(bodyText).not.toContain(rawSecret);
  });

  it("returns configuredSecretCount=0 and null fingerprint when no secrets configured", async () => {
    const response = await onRequestGet(context({}));

    const body = await response.json() as {
      configuredSecretCount: number;
      rotationStage: string;
      primarySecretFingerprint: string | null;
    };
    expect(body.configuredSecretCount).toBe(0);
    expect(body.primarySecretFingerprint).toBeNull();
    expect(body.rotationStage).toBe("stable");
  });

  it("reflects rotationStage=staging when BFF_SECRET_ROTATION_STAGE is staging", async () => {
    const response = await onRequestGet(
      context({
        READMATES_BFF_SECRETS: "primary-secret",
        BFF_SECRET_ROTATION_STAGE: "staging",
      }),
    );

    const body = await response.json() as { rotationStage: string };
    expect(body.rotationStage).toBe("staging");
  });

  it("normalizes unknown BFF_SECRET_ROTATION_STAGE values to stable", async () => {
    const response = await onRequestGet(
      context({
        READMATES_BFF_SECRETS: "primary-secret",
        BFF_SECRET_ROTATION_STAGE: "UNKNOWN_VALUE",
      }),
    );

    const body = await response.json() as { rotationStage: string };
    expect(body.rotationStage).toBe("stable");
  });
});
