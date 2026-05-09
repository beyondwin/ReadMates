import { describe, expect, it } from "vitest";
import { bffSecretFromEnv } from "../../functions/_shared/proxy";

describe("bffSecretFromEnv", () => {
  it("returns the first non-blank entry from READMATES_BFF_SECRETS", () => {
    expect(bffSecretFromEnv({ READMATES_BFF_SECRETS: "primary,secondary" })).toBe("primary");
  });

  it("skips blank/empty entries and returns the first non-blank from READMATES_BFF_SECRETS", () => {
    expect(bffSecretFromEnv({ READMATES_BFF_SECRETS: ",  ,actual-secret,other" })).toBe("actual-secret");
  });

  it("falls back to READMATES_BFF_SECRET when READMATES_BFF_SECRETS is absent", () => {
    expect(bffSecretFromEnv({ READMATES_BFF_SECRET: "legacy-secret" })).toBe("legacy-secret");
  });

  it("falls back to READMATES_BFF_SECRET when READMATES_BFF_SECRETS is empty", () => {
    expect(
      bffSecretFromEnv({ READMATES_BFF_SECRETS: "", READMATES_BFF_SECRET: "legacy-secret" }),
    ).toBe("legacy-secret");
  });

  it("falls back to READMATES_BFF_SECRET when READMATES_BFF_SECRETS contains only blank entries", () => {
    expect(
      bffSecretFromEnv({ READMATES_BFF_SECRETS: " , , ", READMATES_BFF_SECRET: "legacy-secret" }),
    ).toBe("legacy-secret");
  });

  it("returns null when both READMATES_BFF_SECRETS and READMATES_BFF_SECRET are absent", () => {
    expect(bffSecretFromEnv({})).toBeNull();
  });

  it("returns null when both are empty strings", () => {
    expect(bffSecretFromEnv({ READMATES_BFF_SECRETS: "", READMATES_BFF_SECRET: "" })).toBeNull();
  });

  it("READMATES_BFF_SECRETS takes priority over READMATES_BFF_SECRET when both are set", () => {
    expect(
      bffSecretFromEnv({ READMATES_BFF_SECRETS: "primary", READMATES_BFF_SECRET: "legacy" }),
    ).toBe("primary");
  });
});
