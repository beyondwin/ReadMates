import { describe, expect, it } from "vitest";
import { bffSecretFromEnv } from "../../functions/_shared/proxy";
import {
  applyHostClientContractProxyHeader,
  hostClientContractViteBypass,
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
    expect(applyHostClientContractProxyHeader(req)).toBe("forward");
    expect(req.header("X-Readmates-Client-Contract")).toBe("v2");
  });

  it("forwards exact v3 on host mutations without rewriting to v2", () => {
    const req = proxyReq({
      path: "/api/host/notifications/manual",
      contract: "v3",
    });
    expect(applyHostClientContractProxyHeader(req)).toBe("forward");
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
      expect(applyHostClientContractProxyHeader(req)).toBe("forward");
      expect(req.header("X-Readmates-Client-Contract")).toBe("v3");
    }
  });

  it("rejects missing or unknown host-mutation contracts instead of stripping them for the backend", () => {
    const unknown = proxyReq({
      path: "/api/bff/api/host/sessions",
      contract: "attacker-version",
    });
    expect(applyHostClientContractProxyHeader(unknown)).toBe("reject");
    expect(unknown.header("X-Readmates-Client-Contract")).not.toBe("v2");

    const missing = proxyReq({ path: "/api/bff/api/host/sessions" });
    expect(applyHostClientContractProxyHeader(missing)).toBe("reject");
    expect(missing.header("X-Readmates-Client-Contract")).not.toBe("v2");
  });

  it("rejects v3 against V2_ONLY instead of omitting or rewriting to v2", () => {
    const req = proxyReq({
      path: "/api/bff/api/host/members/m-1/approve",
      contract: "v3",
    });
    expect(applyHostClientContractProxyHeader(req, "V2_ONLY")).toBe("reject");
    expect(req.header("X-Readmates-Client-Contract")).not.toBe("v2");
  });

  it("does not forward a contract for non-host mutations", () => {
    const req = proxyReq({
      path: "/api/bff/api/uploads",
      contract: "v3",
    });
    expect(applyHostClientContractProxyHeader(req)).toBe("omit");
    expect(req.header("X-Readmates-Client-Contract")).toBeNull();
  });
});

describe("hostClientContractViteBypass", () => {
  const upgradeRequired = {
    code: "HOST_CLIENT_UPGRADE_REQUIRED",
    message: "호스트 운영 화면을 최신 버전으로 새로고침해 주세요.",
    status: 409,
  };

  function incomingReq(options: { method?: string; url: string; contract?: string }) {
    const headers: Record<string, string> = {};
    if (options.contract !== undefined) {
      headers["x-readmates-client-contract"] = options.contract;
    }
    return {
      method: options.method ?? "POST",
      url: options.url,
      headers,
    };
  }

  function mockRes() {
    let body = "";
    const res = {
      headersSent: false,
      writableEnded: false,
      statusCode: 200,
      headers: {} as Record<string, string>,
      writeHead(status: number, headers?: Record<string, string>) {
        res.statusCode = status;
        res.headers = headers ?? {};
        res.headersSent = true;
        return res;
      },
      end(chunk?: string) {
        res.writableEnded = true;
        if (chunk) {
          body = chunk;
        }
        return res;
      },
      body() {
        return body;
      },
    };
    return res;
  }

  it.each([
    { name: "missing", contract: undefined, capability: undefined },
    { name: "unknown", contract: "attacker-version", capability: undefined },
    { name: "V2_ONLY+v3", contract: "v3", capability: "V2_ONLY" as const },
  ])("fail-closes $name host mutations with the BFF 409 problem body", ({ contract, capability }) => {
    const req = incomingReq({
      url: "/api/bff/api/host/sessions",
      contract,
    });
    const res = mockRes();
    const bypass = hostClientContractViteBypass(req, res, capability);

    expect(res.statusCode).toBe(409);
    expect(res.headers["Content-Type"]).toContain("application/json");
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(res.body())).toEqual(upgradeRequired);
    expect(res.body()).not.toContain('"v2"');
    expect(res.writableEnded).toBe(true);
    expect(typeof bypass).toBe("string");
    expect(bypass).not.toBe(false);
  });

  it("does not intercept allowed v2/v3 host mutations", () => {
    for (const contract of ["v2", "v3"] as const) {
      const req = incomingReq({
        url: "/api/bff/api/host/notifications/manual",
        contract,
      });
      const res = mockRes();
      expect(hostClientContractViteBypass(req, res)).toBeUndefined();
      expect(res.headersSent).toBe(false);
      expect(res.writableEnded).toBe(false);
    }
  });

  it("does not reject non-host mutations or host reads", () => {
    const upload = incomingReq({
      url: "/api/bff/api/uploads",
      contract: "v3",
    });
    const uploadRes = mockRes();
    expect(hostClientContractViteBypass(upload, uploadRes)).toBeUndefined();
    expect(uploadRes.headersSent).toBe(false);

    const hostRead = incomingReq({
      method: "GET",
      url: "/api/bff/api/host/sessions",
    });
    const readRes = mockRes();
    expect(hostClientContractViteBypass(hostRead, readRes)).toBeUndefined();
    expect(readRes.headersSent).toBe(false);
  });
});
