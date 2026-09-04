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

function item(id: string, actionType = "AI_COMMAND_RETRY_COMMIT"): AdminAuditLedgerItem {
  const actionCategory = actionType.startsWith("CLUB_")
    ? "CLUB_LIFECYCLE"
    : actionType.startsWith("SUPPORT_")
      ? "SUPPORT"
      : actionType.startsWith("ADMIN_NOTIFICATION_")
        ? "NOTIFICATION"
        : "AI_OPS";
  return {
    id,
    occurredAt: "2026-08-25T00:00:00Z",
    sourceSlice: actionCategory === "CLUB_LIFECYCLE" ? "S3" : actionCategory === "SUPPORT" ? "S4" : actionCategory === "NOTIFICATION" ? "S5" : "S6",
    sourceTable: "platform_audit_events",
    actionCategory,
    actionType,
    outcome: "SUCCESS",
    actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
    target: { clubId: "club-1", userId: null, jobId: actionCategory === "AI_OPS" ? "job-1" : null, eventId: null, label: actionCategory === "AI_OPS" ? "AI job" : "club-1" },
    summary: id,
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
  vi.mocked(fetchAdminAuditLedger).mockReset().mockResolvedValue(page([item("event-1")], null));
  vi.mocked(searchAdminAuditLedger).mockReset().mockResolvedValue(page([item("private-hit", "ADMIN_NOTIFICATION_REPLAY_CONFIRMED")], null));
});

describe("AdminAuditRoute", () => {
  it("loads additional pages, deduplicates their boundary, and keeps the selected row", async () => {
    vi.mocked(fetchAdminAuditLedger)
      .mockResolvedValueOnce(page([item("event-1"), item("boundary", "CLUB_ACTIVATED")], "cursor-1", ["source-a"]))
      .mockResolvedValueOnce(page([item("boundary", "CLUB_ACTIVATED"), item("event-2", "SUPPORT_ACCESS_GRANT_REVOKED")], null, ["source-a"]));
    const user = userEvent.setup();
    const { container } = renderRoute();

    await user.click(await screen.findByRole("button", { name: /클럽을 활성화했습니다/ }));
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    await screen.findByRole("button", { name: /지원 접근 권한을 회수했습니다/ });
    expect(screen.getAllByRole("button", { name: /클럽을 활성화했습니다/ })).toHaveLength(1);
    expect(screen.getByRole("region", { name: "감사 이벤트 상세" })).toHaveTextContent("클럽을 활성화했습니다");
    expect(screen.getByLabelText("location")).toHaveTextContent("event=boundary");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("mode=detail");
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

    await screen.findByRole("button", { name: /알림 재처리를 확정했습니다/ });
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
    await screen.findByRole("button", { name: /알림 재처리를 확정했습니다/ });

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
    expect(screen.queryByRole("button", { name: /알림 재처리를 확정했습니다/ })).not.toBeInTheDocument();
    const sensitiveCache = queryClient.getQueriesData({ queryKey: [...platformAdminAuditKeys.all, "sensitive"] });
    expect(JSON.stringify(sensitiveCache)).not.toContain("private@example.com");
    expect(sensitiveCache.every(([key]) => (key as readonly unknown[]).at(-1) === 0)).toBe(true);
    expect(screen.getByLabelText("location")).not.toHaveTextContent("private@example.com");
  });

  it("opens detail from a share-safe event URL and restores row focus when detail closes", async () => {
    const user = userEvent.setup();
    renderRoute("/admin/audit?sourceSlice=S6&event=event-1&mode=detail");

    expect(await screen.findByRole("button", { name: /AI 작업 반영을 다시 시도했습니다/ })).toHaveAttribute("aria-pressed", "true");
    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(detail).toHaveTextContent("AI 작업 반영을 다시 시도했습니다");
    expect(document.querySelector(".admin-audit__body")).toHaveAttribute("data-detail-open", "true");

    await user.click(screen.getByRole("button", { name: "목록으로" }));

    expect(screen.getByLabelText("location")).toHaveTextContent("event=event-1");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("mode=detail");
    expect(screen.getByRole("button", { name: /AI 작업 반영을 다시 시도했습니다/ })).toHaveFocus();
    expect(document.querySelector(".admin-audit__body")).toHaveAttribute("data-detail-open", "false");
  });

  it("selects an event without encoding the default range or detail mode into the URL", async () => {
    const user = userEvent.setup();
    renderRoute("/admin/audit");
    await user.click(await screen.findByRole("button", { name: /AI 작업 반영을 다시 시도했습니다/ }));

    expect(screen.getByLabelText("location")).toHaveTextContent("/admin/audit?event=event-1");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("range=");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("mode=detail");
  });

  it("does not put a sensitive target into the event URL or query key after a row is selected", async () => {
    const user = userEvent.setup();
    const { queryClient } = renderRoute();
    await user.type(await screen.findByRole("searchbox", { name: "민감 대상 검색" }), "private.member@example.com");
    await user.click(screen.getByRole("button", { name: "대상 검색" }));
    await user.click(await screen.findByRole("button", { name: /알림 재처리를 확정했습니다/ }));

    expect(screen.getByLabelText("location")).toHaveTextContent("event=private-hit");
    expect(screen.getByLabelText("location")).not.toHaveTextContent("private.member@example.com");
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((query) => query.queryKey))).not.toContain(
      "private.member@example.com",
    );
  });

  it("applies a target query as the initial club filter", async () => {
    renderRoute("/admin/audit?target=club-reading-sai");

    expect(await screen.findByLabelText("클럽 ID")).toHaveValue("club-reading-sai");
    expect(fetchAdminAuditLedger).toHaveBeenCalledWith(
      expect.objectContaining({ range: "7d", clubId: "club-reading-sai" }),
      undefined,
    );
  });

  it("retains prior rows and offers a focused retry when load more fails", async () => {
    vi.mocked(fetchAdminAuditLedger)
      .mockResolvedValueOnce(page([item("event-1", "CLUB_SUSPENDED")], "cursor-1"))
      .mockRejectedValueOnce(new Error("continuation unavailable"))
      .mockResolvedValueOnce(page([item("event-2", "CLUB_RESTORED")], null));
    const user = userEvent.setup();
    renderRoute();
    await screen.findByRole("button", { name: /클럽을 일시 중지했습니다/ });
    await user.click(screen.getByRole("button", { name: "더 보기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("기존 기록은 유지되었습니다");
    expect(screen.getByRole("button", { name: /클럽을 일시 중지했습니다/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "이어 불러오기 재시도" }));
    expect(await screen.findByRole("button", { name: /클럽을 복구했습니다/ })).toBeInTheDocument();
  });

  it("describes an unavailable ledger in operator language while preserving the source filter", async () => {
    vi.mocked(fetchAdminAuditLedger).mockRejectedValueOnce(new Error("unavailable"));
    renderRoute("/admin/audit?sourceSlice=S5");

    expect(await screen.findByText("처리 기록을 불러오지 못했습니다. 다시 시도해 주세요.")).toBeInTheDocument();
    expect(fetchAdminAuditLedger).toHaveBeenCalledWith({ range: "7d", sourceSlice: "S5" }, undefined);
  });
});
