import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAuditLedger, searchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import type { AdminAuditLedgerItem, AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import { platformAdminAuditKeys } from "@/features/platform-admin/queries/platform-admin-audit-queries";
import { platformAdminKeys } from "@/features/platform-admin/queries/platform-admin-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminAuditRoute } from "./admin-audit-route";

vi.mock("@/features/platform-admin/api/platform-admin-audit-api", () => ({
  fetchAdminAuditLedger: vi.fn(),
  searchAdminAuditLedger: vi.fn(),
}));

function item(id: string, summary = id): AdminAuditLedgerItem {
  return {
    id,
    occurredAt: "2026-08-25T00:00:00Z",
    sourceSlice: "S6",
    sourceTable: "platform_audit_events",
    actionCategory: "AI_OPS",
    actionType: "ADMIN_AI_OPS_RETRY_COMMIT",
    outcome: "SUCCESS",
    actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
    target: { clubId: "club-1", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
    summary,
    safeMetadata: [],
    metadataState: "AVAILABLE",
  };
}

function page(items: AdminAuditLedgerItem[], nextCursor: string | null, unavailableSources: string[] = []): AdminAuditLedgerPage {
  return {
    generatedAt: "2026-08-25T00:00:00Z",
    filters: { from: "2026-08-18T00:00:00Z", to: "2026-08-25T00:00:00Z" },
    summary: {
      visibleCount: items.length,
      sourceUnavailableCount: unavailableSources.length,
      metadataUnavailableCount: 0,
      unavailableSources,
    },
    items,
    nextCursor,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

function renderRoute(initialEntry = "/admin/audit?sourceSlice=S6") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminKeys.capabilities(), {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities: ["VIEW_AUDIT", "VIEW_SENSITIVE_AUDIT"],
    generatedAt: "2026-08-25T00:00:00Z",
  });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminAuditRoute />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...rendered, queryClient };
}

beforeEach(() => {
  vi.mocked(fetchAdminAuditLedger).mockReset().mockResolvedValue(page([item("event-1", "첫 이벤트")], null));
  vi.mocked(searchAdminAuditLedger).mockReset().mockResolvedValue(page([item("private-hit", "검색 결과")], null));
});

describe("AdminAuditRoute", () => {
  it("loads additional pages, deduplicates their boundary, and keeps the selected row", async () => {
    vi.mocked(fetchAdminAuditLedger)
      .mockResolvedValueOnce(page([item("event-1", "첫 이벤트"), item("boundary", "경계 이벤트")], "cursor-1", ["source-a"]))
      .mockResolvedValueOnce(page([item("boundary", "경계 이벤트"), item("event-2", "다음 이벤트")], null, ["source-a"]));
    const user = userEvent.setup();
    const { container } = renderRoute();

    await user.click(await screen.findByRole("button", { name: /경계 이벤트/ }));
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    await screen.findByRole("button", { name: /다음 이벤트/ });
    expect(screen.getAllByRole("button", { name: /경계 이벤트/ })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "감사 이벤트 상세" })).toHaveTextContent("경계 이벤트");
    expect(screen.getByLabelText("location")).toHaveTextContent("event=boundary");
    expect(screen.getByLabelText("location")).toHaveTextContent("mode=detail");
    expect(fetchAdminAuditLedger).toHaveBeenLastCalledWith(
      {
        range: "7d",
        sourceSlice: "S6",
        from: "2026-08-18T00:00:00Z",
        to: "2026-08-25T00:00:00Z",
      },
      "cursor-1",
    );
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("keeps sensitive search out of URL and every query key", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderRoute();
    const input = await screen.findByRole("searchbox", { name: "민감 대상 검색" });
    await user.type(input, "private.member@example.com");
    await user.click(screen.getByRole("button", { name: "대상 검색" }));

    await screen.findByRole("button", { name: /검색 결과/ });
    expect(searchAdminAuditLedger).toHaveBeenCalledWith(
      { range: "7d", sourceSlice: "S6" },
      "private.member@example.com",
      undefined,
    );
    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/audit?sourceSlice=S6");
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.queryKey))).not.toContain(
      "private.member@example.com",
    );
  });

  it("purges sensitive input, selection, and cached pages when the capability is lost", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderRoute();
    await user.type(await screen.findByRole("searchbox", { name: "민감 대상 검색" }), "private@example.com");
    await user.click(screen.getByRole("button", { name: "대상 검색" }));
    await screen.findByRole("button", { name: /검색 결과/ });

    act(() => {
      queryClient.setQueryData(platformAdminKeys.capabilities(), {
        schemaVersion: 1,
        role: "OPERATOR",
        status: "ACTIVE",
        capabilities: ["VIEW_AUDIT"],
        generatedAt: "2026-08-25T00:01:00Z",
      });
    });

    await waitFor(() => expect(screen.queryByRole("searchbox", { name: "민감 대상 검색" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /검색 결과/ })).not.toBeInTheDocument();
    const sensitiveCache = queryClient.getQueriesData({ queryKey: [...platformAdminAuditKeys.all, "sensitive"] });
    expect(JSON.stringify(sensitiveCache)).not.toContain("private@example.com");
    expect(sensitiveCache.every(([key]) => (key as readonly unknown[]).at(-1) === 0)).toBe(true);
    expect(screen.getByLabelText("location")).not.toHaveTextContent("private@example.com");
  });

  it("opens detail from a share-safe event URL and restores row focus when detail closes", async () => {
    const user = userEvent.setup();
    renderRoute("/admin/audit?sourceSlice=S6&event=event-1&mode=detail");

    expect(await screen.findByRole("button", { name: /첫 이벤트/ })).toHaveAttribute("aria-pressed", "true");
    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(detail).toHaveTextContent("첫 이벤트");
    expect(document.querySelector(".admin-audit__body")).toHaveAttribute("data-detail-open", "true");

    await user.click(screen.getByRole("button", { name: "목록으로" }));

    expect(screen.getByLabelText("location")).toHaveTextContent("event=event-1");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("mode=detail");
    expect(screen.getByRole("button", { name: /첫 이벤트/ })).toHaveFocus();
    expect(document.querySelector(".admin-audit__body")).toHaveAttribute("data-detail-open", "false");
  });

  it("does not put a sensitive target into the event URL or query key after a row is selected", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderRoute();
    await user.type(await screen.findByRole("searchbox", { name: "민감 대상 검색" }), "private.member@example.com");
    await user.click(screen.getByRole("button", { name: "대상 검색" }));
    await user.click(await screen.findByRole("button", { name: /검색 결과/ }));

    expect(screen.getByLabelText("location")).toHaveTextContent("event=private-hit");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("private.member@example.com");
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.queryKey))).not.toContain(
      "private.member@example.com",
    );
  });

  it("retains prior rows and offers a focused retry when load more fails", async () => {
    vi.mocked(fetchAdminAuditLedger)
      .mockResolvedValueOnce(page([item("event-1", "보존 이벤트")], "cursor-1"))
      .mockRejectedValueOnce(new Error("continuation unavailable"))
      .mockResolvedValueOnce(page([item("event-2", "복구 이벤트")], null));
    const user = userEvent.setup();
    renderRoute();
    await screen.findByRole("button", { name: /보존 이벤트/ });
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("기존 기록은 유지되었습니다");
    expect(screen.getByRole("button", { name: /보존 이벤트/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "이어 불러오기 재시도" }));
    expect(await screen.findByRole("button", { name: /복구 이벤트/ })).toBeInTheDocument();
  });
});
