import { describe, expect, it, vi } from "vitest";
import { fetchAdminAuditLedger, searchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import {
  platformAdminAuditLedgerInfiniteQuery,
  platformAdminAuditSensitiveInfiniteQuery,
} from "./platform-admin-audit-queries";

vi.mock("@/features/platform-admin/api/platform-admin-audit-api", () => ({
  fetchAdminAuditLedger: vi.fn(),
  searchAdminAuditLedger: vi.fn(),
}));

describe("platform admin audit queries", () => {
  it("pins a normal continuation to the first page's normalized time bounds", async () => {
    const query = platformAdminAuditLedgerInfiniteQuery({ range: "7d", clubId: "club-1" });
    const firstPage = {
      generatedAt: "2026-08-25T00:00:00Z",
      filters: { from: "2026-08-18T00:00:00Z", to: "2026-08-25T00:00:00Z" },
      summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      items: [],
      nextCursor: "signed-cursor",
    };
    const pageParam = query.getNextPageParam?.(firstPage, [firstPage], undefined, [undefined]);

    await query.queryFn?.({ pageParam } as never);

    expect(fetchAdminAuditLedger).toHaveBeenCalledWith(
      {
        range: "7d",
        clubId: "club-1",
        from: "2026-08-18T00:00:00Z",
        to: "2026-08-25T00:00:00Z",
      },
      "signed-cursor",
    );
    expect(JSON.stringify(query.queryKey)).not.toContain("signed-cursor");
  });

  it("uses only an opaque request sequence in the sensitive query key", async () => {
    const query = platformAdminAuditSensitiveInfiniteQuery(
      { range: "7d" },
      { requestSequence: 3, sensitiveTarget: "private@example.com" },
    );
    await query.queryFn?.({ pageParam: undefined } as never);
    expect(searchAdminAuditLedger).toHaveBeenCalledWith({ range: "7d" }, "private@example.com", undefined);
    expect(JSON.stringify(query.queryKey)).toContain("3");
    expect(JSON.stringify(query.queryKey)).not.toContain("private@example.com");
  });

  it("pins a sensitive continuation to the first page's normalized time bounds", async () => {
    const query = platformAdminAuditSensitiveInfiniteQuery(
      { range: "7d" },
      { requestSequence: 4, sensitiveTarget: "private@example.com" },
    );
    const firstPage = {
      generatedAt: "2026-08-25T00:00:00Z",
      filters: { from: "2026-08-18T00:00:00Z", to: "2026-08-25T00:00:00Z" },
      summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      items: [],
      nextCursor: "sensitive-signed-cursor",
    };
    const pageParam = query.getNextPageParam?.(firstPage, [firstPage], undefined, [undefined]);

    await query.queryFn?.({ pageParam } as never);

    expect(searchAdminAuditLedger).toHaveBeenCalledWith(
      { range: "7d", from: "2026-08-18T00:00:00Z", to: "2026-08-25T00:00:00Z" },
      "private@example.com",
      "sensitive-signed-cursor",
    );
  });
});
