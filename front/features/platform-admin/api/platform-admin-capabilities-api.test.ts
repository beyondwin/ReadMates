import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformAdminCapabilitiesParseError } from "@/features/platform-admin/model/platform-admin-capabilities";
import { fetchPlatformAdminCapabilities } from "./platform-admin-capabilities-api";

const validPayload = {
  schemaVersion: 1,
  role: "OPERATOR",
  status: "ACTIVE",
  capabilities: ["VIEW_TODAY", "VIEW_CLUBS", "CREATE_CLUB"],
  generatedAt: "2026-08-22T00:00:00Z",
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

function successfulFetch(body: unknown) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body));
}

describe("fetchPlatformAdminCapabilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the capabilities projection through the BFF without a club slug", async () => {
    const fetchSpy = successfulFetch(validPayload);

    await expect(fetchPlatformAdminCapabilities()).resolves.toEqual(validPayload);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/bff/api/admin/capabilities");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store" });
  });

  it("rejects an unknown schema through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, schemaVersion: 2 });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });

  it("rejects an unknown role through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, role: "ADMIN" });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });

  it("rejects a non-ACTIVE status through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, status: "SUSPENDED" });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });

  it("rejects an unknown capability through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, capabilities: ["VIEW_TODAY", "SHUTDOWN_PLATFORM"] });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });

  it("rejects duplicate capabilities through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, capabilities: ["VIEW_TODAY", "VIEW_TODAY"] });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });

  it("rejects an invalid timestamp through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, generatedAt: "2026/08/22 00:00:00" });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });

  it("rejects a non-array capabilities payload through the fetch wrapper", async () => {
    successfulFetch({ ...validPayload, capabilities: { 0: "VIEW_TODAY" } });

    await expect(fetchPlatformAdminCapabilities()).rejects.toBeInstanceOf(PlatformAdminCapabilitiesParseError);
  });
});
