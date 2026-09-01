import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ComponentProps } from "react";
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

const okSnapshot: AdminClubOperationsSnapshot = {
  ...snapshot,
  memberActivity: { activeCount: 8, dormantCount: 0, pendingViewerCount: 0, hostCount: 1 },
  sessionProgress: { upcomingCount: 0, currentOpenCount: 0, closedCount: 0, publishedRecordCount: 0, incompleteRecordCount: 0 },
  notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [], recentFailed7d: 0, priorFailed7d: 0 },
  aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "NO_RECENT_USAGE", priorFailedJobs7d: 0 },
};

function snapshotNumbers(container: HTMLElement) {
  return [...container.querySelectorAll(
    ".admin-club-operations__metric strong, .admin-club-operations__stat strong",
  )].map((node) => node.textContent);
}

function TestAdminClubOperationsPage(
  props: Omit<ComponentProps<typeof AdminClubOperationsPage>, "navigation" | "renderLink">,
) {
  const navigation = {
    blockers: props.snapshot.readiness.blockingReasons.map((code) => ({
      code,
      label: code === "HOST_REQUIRED" ? "호스트 지정 필요" : "추가 운영 확인 필요",
      action: code === "HOST_REQUIRED"
        ? {
            id: `blocker-${code}`,
            href: `/clubs/${props.snapshot.club.slug}/app`,
            label: "호스트 지정",
            className: "btn btn-ghost btn-sm",
          }
        : null,
    })),
    notifications: {
      id: "notifications",
      href: `/admin/notifications?clubId=${props.snapshot.club.clubId}`,
      label: "알림 상태 확인",
      className: "btn btn-ghost btn-sm",
    },
    aiOps: {
      id: "ai-ops",
      href: `/admin/ai-ops?clubId=${props.snapshot.club.clubId}`,
      label: "AI 작업",
      className: "btn btn-ghost btn-sm",
    },
    safeLinks: props.snapshot.safeLinks.map((link, index) => ({
      id: `safe-${index}`,
      href: link.href,
      label: link.kind === "HOST_ROUTE" ? "클럽 운영 화면에서 확인" : "관련 운영 화면에서 확인",
      className: "admin-club-operations__link",
    })),
  };
  return (
    <AdminClubOperationsPage
      {...props}
      navigation={navigation}
      renderLink={(link) => <a key={link.id} href={link.href} className={link.className}>{link.label}</a>}
    />
  );
}

describe("AdminClubOperationsPage", () => {
  it("shows aggregate operational impact without member reading content or per-session workflow", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage
          snapshot={{
            ...snapshot,
            closingRisks: {
              incompleteCount: 2,
              blockedCount: 1,
              readyCount: 1,
              items: [
                {
                  sessionId: "session-private",
                  sessionNumber: 7,
                  bookTitle: "노출되면 안 되는 멤버 독서 콘텐츠",
                  meetingDate: "2026-06-18",
                  overallState: "BLOCKED",
                  primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
                  hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-private/closing",
                },
              ],
            },
          }}
          supportGrantCount={0}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("미완료 2 · 차단 1 · 준비 1")).toBeInTheDocument();
    expect(screen.queryByText("노출되면 안 되는 멤버 독서 콘텐츠")).not.toBeInTheDocument();
    expect(screen.queryByText(/No\.07/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "호스트 클로징 보드" })).not.toBeInTheDocument();
  });

  it("hides numbers on ok snapshot items and shows numbers only on deviation", () => {
    const okView = render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={okSnapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );

    expect(screen.getByText("활성 멤버")).toBeInTheDocument();
    expect(screen.getByText("알림 실패 (7일)")).toBeInTheDocument();
    expect(snapshotNumbers(okView.container)).toEqual([]);
    expect(screen.queryByText("미완료 0 · 차단 0 · 준비 0")).not.toBeInTheDocument();
    expect(screen.queryByText("8")).not.toBeInTheDocument();
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument();
    okView.unmount();

    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={snapshot} supportGrantCount={3} />
      </MemoryRouter>,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getByText("휴면").closest(".admin-club-operations__stat")).toHaveTextContent("1");
    expect(screen.getByText("가입 대기").closest(".admin-club-operations__stat")).toHaveTextContent("2");
  });

  it("renders snapshot heading and support grant count", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={snapshot} supportGrantCount={3} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "운영 영향 요약" })).toBeInTheDocument();
    expect(screen.getByText("운영 스냅샷", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Operations snapshot")).toBeNull();
    expect(screen.getByText("접근 발급")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("links notification health to the selected club and avoids host commands", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "관련 운영 화면에서 확인" })).toHaveAttribute(
      "href",
      "/admin/notifications?clubId=club-1",
    );
    expect(screen.queryByRole("button", { name: /참석 응답|출석|모임 편집|발행/ })).not.toBeInTheDocument();
  });

  it("shows the 7-day notification failure count with a trend delta", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
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
        <TestAdminClubOperationsPage snapshot={blocked} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "호스트 지정" })).toHaveAttribute("href", "/clubs/reading-sai/app");
    expect(screen.getByText("호스트 지정 필요")).toBeInTheDocument();
    expect(screen.queryByText("HOST_REQUIRED")).not.toBeInTheDocument();
  });

  it("separates platform-owned and host-owned sections", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: "플랫폼 운영" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "호스트 운영" })).toBeInTheDocument();
  });

  it("summarizes closing risk counts without rendering session-level details", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage
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
    expect(screen.getByText("확인 대상 3건")).toBeInTheDocument();
    expect(screen.getByText("개별 모임과 독서 내용은 클럽 운영 화면에서 확인합니다.")).toBeInTheDocument();
    expect(screen.queryByText("No.07 · 페인트")).not.toBeInTheDocument();
    expect(screen.queryByText("피드백 문서 확인 필요")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "호스트 클로징 보드" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /발행|모임 종료|알림 발송|참석 응답|출석/ })).not.toBeInTheDocument();
  });

  it("summarizes tracking availability and recently resolved counts", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage
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
    expect(screen.getByText("확인 대상 2건")).toBeInTheDocument();
    expect(screen.getByText("최근 해소 1건")).toBeInTheDocument();
    expect(screen.queryByText("3일째 차단")).not.toBeInTheDocument();
    expect(screen.queryByText("No.05 · 스토너")).not.toBeInTheDocument();
    expect(screen.queryByText("RAW_INTERNAL_STATE")).not.toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN_PRIVATE_BLOCKER_CODE")).not.toBeInTheDocument();
  });

  it("renders optional closing risks as an empty state", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage snapshot={snapshot} supportGrantCount={0} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "클로징 확인 필요" })).toBeInTheDocument();
    expect(screen.getByText("확인 필요한 모임 없음")).toBeInTheDocument();
  });

  it("hides raw unknown closing risk codes behind safe fallback labels", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage
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

    expect(screen.getByText("확인 대상 1건")).toBeInTheDocument();
    expect(screen.queryByText("RAW_INTERNAL_STATE")).not.toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN_PRIVATE_BLOCKER_CODE")).not.toBeInTheDocument();
  });

  it("reports the full aggregate count without rendering overflow rows", () => {
    render(
      <MemoryRouter>
        <TestAdminClubOperationsPage
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

    expect(screen.getByText("확인 대상 6건")).toBeInTheDocument();
    expect(screen.queryByText("No.05 · 책 5")).not.toBeInTheDocument();
    expect(screen.queryByText("No.06 · 책 6")).not.toBeInTheDocument();
    expect(screen.queryByText("외 1개 모임")).not.toBeInTheDocument();
  });
});
