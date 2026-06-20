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
  notificationHealth: { pending: 1, failed: 1, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 5, priorFailed7d: 2 },
  aiUsage: { activeJobs: 0, failedRecentJobs: 1, staleCandidates: 0, costEstimateUsd: "0.1200", state: "HAS_ACTIVITY", priorFailedJobs7d: 3 },
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

  it("shows the 7-day notification failure count with a trend delta", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByText("알림 실패 (7일)")).toBeInTheDocument();
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/지난 7일 대비/).length).toBeGreaterThan(0);
  });

  it("links readiness blockers to a next action", () => {
    const blocked: AdminClubOperationsSnapshot = {
      ...snapshot,
      readiness: { state: "NEEDS_ATTENTION", blockingReasons: ["HOST_REQUIRED"], nextAction: "HOST_REQUIRED" },
    };
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={blocked} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "호스트 지정" })).toHaveAttribute("href", "/clubs/reading-sai/app");
  });

  it("separates platform-owned and host-owned sections", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "플랫폼 운영" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "호스트 운영" })).toBeInTheDocument();
  });

  it("renders closing risks with safe state labels and host board links", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage
          snapshot={{
            ...snapshot,
            closingRisks: {
              incompleteCount: 2,
              blockedCount: 1,
              readyCount: 1,
              items: [
                {
                  sessionId: "session-7",
                  sessionNumber: 7,
                  bookTitle: "페인트",
                  meetingDate: "2026-06-18",
                  overallState: "BLOCKED",
                  primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
                },
                {
                  sessionId: "session-8",
                  sessionNumber: 8,
                  bookTitle: "긴긴밤",
                  meetingDate: "2026-06-25",
                  overallState: "IN_PROGRESS",
                  primaryBlocker: "RECORD_PACKAGE_REQUIRED",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-8/closing",
                },
                {
                  sessionId: "session-9",
                  sessionNumber: 9,
                  bookTitle: "스토너",
                  meetingDate: "2026-07-02",
                  overallState: "READY",
                  primaryBlocker: "MEMBER_NOTIFICATION_REQUIRED",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-9/closing",
                },
              ],
            },
          }}
          supportGrantCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "클로징 확인 필요" })).toBeInTheDocument();
    expect(screen.getByText("미완료 2 · 차단 1 · 준비 1")).toBeInTheDocument();
    expect(screen.getByText("No.07 · 페인트")).toBeInTheDocument();
    expect(screen.getByText("차단")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();
    expect(screen.getByText("확인 준비")).toBeInTheDocument();
    expect(screen.getByText("피드백 문서 확인 필요")).toBeInTheDocument();
    expect(screen.getByText("기록 패키지 필요")).toBeInTheDocument();
    expect(screen.getByText("멤버 알림 확인")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "호스트 클로징 보드" })[0]).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-7/closing",
    );
    expect(screen.queryByRole("button", { name: /발행|세션 종료|알림 발송|RSVP|출석/ })).not.toBeInTheDocument();
  });

  it("renders closing risk tracking labels and recently resolved rows", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage
          snapshot={{
            ...snapshot,
            closingRisks: {
              incompleteCount: 1,
              blockedCount: 1,
              readyCount: 0,
              trackingUnavailable: true,
              items: [
                {
                  sessionId: "session-7",
                  sessionNumber: 7,
                  bookTitle: "페인트",
                  meetingDate: "2026-06-18",
                  overallState: "BLOCKED",
                  primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
                  firstDetectedAt: "2026-06-18T00:00:00Z",
                  lastSeenAt: "2026-06-21T00:00:00Z",
                  resolvedAt: null,
                  ageDays: 3,
                  occurrenceCount: 2,
                  ledgerState: "ACTIVE",
                },
                {
                  sessionId: "session-8",
                  sessionNumber: 8,
                  bookTitle: "비공개 코드 방어",
                  meetingDate: "2026-06-25",
                  overallState: "RAW_INTERNAL_STATE",
                  primaryBlocker: "UNKNOWN_PRIVATE_BLOCKER_CODE",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-8/closing",
                  ageDays: 2,
                  occurrenceCount: 1,
                  ledgerState: "UNTRACKED",
                },
              ],
              recentlyResolvedItems: [
                {
                  sessionId: "session-5",
                  sessionNumber: 5,
                  bookTitle: "스토너",
                  meetingDate: "2026-06-04",
                  overallState: "RESOLVED",
                  primaryBlocker: "RECORD_PACKAGE_REQUIRED",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-5/closing",
                  firstDetectedAt: "2026-06-10T00:00:00Z",
                  lastSeenAt: "2026-06-12T00:00:00Z",
                  resolvedAt: "2026-06-20T09:00:00Z",
                  ageDays: 10,
                  occurrenceCount: 3,
                  ledgerState: "RESOLVED",
                },
              ],
            },
          }}
          supportGrantCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("추적 상태 확인 불가")).toBeInTheDocument();
    expect(screen.getByText("3일째 차단")).toBeInTheDocument();
    expect(screen.getByText("최초 감지 2026-06-18T00:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("최근 감지 2026-06-21T00:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("반복 2회")).toBeInTheDocument();
    expect(screen.getByText("2일째 확인 필요")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "최근 해소됨" })).toBeInTheDocument();
    expect(screen.getByText("No.05 · 스토너")).toBeInTheDocument();
    expect(screen.getByText("해소됨")).toBeInTheDocument();
    expect(screen.getByText("2026-06-20T09:00:00Z")).toBeInTheDocument();
    expect(screen.getByText("반복 3회")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "호스트 클로징 보드" })[2]).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host/sessions/session-5/closing",
    );
    expect(screen.queryByText("RAW_INTERNAL_STATE")).not.toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN_PRIVATE_BLOCKER_CODE")).not.toBeInTheDocument();
  });

  it("renders optional closing risks as an empty state", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "클로징 확인 필요" })).toBeInTheDocument();
    expect(screen.getByText("확인 필요한 회차 없음")).toBeInTheDocument();
  });

  it("hides raw unknown closing risk codes behind safe fallback labels", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage
          snapshot={{
            ...snapshot,
            closingRisks: {
              incompleteCount: 1,
              blockedCount: 0,
              readyCount: 0,
              items: [
                {
                  sessionId: "session-10",
                  sessionNumber: 10,
                  bookTitle: "공개 금지 센티널",
                  meetingDate: "2026-07-09",
                  overallState: "RAW_INTERNAL_STATE",
                  primaryBlocker: "UNKNOWN_PRIVATE_BLOCKER_CODE",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-10/closing",
                },
              ],
            },
          }}
          supportGrantCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByText("확인 필요").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("RAW_INTERNAL_STATE")).not.toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN_PRIVATE_BLOCKER_CODE")).not.toBeInTheDocument();
  });

  it("limits closing risk rows and renders overflow count", () => {
    render(
      <MemoryRouter>
        <AdminClubOperationsPage
          snapshot={{
            ...snapshot,
            closingRisks: {
              incompleteCount: 6,
              blockedCount: 1,
              readyCount: 1,
              items: Array.from({ length: 6 }, (_, index) => ({
                sessionId: `session-${index + 1}`,
                sessionNumber: index + 1,
                bookTitle: `책 ${index + 1}`,
                meetingDate: "2026-07-09",
                overallState: "IN_PROGRESS",
                primaryBlocker: "RECORD_PACKAGE_REQUIRED",
                hostClosingHref: `/clubs/reading-sai/app/host/sessions/session-${index + 1}/closing`,
              })),
            },
          }}
          supportGrantCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("No.05 · 책 5")).toBeInTheDocument();
    expect(screen.queryByText("No.06 · 책 6")).not.toBeInTheDocument();
    expect(screen.getByText("외 1개 회차")).toBeInTheDocument();
  });
});
