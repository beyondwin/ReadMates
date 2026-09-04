import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import { AdminAuditLedger } from "./admin-audit-ledger";

const PROCESSING_RECORDS_CSS_PATH = path.resolve(
  "features/platform-admin/ui/admin-processing-records.css",
);
const PROCESSING_RECORDS_CSS = existsSync(PROCESSING_RECORDS_CSS_PATH)
  ? readFileSync(PROCESSING_RECORDS_CSS_PATH, "utf8")
  : "";

const defaultSearch = {
  value: "",
  canSearch: true,
  pending: false,
  error: null,
  active: false,
  onChange: vi.fn(),
  onSubmit: vi.fn(),
  onClear: vi.fn(),
};

const page: AdminAuditLedgerPage = {
  generatedAt: "2026-05-27T00:00:00Z",
  filters: {},
  summary: { visibleCount: 2, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
  nextCursor: "cursor-1",
  items: [
    {
      id: "platform_audit_events:event-1",
      occurredAt: "2026-05-27T00:01:00Z",
      sourceSlice: "S5",
      sourceTable: "platform_audit_events",
      actionCategory: "NOTIFICATION",
      actionType: "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
      outcome: "SUCCESS",
      actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
      target: { clubId: "club-1", userId: null, jobId: null, eventId: "preview-1", label: "Replay preview" },
      summary: "알림 재처리가 확정되었습니다.",
      safeMetadata: [{ label: "selectionHashPrefix", value: "aaaaaaaa", kind: "fingerprint" }],
      metadataState: "AVAILABLE",
    },
    {
      id: "platform_audit_events:event-2",
      occurredAt: "2026-05-27T00:00:00Z",
      sourceSlice: "S4",
      sourceTable: "platform_audit_events",
      actionCategory: "SUPPORT",
      actionType: "SUPPORT_ACCESS_GRANT_CREATED",
      outcome: "SUCCESS",
      actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
      target: { clubId: "club-1", userId: null, jobId: null, eventId: null, label: "사용자 숨김" },
      summary: "support grant가 생성되었습니다.",
      safeMetadata: [{ label: "scope", value: "METADATA_READ", kind: "code" }],
      metadataState: "AVAILABLE",
    },
  ],
};

describe("AdminAuditLedger", () => {
  it.each(["OWNER", "OPERATOR", "SUPPORT"] as const)("never renders raw %s as primary row actor copy", (role) => {
    render(
      <AdminAuditLedger
        page={{ ...page, items: [{ ...page.items[0], actor: { userId: "admin-1", role, displayLabel: role } }] }}
        filters={{ range: "7d" }} loading={false} error={null} nextPageError={false} loadingMore={false}
        sensitiveSearch={defaultSearch} selectedId={null} detailOpen={false} onSelect={vi.fn()} onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()}
      />,
    );
    const row = screen.getByRole("button", { name: /알림 재처리를 확정했습니다/ });
    expect(row).toHaveTextContent(role === "OWNER" ? "소유자" : role === "OPERATOR" ? "운영자" : "지원 담당");
    expect(row).not.toHaveTextContent(role);
  });

  it("renders ledger rows and safe metadata detail", async () => {
    const user = userEvent.setup();
    render(
      <AdminAuditLedger
        page={page}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "처리 기록" })).toBeInTheDocument();
    const notificationRow = screen.getByRole("button", { name: /알림 재처리를 확정했습니다/ });
    expect(notificationRow).toBeInTheDocument();
    await user.click(notificationRow);

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    const identity = detail.querySelector(".admin-audit__identity");
    expect(identity).toHaveTextContent("소유자");
    expect(identity).not.toHaveTextContent("OWNER");
    expect(detail.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("OWNER");
    expect(detail.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("preview-1");
    expect(within(detail).getByText("selectionHashPrefix")).toBeInTheDocument();
    expect(detail.textContent).not.toContain("{");
    expect(within(detail).getByText("운영 판단")).toBeInTheDocument();
    expect(within(detail).getByText("기록 보존")).toBeInTheDocument();
  });

  it("shows partial source unavailable state", () => {
    render(
      <AdminAuditLedger
        page={{ ...page, summary: { ...page.summary, sourceUnavailableCount: 1, unavailableSources: ["AI_GENERATION"] } }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("일부 감사 source를 불러오지 못했습니다.");
  });

  it("links an AI_OPS row detail to the ai-ops club drilldown", async () => {
    const user = userEvent.setup();
    const aiPage: AdminAuditLedgerPage = {
      ...page,
      items: [
        {
          id: "platform_audit_events:event-ai",
          occurredAt: "2026-05-31T00:00:00Z",
          sourceSlice: "S6",
          sourceTable: "platform_audit_events",
          actionCategory: "AI_OPS",
          actionType: "AI_COMMAND_RETRY_COMMIT",
          outcome: "SUCCESS",
          actor: { userId: "admin-1", role: "OWNER", displayLabel: "OWNER" },
          target: { clubId: "club-7", userId: null, jobId: "job-1", eventId: null, label: "AI job" },
          summary: "AI 커밋 재시도를 실행했습니다.",
          safeMetadata: [],
          metadataState: "AVAILABLE",
        },
      ],
    };

    render(
      <MemoryRouter>
        <AdminAuditLedger
          page={aiPage}
          filters={{ range: "7d" }}
          loading={false}
          error={null}
          nextPageError={false}
          loadingMore={false}
          sensitiveSearch={defaultSearch}
          selectedId={null}
          detailOpen={false}
          onSelect={vi.fn()}
          onCloseDetail={vi.fn()}
          onFilterChange={vi.fn()}
          onLoadMore={vi.fn()}
          onRetryLoadMore={vi.fn()}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /AI 작업 반영을 다시 시도했습니다/ }));

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("후속 화면 있음")).toBeInTheDocument();
    expect(within(detail).getByRole("link", { name: /AI 작업에서 보기/ })).toHaveAttribute(
      "href",
      "/admin/ai-ops?clubId=club-7&jobId=job-1",
    );
  });

  it("shows limited detail when metadata is unavailable", () => {
    render(
      <AdminAuditLedger
        page={{
          ...page,
          items: [
            {
              ...page.items[0],
              metadataState: "UNAVAILABLE",
              safeMetadata: [{ label: "rawJson", value: "{\"secret\":\"value\"}", kind: "json" }],
            },
          ],
        }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("세부 정보 제한")).toBeInTheDocument();
    expect(detail.textContent).not.toContain("secret");
    expect(detail.textContent).not.toContain("{");
  });

  it("shows complete actor, target, transition, receipt, and correlation evidence", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AdminAuditLedger
          page={{
            ...page,
            items: [{
              ...page.items[0],
              actor: { userId: null, role: "SYSTEM", displayLabel: "notification-worker" },
              target: { clubId: "club-1", userId: null, jobId: null, eventId: "event-1", label: "알림 재처리" },
              safeMetadata: [
                { label: "reasonCategory", value: "INCIDENT_INVESTIGATION", kind: "code" },
                { label: "beforeStatus", value: "FAILED", kind: "code" },
                { label: "afterStatus", value: "SUCCEEDED", kind: "code" },
                { label: "receiptId", value: "receipt-1", kind: "reference" },
                { label: "correlationId", value: "correlation-1", kind: "reference" },
              ],
            }],
          }}
          filters={{ range: "7d" }} loading={false} error={null} nextPageError={false} loadingMore={false}
          sensitiveSearch={defaultSearch} selectedId={null} detailOpen={false} onSelect={vi.fn()} onCloseDetail={vi.fn()} onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()}
        />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /알림 재처리를 확정했습니다/ }));
    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(detail).toHaveTextContent("notification-worker");
    expect(detail).toHaveTextContent("알림 재처리");
    expect(detail).toHaveTextContent("INCIDENT_INVESTIGATION");
    expect(detail).toHaveTextContent("FAILED");
    expect(detail).toHaveTextContent("SUCCEEDED");
    expect(detail).toHaveTextContent("receipt-1");
    expect(detail).toHaveTextContent("correlation-1");
  });

  it("supports arrow-key row navigation and a mobile return to the list", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onCloseDetail = vi.fn();
    const { rerender } = render(
      <AdminAuditLedger page={page} filters={{ range: "7d" }} loading={false} error={null}
        nextPageError={false} loadingMore={false} sensitiveSearch={defaultSearch}
        selectedId={page.items[0].id} detailOpen={true} onSelect={onSelect} onCloseDetail={onCloseDetail}
        onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()} />,
    );
    const first = screen.getByRole("button", { name: /알림 재처리를 확정했습니다/ });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(onSelect).toHaveBeenCalledWith(page.items[1]);
    rerender(
      <AdminAuditLedger page={page} filters={{ range: "7d" }} loading={false} error={null}
        nextPageError={false} loadingMore={false} sensitiveSearch={defaultSearch}
        selectedId={page.items[1].id} detailOpen={true} onSelect={onSelect} onCloseDetail={onCloseDetail}
        onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /지원 접근 권한을 부여했습니다/ })).toHaveFocus();
    const supportDetail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(supportDetail.querySelector(".admin-audit__identity")).toHaveTextContent("지원 접근 권한을 부여했습니다");
    expect(supportDetail.querySelector(".admin-audit__identity")).not.toHaveTextContent("support grant");
    expect(supportDetail.querySelector("[data-admin-technical-disclosure]")).toHaveTextContent("support grant가 생성되었습니다");
    await user.click(screen.getByRole("button", { name: "목록으로" }));
    expect(onCloseDetail).toHaveBeenCalledOnce();
    rerender(
      <AdminAuditLedger page={page} filters={{ range: "7d" }} loading={false} error={null}
        nextPageError={false} loadingMore={false} sensitiveSearch={defaultSearch}
        selectedId={page.items[1].id} detailOpen={false} onSelect={onSelect} onCloseDetail={onCloseDetail}
        onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /지원 접근 권한을 부여했습니다/ })).toHaveFocus();
  });

  it("exposes every share-safe filter without exposing cursor controls", () => {
    render(
      <AdminAuditLedger page={page} filters={{ range: "7d" }} loading={false} error={null}
        nextPageError={false} loadingMore={false} sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()} />,
    );
    document.querySelector("details.admin-audit__disclosure")?.setAttribute("open", "");
    expect(screen.getByLabelText("시작 시각")).toBeInTheDocument();
    expect(screen.getByLabelText("종료 시각")).toBeInTheDocument();
    expect(screen.getByLabelText("클럽 ID")).toBeInTheDocument();
    expect(screen.getByLabelText("행위자 역할")).toBeInTheDocument();
    expect(screen.getByLabelText("소스 영역")).toBeInTheDocument();
    expect(screen.getByLabelText("행동 분류")).toBeInTheDocument();
    expect(screen.getByLabelText("결과")).toBeInTheDocument();
    expect(screen.queryByLabelText(/cursor/i)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "소유자" })).toHaveValue("OWNER");
    expect(within(screen.getByLabelText("소스 영역")).getByRole("option", { name: "알림" })).toHaveValue("S5");
    expect(within(screen.getByLabelText("행동 분류")).getByRole("option", { name: "지원 접근" })).toHaveValue("SUPPORT");
    expect(screen.queryByRole("option", { name: "OWNER" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "S5" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "NOTIFICATION" })).not.toBeInTheDocument();
  });

  it("renders rows in the exact time, actor, target action, and result order", () => {
    render(
      <AdminAuditLedger
        page={page}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "처리 기록" })).toBeInTheDocument();
    const row = screen.getByRole("button", { name: /소유자 · 알림 재처리 대상에 알림 재처리를 확정했습니다/ });
    const fields = [...row.querySelectorAll<HTMLElement>("[data-audit-row-field]")];
    expect(fields.map((field) => field.dataset.auditRowField)).toEqual(["time", "actor", "action", "outcome"]);
    expect(fields.map((field) => field.textContent)).toEqual([
      expect.stringMatching(/2026/),
      "소유자",
      "알림 재처리 대상에 알림 재처리를 확정했습니다.",
      "완료",
    ]);
    expect(row).not.toHaveTextContent("사유");
    expect(row.querySelector("time")).toHaveAttribute("datetime", "2026-05-27T00:01:00Z");
    expect(row).not.toHaveTextContent("preview-1");
    expect(row).not.toHaveTextContent("ADMIN_NOTIFICATION_REPLAY_CONFIRMED");
    expect(row).not.toHaveTextContent("platform_audit_events:event-1");
  });

  it("labels a DENIED row as 차단", () => {
    render(
      <AdminAuditLedger
        page={{
          ...page,
          items: [{ ...page.items[0], outcome: "DENIED" }],
        }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /소유자 · 알림 재처리 대상에/ });
    expect(row).toHaveTextContent("차단됨");
    expect(row).not.toHaveTextContent("거부");
  });

  it("keeps the event id in the drawer and out of the sentence row", async () => {
    const user = userEvent.setup();
    render(
      <AdminAuditLedger
        page={page}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /소유자 · 알림 재처리 대상에 알림 재처리를 확정했습니다/ });
    expect(row).not.toHaveTextContent("preview-1");
    await user.click(row);

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("preview-1")).toBeInTheDocument();
    expect(detail).toHaveTextContent("ADMIN_NOTIFICATION_REPLAY_CONFIRMED");
  });

  it("keeps reason absence and source, action, receipt identifiers in detail only", async () => {
    const user = userEvent.setup();
    render(
      <AdminAuditLedger
        page={{
          ...page,
          items: [{
            ...page.items[0],
            safeMetadata: [{ label: "receiptId", value: "receipt-1", kind: "id" }],
          }],
        }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        nextPageError={false}
        loadingMore={false}
        sensitiveSearch={defaultSearch}
        selectedId={null}
        detailOpen={false}
        onSelect={vi.fn()}
        onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
        onRetryLoadMore={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /알림 재처리 대상에 알림 재처리를 확정했습니다/ });
    expect(row).not.toHaveTextContent("platform_audit_events");
    expect(row).not.toHaveTextContent("ADMIN_NOTIFICATION_REPLAY_CONFIRMED");
    expect(row).not.toHaveTextContent("receipt-1");
    expect(row).not.toHaveTextContent("사유");
    await user.click(row);

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("기록된 사유 정보가 없습니다.")).toBeInTheDocument();
    const disclosure = detail.querySelector("[data-admin-technical-disclosure]");
    expect(disclosure).toHaveTextContent("platform_audit_events");
    expect(disclosure).toHaveTextContent("ADMIN_NOTIFICATION_REPLAY_CONFIRMED");
    expect(disclosure).toHaveTextContent("receipt-1");
  });

  it("keeps raw server summary and code metadata inside technical disclosure", async () => {
    const user = userEvent.setup();
    render(
      <AdminAuditLedger
        page={{ ...page, items: [page.items[1]] }}
        filters={{ range: "7d" }} loading={false} error={null} nextPageError={false} loadingMore={false}
        sensitiveSearch={defaultSearch} selectedId={null} detailOpen={false} onSelect={vi.fn()} onCloseDetail={vi.fn()}
        onFilterChange={vi.fn()} onLoadMore={vi.fn()} onRetryLoadMore={vi.fn()}
      />,
    );

    const row = screen.getByRole("button", { name: /지원 접근 대상에 지원 접근 권한을 부여했습니다/ });
    expect(row).not.toHaveTextContent("support grant");
    expect(row).not.toHaveTextContent("METADATA_READ");
    await user.click(row);
    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(detail.querySelector(".admin-audit__identity")).not.toHaveTextContent("support grant");
    expect(detail.querySelector(".admin-audit__metadata")).toBeNull();
    const disclosure = detail.querySelector("[data-admin-technical-disclosure]");
    expect(disclosure).toHaveTextContent("원본 설명");
    expect(disclosure).toHaveTextContent("support grant가 생성되었습니다.");
    expect(disclosure).toHaveTextContent("METADATA_READ");
  });

  it("paints row titles at 17/600 and leaves pagination in the first viewport", () => {
    expect(PROCESSING_RECORDS_CSS).toMatch(
      /\.admin-audit__row-title[\s\S]*font-weight:\s*600/,
    );
    expect(PROCESSING_RECORDS_CSS).not.toMatch(
      /\.admin-audit__more \{[\s\S]*clip:\s*rect/,
    );
    expect(PROCESSING_RECORDS_CSS).toContain("pointer-events: none");
    expect(PROCESSING_RECORDS_CSS).toContain(".admin-audit");
  });

  it("fills the approved page-heading band with the audit h1", () => {
    expect(PROCESSING_RECORDS_CSS).toMatch(
      /\.admin-shell:has\(\.admin-audit\) \.admin-page-frame > \.admin-page-frame__header h1[\s\S]*width:\s*100%[\s\S]*height:\s*68px/,
    );
  });
});
