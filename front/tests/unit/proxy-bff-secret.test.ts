import { describe, expect, it } from "vitest";
import { bffSecretFromEnv } from "../../functions/_shared/proxy";
import {
  applyHostClientContractProxyHeader,
  normalizeHostClientContract,
} from "../../shared/security/host-client-contract";

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

describe("normalizeHostClientContract", () => {
  it.each([
    ["v2", "v2"],
    ["v3", "v3"],
    [null, null],
    ["", null],
    ["v2 ", null],
    ["V2", null],
    ["V3", null],
    ["v1", null],
    ["attacker-version", null],
  ] as const)("maps %j to %j", (value, expected) => {
    expect(normalizeHostClientContract(value)).toBe(expected);
  });
});

describe("applyHostClientContractProxyHeader", () => {
  function proxyReq(options: {
    method?: string;
    path: string;
    contract?: string | string[];
  }) {
    const headers = new Map<string, string | string[]>();
    if (options.contract !== undefined) {
      headers.set("X-Readmates-Client-Contract", options.contract);
    }
    return {
      method: options.method ?? "POST",
      path: options.path,
      getHeader(name: string) {
        return headers.get(name);
      },
      removeHeader(name: string) {
        headers.delete(name);
      },
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
      header(name: string) {
        const value = headers.get(name);
        return typeof value === "string" ? value : null;
      },
    };
  }

  it("forwards exact v2 on host mutations", () => {
    const req = proxyReq({
      path: "/api/bff/api/host/sessions",
      contract: "v2",
    });
    applyHostClientContractProxyHeader(req);
    expect(req.header("X-Readmates-Client-Contract")).toBe("v2");
  });

  it("forwards exact v3 on host mutations without rewriting to v2", () => {
    const req = proxyReq({
      path: "/api/host/notifications/manual",
      contract: "v3",
    });
    applyHostClientContractProxyHeader(req);
    expect(req.header("X-Readmates-Client-Contract")).toBe("v3");
    expect(req.header("X-Readmates-Client-Contract")).not.toBe("v2");
  });

  it("forwards v3 for PUT/PATCH/DELETE host paths", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const req = proxyReq({
        method,
        path: "/api/bff/api/host/clubs/my-club/ai-defaults",
        contract: "v3",
      });
      applyHostClientContractProxyHeader(req);
      expect(req.header("X-Readmates-Client-Contract")).toBe("v3");
    }
  });

  it("does not rewrite unknown or missing contracts to v2", () => {
    const unknown = proxyReq({
      path: "/api/bff/api/host/sessions",
      contract: "attacker-version",
    });
    applyHostClientContractProxyHeader(unknown);
    expect(unknown.header("X-Readmates-Client-Contract")).toBeNull();

    const missing = proxyReq({ path: "/api/bff/api/host/sessions" });
    applyHostClientContractProxyHeader(missing);
    expect(missing.header("X-Readmates-Client-Contract")).toBeNull();
  });

  it("rejects v3 against V2_ONLY by omitting the header instead of downgrading", () => {
    const req = proxyReq({
      path: "/api/bff/api/host/members/m-1/approve",
      contract: "v3",
    });
    applyHostClientContractProxyHeader(req, "V2_ONLY");
    expect(req.header("X-Readmates-Client-Contract")).toBeNull();
  });

  it("does not forward a contract for non-host mutations", () => {
    const req = proxyReq({
      path: "/api/bff/api/uploads",
      contract: "v3",
    });
    applyHostClientContractProxyHeader(req);
    expect(req.header("X-Readmates-Client-Contract")).toBeNull();
  });
});
