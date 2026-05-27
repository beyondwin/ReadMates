import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminAuditLedgerQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";
import { AdminAuditRoute } from "./admin-audit-route";

function renderRoute(initialEntry = "/admin/audit?sourceSlice=S5") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(platformAdminAuditLedgerQuery({ range: "7d", sourceSlice: "S5" }).queryKey, {
    generatedAt: "2026-05-27T00:00:00Z",
    filters: {},
    summary: { visibleCount: 1, sourceUnavailableCount: 0, metadataUnavailableCount: 0, unavailableSources: [] },
    nextCursor: null,
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
    ],
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminAuditRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminAuditRoute", () => {
  it("renders cached audit ledger rows from URL filters", () => {
    renderRoute();

    expect(screen.getByRole("heading", { name: "감사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /알림 재처리가 확정되었습니다/ })).toBeInTheDocument();
  });
});
