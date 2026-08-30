import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetHostClientContractCapabilityForTest } from "@/shared/api/host-client-contract";
import {
  HostWorkboxPageSchema,
  type HostWorkItemType,
  type HostWorkboxPage,
  parseHostWorkboxPage,
} from "./host-workbox-contracts";
import {
  deferHostWorkboxItem,
  fetchHostWorkboxPage,
  removeHostWorkboxDeferral,
} from "./host-workbox-api";

const TYPES = [
  "SCHEDULE_UNSEEN",
  "MEMBER_APPROVAL",
  "RECORD_CLOSING",
  "INVITATION_EXPIRY",
  "NOTIFICATION_FAILURE",
] as const satisfies readonly HostWorkItemType[];

const FAILURE_CODES = {
  SCHEDULE_UNSEEN: "SCHEDULE_SOURCE_UNAVAILABLE",
  MEMBER_APPROVAL: "MEMBER_SOURCE_UNAVAILABLE",
  RECORD_CLOSING: "RECORD_SOURCE_UNAVAILABLE",
  INVITATION_EXPIRY: "INVITATION_SOURCE_UNAVAILABLE",
  NOTIFICATION_FAILURE: "NOTIFICATION_SOURCE_UNAVAILABLE",
} as const;

function item(type: HostWorkItemType, state: HostWorkboxPage["state"] = "NOW") {
  return {
    key: `${type}:resource-1:g1`,
    type,
    state,
    title: "작업 제목",
    description: "작업 설명",
    count: 0,
    dueAt: null,
    deferredUntil: state === "DEFERRED" ? "2026-08-31T10:00:00Z" : null,
    resolvedAt: state === "COMPLETED" ? "2026-08-30T10:00:00Z" : null,
    destinationHref: "/app/host/work/resource-1",
    receiptSummary: state === "COMPLETED"
      ? { operation: "REVIEW", outcome: "DONE", affectedCount: 0 }
      : null,
  };
}

function page(state: HostWorkboxPage["state"] = "NOW") {
  return {
    state,
    evaluatedAt: "2026-08-30T09:00:00Z",
    sourceAvailability: TYPES.map((type) => ({
      type,
      state: "AVAILABLE" as const,
      failureCode: null,
    })),
    items: TYPES.map((type) => item(type, state)),
    nextCursor: null,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function capabilityResponse() {
  return new Response(JSON.stringify({
    schemaVersion: 1,
    supportedHostClientContracts: ["v2", "v3"],
  }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    },
  });
}

afterEach(() => {
  __resetHostClientContractCapabilityForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host workbox wire contract", () => {
  it.each(["NOW", "DEFERRED", "COMPLETED"] as const)(
    "accepts the complete five-source %s page while preserving zero and nullable fields",
    (state) => {
      const parsed = parseHostWorkboxPage(page(state));

      expect(parsed.state).toBe(state);
      expect(parsed.items).toHaveLength(5);
      expect(parsed.items.every(({ count }) => count === 0)).toBe(true);
      expect(parsed.nextCursor).toBeNull();
    },
  );

  it("accepts only the source-specific partial failure code and an opaque non-empty cursor", () => {
    const partial = page();
    partial.sourceAvailability = TYPES.map((type) => type === "RECORD_CLOSING"
      ? { type, state: "UNAVAILABLE" as const, failureCode: FAILURE_CODES[type] }
      : { type, state: "AVAILABLE" as const, failureCode: null });
    partial.nextCursor = "opaque.cursor+/=";

    expect(parseHostWorkboxPage(partial).sourceAvailability[2]).toEqual({
      type: "RECORD_CLOSING",
      state: "UNAVAILABLE",
      failureCode: "RECORD_SOURCE_UNAVAILABLE",
    });
    expect(parseHostWorkboxPage(partial).nextCursor).toBe("opaque.cursor+/=");
    expect(() => parseHostWorkboxPage({
      ...partial,
      sourceAvailability: partial.sourceAvailability.map((entry) => entry.type === "RECORD_CLOSING"
        ? { ...entry, failureCode: "SCHEDULE_SOURCE_UNAVAILABLE" }
        : entry),
    })).toThrow();
  });

  it("rejects incomplete or duplicate source inventories", () => {
    const valid = page();
    expect(() => parseHostWorkboxPage({
      ...valid,
      sourceAvailability: valid.sourceAvailability.slice(0, 4),
    })).toThrow();
    expect(() => parseHostWorkboxPage({
      ...valid,
      sourceAvailability: [...valid.sourceAvailability.slice(0, 4), valid.sourceAvailability[0]],
    })).toThrow();
  });

  it("rejects page-state drift, inconsistent lifecycle timestamps, and unsafe destinations", () => {
    const valid = page("NOW");
    expect(() => parseHostWorkboxPage({
      ...valid,
      items: [{ ...valid.items[0], state: "DEFERRED", deferredUntil: "2026-08-31T10:00:00Z" }],
    })).toThrow();
    expect(() => parseHostWorkboxPage({
      ...valid,
      items: [{ ...valid.items[0], deferredUntil: "2026-08-31T10:00:00Z" }],
    })).toThrow();
    expect(() => parseHostWorkboxPage({
      ...valid,
      items: [{ ...valid.items[0], destinationHref: "https://private.example.test/app/host" }],
    })).toThrow();
    expect(() => parseHostWorkboxPage({
      ...valid,
      items: [{ ...valid.items[0], destinationHref: "/app/../private" }],
    })).toThrow();
  });

  it("rejects private or unknown keys recursively and invalid numeric/cursor values", () => {
    const valid = page("COMPLETED");
    expect(() => HostWorkboxPageSchema.parse({ ...valid, userId: "private-user" })).toThrow();
    expect(() => HostWorkboxPageSchema.parse({
      ...valid,
      sourceAvailability: valid.sourceAvailability.map((entry, index) => index === 0
        ? { ...entry, providerBody: "private" }
        : entry),
    })).toThrow();
    expect(() => HostWorkboxPageSchema.parse({
      ...valid,
      items: [{ ...valid.items[0], email: "private@example.test" }],
    })).toThrow();
    expect(() => HostWorkboxPageSchema.parse({
      ...valid,
      items: [{
        ...valid.items[0],
        receiptSummary: { ...valid.items[0].receiptSummary, token: "private" },
      }],
    })).toThrow();
    expect(() => HostWorkboxPageSchema.parse({
      ...valid,
      items: [{ ...valid.items[0], count: -1 }],
    })).toThrow();
    expect(() => HostWorkboxPageSchema.parse({ ...valid, nextCursor: "" })).toThrow();
    expect(() => HostWorkboxPageSchema.parse({ ...valid, nextCursor: "   " })).toThrow();
  });
});

describe("host workbox API", () => {
  it("preserves state, limit, opaque cursor, and club context in the exact GET route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page("DEFERRED")));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostWorkboxPage(
      { state: "DEFERRED", limit: 20, cursor: "cursor+/=" },
      { clubSlug: "reading-sai" },
    )).resolves.toEqual(page("DEFERRED"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/workbox?state=DEFERRED&limit=20&cursor=cursor%2B%2F%3D&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("preserves every byte of a nonblank opaque cursor without trimming it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page("NOW")));
    vi.stubGlobal("fetch", fetchMock);

    await fetchHostWorkboxPage(
      { state: "NOW", limit: 20, cursor: "  cursor+/=  " },
      { clubSlug: "reading-sai" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/workbox?state=NOW&limit=20&cursor=++cursor%2B%2F%3D++&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it.each(["", "   ", "\t\n"])(
    "rejects blank request cursor %j before any network request",
    (cursor) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      expect(() => fetchHostWorkboxPage(
        { state: "NOW", limit: 20, cursor },
        { clubSlug: "reading-sai" },
      )).toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("URL-encodes the authoritative key once and parses the PUT receipt", async () => {
    const receipt = {
      key: "SCHEDULE_UNSEEN:session/1:r7",
      deferredUntil: "2026-08-31T09:00:00Z",
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status") ? capabilityResponse() : jsonResponse(receipt),
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deferHostWorkboxItem(
      receipt.key,
      { deferredUntil: receipt.deferredUntil },
      { clubSlug: "reading-sai" },
    )).resolves.toEqual(receipt);

    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/bff/api/host/workbox/items/SCHEDULE_UNSEEN%3Asession%2F1%3Ar7/deferral?clubSlug=reading-sai",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ deferredUntil: receipt.deferredUntil }),
      }),
    );
  });

  it("handles DELETE 204 without attempting to parse an absent body", async () => {
    const empty = new Response(null, { status: 204 });
    const jsonSpy = vi.spyOn(empty, "json");
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status") ? capabilityResponse() : empty,
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(removeHostWorkboxDeferral(
      "MEMBER_APPROVAL:member+1:g2",
      { clubSlug: "reading-sai" },
    )).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/bff/api/host/workbox/items/MEMBER_APPROVAL%3Amember%2B1%3Ag2/deferral?clubSlug=reading-sai",
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("rejects malformed GET and PUT JSON before exposing it", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ...page(), email: "private@example.test" }))
      .mockResolvedValueOnce(capabilityResponse())
      .mockResolvedValueOnce(jsonResponse({ key: "bad", deferredUntil: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostWorkboxPage(
      { state: "NOW", limit: 20 },
      { clubSlug: "reading-sai" },
    )).rejects.toThrow();
    await expect(deferHostWorkboxItem(
      "SCHEDULE_UNSEEN:session-1:r7",
      { deferredUntil: "2026-08-31T09:00:00Z" },
      { clubSlug: "reading-sai" },
    )).rejects.toThrow();
  });
});
