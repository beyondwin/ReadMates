import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import { adminAuditLoaderFactory } from "./admin-audit-data";

vi.mock("@/features/platform-admin/api/platform-admin-audit-api", () => ({ fetchAdminAuditLedger: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchAdminAuditLedger).mockReset().mockResolvedValue({
    generatedAt: "2026-08-25T00:00:00Z",
    filters: {},
    summary: { visibleCount: 0, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
    items: [],
    nextCursor: null,
  });
});

describe("adminAuditLoaderFactory", () => {
  it("accepts valid share-safe filters regardless of URL parameter order", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await expect(adminAuditLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/audit?outcome=FAILED&range=7d&sourceSlice=S5"),
    } as never)).resolves.toBeNull();
    expect(fetchAdminAuditLedger).toHaveBeenCalledWith({ range: "7d", sourceSlice: "S5", outcome: "FAILED" }, undefined);
  });

  it("replace-redirects cursor and sensitive target values out of browser history", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await expect(adminAuditLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/audit?range=7d&cursor=signed&email=private%40example.com"),
    } as never)).rejects.toMatchObject({
      status: 302,
      headers: expect.objectContaining({}),
    });
    try {
      await adminAuditLoaderFactory(client)({
        request: new Request("https://readmates.example/admin/audit?range=7d&cursor=signed&email=private%40example.com"),
      } as never);
    } catch (error) {
      expect((error as Response).headers.get("Location")).toBe("/admin/audit?range=7d");
      expect((error as Response).headers.get("X-Remix-Replace")).toBe("true");
    }
  });

  it("accepts a target query as the initial clubId filter without sending target to the API", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await expect(adminAuditLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/audit?target=club-reading-sai"),
    } as never)).resolves.toBeNull();
    expect(fetchAdminAuditLedger).toHaveBeenCalledWith({ range: "7d", clubId: "club-reading-sai" }, undefined);
  });

  it("accepts a share-safe event id and detail mode without prefetching the sensitive target", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await expect(adminAuditLoaderFactory(client)({
      request: new Request("https://readmates.example/admin/audit?sourceSlice=S6&event=platform_audit_events:event-1&mode=detail"),
    } as never)).resolves.toBeNull();
    expect(fetchAdminAuditLedger).toHaveBeenCalledWith({ range: "7d", sourceSlice: "S6" }, undefined);
  });

  it("replace-redirects an unsafe event, bogus mode, and sensitive target while keeping share-safe filters", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      await adminAuditLoaderFactory(client)({
        request: new Request("https://readmates.example/admin/audit?sourceSlice=S4&event=private.member@example.com&mode=edit&q=secret"),
      } as never);
      throw new Error("expected replace redirect");
    } catch (error) {
      expect((error as Response).headers.get("Location")).toBe("/admin/audit?range=7d&sourceSlice=S4");
      expect((error as Response).headers.get("X-Remix-Replace")).toBe("true");
    }
  });
});
