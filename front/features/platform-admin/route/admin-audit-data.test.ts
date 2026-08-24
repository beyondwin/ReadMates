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
});
