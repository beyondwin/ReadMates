import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import { adminAuditLoaderFactory, buildAdminAuditProcessingView } from "./admin-audit-data";

vi.mock("@/shared/auth/platform-admin-loader", () => ({
  requirePlatformAdminLoaderAuth: vi.fn(async () => ({
    authenticated: true,
    platformAdmin: { role: "OPERATOR" },
  })),
}));

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

  it("maps ledger page, filters, and selection onto the processing-records view", () => {
    const page = {
      generatedAt: "2026-08-25T00:00:00Z",
      filters: {},
      summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
      nextCursor: null,
      items: [{
        id: "platform_audit_events:event-1",
        occurredAt: "2026-05-27T00:01:00Z",
        sourceSlice: "S5" as const,
        sourceTable: "platform_audit_events",
        actionCategory: "NOTIFICATION" as const,
        actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
        outcome: "SUCCESS" as const,
        actor: { userId: "admin-1", role: "OPERATOR" as const, displayLabel: "OPERATOR" },
        target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
        summary: "알림 재처리가 확정되었습니다.",
        safeMetadata: [
          { label: "처리한 이유", value: "전달 지연을 확인했습니다.", kind: "text" },
          { label: "영향 범위", value: "클럽 2곳", kind: "text" },
        ],
        metadataState: "AVAILABLE" as const,
      }],
    };
    const view = buildAdminAuditProcessingView(page, { range: "24h" }, page.items[0].id);
    expect(view.periodId).toBe("today");
    expect(view.periodLabel).toBe("오늘");
    expect(view.rows[0]).toMatchObject({
      id: page.items[0].id,
      title: "알림 다시 보내기 완료",
      actor: "운영자",
      status: "정상",
    });
    expect(view.rows[0]?.clock).toMatch(/^\d{2}:\d{2}$/);
    expect(view.selected?.sections.map((section) => section.heading)).toEqual([
      "처리한 이유",
      "영향 범위",
      "변경 전",
      "변경 후",
      "처리 결과",
    ]);
    expect(view.selected?.sections[0]?.body).toBe("전달 지연을 확인했습니다.");
  });
});
