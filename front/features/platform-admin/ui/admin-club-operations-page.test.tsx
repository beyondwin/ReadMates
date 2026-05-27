import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AdminClubOperationsPage } from "@/features/platform-admin/ui/admin-club-operations-page";
import type { AdminClubOperationsSnapshot } from "@/features/platform-admin/model/platform-admin-club-operations-model";

const snapshot: AdminClubOperationsSnapshot = {
  schema: "admin.club_operations_snapshot.v1",
  generatedAt: "2026-05-27T00:00:00Z",
  club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이", status: "ACTIVE", publicVisibility: "PUBLIC" },
  readiness: { state: "READY", blockingReasons: [], nextAction: null },
  memberActivity: { activeCount: 8, dormantCount: 1, pendingViewerCount: 2, hostCount: 1 },
  sessionProgress: { upcomingCount: 2, currentOpenCount: 1, closedCount: 5, publishedRecordCount: 4, incompleteRecordCount: 1 },
  notificationHealth: { pending: 1, failed: 1, dead: 0, lastSuccessAt: null, failureClusters: [] },
  aiUsage: { activeJobs: 0, failedRecentJobs: 1, staleCandidates: 0, costEstimateUsd: "0.1200", state: "HAS_ACTIVITY" },
  safeLinks: [
    { label: "Host app", href: "/clubs/reading-sai/app", kind: "HOST_ROUTE" },
    { label: "알림 운영", href: "/admin/notifications?clubId=club-1", kind: "ADMIN_ROUTE" },
  ],
};

describe("AdminClubOperationsPage", () => {
  it("renders snapshot heading and support grant count", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={3} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "읽는사이 운영 스냅샷" })).toBeInTheDocument();
    expect(screen.getByText("지원 grant")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("links notification health to the selected club and avoids host commands", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "알림 ledger" })).toHaveAttribute(
      "href",
      "/admin/notifications?clubId=club-1",
    );
    expect(screen.queryByRole("button", { name: /RSVP|출석|세션 편집|발행/ })).not.toBeInTheDocument();
  });
});
