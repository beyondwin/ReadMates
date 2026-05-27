import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AdminAuditLedgerPage } from "@/features/platform-admin/model/platform-admin-audit-model";
import { AdminAuditLedger } from "./admin-audit-ledger";

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
  it("renders ledger rows and safe metadata detail", async () => {
    const user = userEvent.setup();
    render(
      <AdminAuditLedger
        page={page}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "감사" })).toBeInTheDocument();
    const notificationRow = screen.getByRole("button", { name: /알림 재처리가 확정되었습니다/ });
    expect(notificationRow).toBeInTheDocument();
    await user.click(notificationRow);

    const detail = screen.getByRole("region", { name: "감사 이벤트 상세" });
    expect(within(detail).getByText("selectionHashPrefix")).toBeInTheDocument();
    expect(detail.textContent).not.toContain("{");
  });

  it("shows partial source unavailable state", () => {
    render(
      <AdminAuditLedger
        page={{ ...page, summary: { ...page.summary, sourceUnavailableCount: 1, unavailableSources: ["AI_GENERATION"] } }}
        filters={{ range: "7d" }}
        loading={false}
        error={null}
        onFilterChange={vi.fn()}
        onLoadMore={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("일부 감사 source를 불러오지 못했습니다.");
  });
});
