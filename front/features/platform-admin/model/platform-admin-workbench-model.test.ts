import { describe, expect, it } from "vitest";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminAiOpsJobInput,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";

const baseInput: PlatformAdminWorkbenchInput = {
  role: "OWNER",
  activeClubCount: 3,
  domainActionRequiredCount: 1,
  selectedClubId: null,
  clubs: [
    {
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      tagline: "함께 읽는 클럽",
      about: "공개 소개가 입력되어 있습니다.",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "ASSIGNED",
    },
    {
      clubId: "club-host-missing",
      slug: "host-missing",
      name: "Host Missing",
      tagline: "준비 중",
      about: "공개 소개가 입력되어 있습니다.",
      status: "SETUP_REQUIRED",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      firstHostOnboardingState: "MISSING",
    },
    {
      clubId: "club-public",
      slug: "public-club",
      name: "Public Club",
      tagline: "공개 클럽",
      about: "이미 공개된 클럽입니다.",
      status: "ACTIVE",
      publicVisibility: "PUBLIC",
      domainCount: 1,
      domainActionRequiredCount: 1,
      firstHostOnboardingState: "ASSIGNED",
    },
  ],
  domains: [
    {
      id: "domain-public",
      clubId: "club-public",
      hostname: "public.example.com",
      kind: "SUBDOMAIN",
      status: "FAILED",
      desiredState: "ENABLED",
      manualAction: "NONE",
      errorCode: "DNS_NOT_CONNECTED",
      isPrimary: false,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  ],
};

describe("platform admin workbench model", () => {
  it("orders blocked clubs before ready and stable clubs", () => {
    const workbench = buildPlatformAdminWorkbench(baseInput);

    expect(workbench.queueItems.map((item) => item.id)).toEqual([
      "club-club-host-missing",
      "club-club-public",
      "club-club-ready",
    ]);
    expect(workbench.selectedBrief?.club?.clubId).toBe("club-host-missing");
  });

  it("builds publish checklist and primary action for a ready private club", () => {
    const workbench = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-ready",
    });

    expect(workbench.selectedBrief?.publishChecklist.every((item) => item.passed)).toBe(true);
    expect(workbench.selectedBrief?.primaryAction).toEqual({
      kind: "make-public",
      label: "공개 전환",
      href: "/admin/clubs/club-ready",
      disabled: false,
      reason: null,
    });
  });

  it("blocks publish when the first host is missing", () => {
    const workbench = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-host-missing",
    });

    expect(workbench.selectedBrief?.publishChecklist).toContainEqual({
      id: "first-host",
      label: "첫 호스트 지정",
      passed: false,
      detail: "첫 호스트가 아직 없습니다.",
    });
    expect(workbench.selectedBrief?.primaryAction.disabled).toBe(true);
  });

  it("exposes role capabilities separately from queue state", () => {
    const owner = buildPlatformAdminWorkbench(baseInput);
    const support = buildPlatformAdminWorkbench({ ...baseInput, role: "SUPPORT" });

    expect(owner.permissions.canCreateSupportGrant).toBe(true);
    expect(support.permissions.canCreateSupportGrant).toBe(false);
    expect(support.permissions.canUpdateClub).toBe(false);
  });

  it("returns the 'none' primary action for ARCHIVED and SUSPENDED clubs", () => {
    const archived = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedClubId: "club-archived",
      clubs: [
        ...baseInput.clubs,
        {
          clubId: "club-archived",
          slug: "archived-club",
          name: "보관 클럽",
          tagline: "tagline",
          about: "about",
          status: "ARCHIVED",
          publicVisibility: "PRIVATE",
          domainCount: 0,
          domainActionRequiredCount: 0,
          firstHostOnboardingState: "ASSIGNED",
        },
      ],
    });

    expect(archived.selectedBrief?.primaryAction.kind).toBe("none");
    expect(archived.selectedBrief?.primaryAction.disabled).toBe(true);
  });

  it("picks the first queue item when selectedClubId is null", () => {
    const workbench = buildPlatformAdminWorkbench({ ...baseInput, selectedClubId: null });
    expect(workbench.selectedBrief?.club?.clubId).toBe("club-host-missing");
  });
});

describe("buildPlatformAdminWorkbench — AI item 합류", () => {
  function aiJob(overrides: Partial<PlatformAdminAiOpsJobInput>): PlatformAdminAiOpsJobInput {
    return {
      jobId: "job-1",
      clubId: "club-1",
      clubName: "샘플 클럽",
      sessionTitle: "1회차",
      status: "FAILED",
      errorCode: null,
      stale: false,
      startedAt: "2026-05-20T00:00:00Z",
      ...overrides,
    };
  }

  it("appends AI items as typed view models with severity", () => {
    const result = buildPlatformAdminWorkbench({
      role: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      selectedClubId: null,
      clubs: [],
      domains: [],
      aiJobs: [
        aiJob({ jobId: "job-1", status: "FAILED", stale: false }),
        aiJob({ jobId: "job-2", status: "RUNNING", stale: true }),
      ],
      aiDisabled: false,
    });
    const aiItems = result.queueItems.filter((item) => item.type === "ai");
    expect(aiItems).toHaveLength(2);
    expect(aiItems.find((item) => item.id === "ai-job-1")?.severity).toBe("critical");
    expect(aiItems.find((item) => item.id === "ai-job-2")?.severity).toBe("warn");
  });

  it("uses 'info' severity for AI items when AI is disabled", () => {
    const result = buildPlatformAdminWorkbench({
      role: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      selectedClubId: null,
      clubs: [],
      domains: [],
      aiJobs: [aiJob({ jobId: "job-3", status: "FAILED", stale: false })],
      aiDisabled: true,
    });
    const disabledItem = result.queueItems.find((item) => item.id === "ai-disabled");
    const failedItem = result.queueItems.find((item) => item.id === "ai-job-3");
    expect(disabledItem?.severity).toBe("info");
    expect(failedItem?.severity).toBe("critical");
  });
});

const notificationSnapshot = {
  generatedAt: "2026-05-27T00:00:00Z",
  outboxSummary: { pending: 4, active: 1, failed: 2, dead: 1, sentOrPublishedLast24h: 8 },
  deliverySummary: { pending: 3, active: 0, failed: 1, dead: 1, sentOrPublishedLast24h: 10 },
  relaySummary: { publishing: 0, sending: 0, stalePublishing: 1, staleSending: 1 },
  failureClusters: [
    { safeErrorCode: "mailbox_unavailable", status: "DEAD", count: 2, latestAt: "2026-05-27T00:00:00Z" },
  ],
  clubHealth: [
    {
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      pending: 0,
      failed: 2,
      dead: 1,
      lastSuccessAt: "2026-05-26T23:00:00Z",
    },
  ],
  recentManualDispatches: [],
};

describe("buildPlatformAdminWorkbench — operations ledger queue", () => {
  it("adds notification risk items without dropping club readiness items", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedItemId: "notification-club-ready",
      notificationSnapshot,
    });

    expect(result.queueItems.map((item) => item.id)).toContain("notification-club-ready");
    expect(result.queueItems.map((item) => item.id)).toContain("club-club-ready");
    expect(result.selectedBrief?.item.id).toBe("notification-club-ready");
    expect(result.selectedBrief?.primaryAction.href).toBe("/admin/notifications?clubId=club-ready");
    expect(result.selectedBrief?.drillLinks).toContainEqual({
      label: "알림 운영",
      href: "/admin/notifications?clubId=club-ready",
    });
  });

  it("adds a partial failure item when notification snapshot cannot be read", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      notificationUnavailable: true,
    });

    const item = result.queueItems.find((candidate) => candidate.id === "partial-notifications");
    expect(item).toMatchObject({
      type: "partial-error",
      severity: "warn",
      primaryActionLabel: "알림 확인 불가",
    });
    expect(result.metrics.operationsWarningCount).toBeGreaterThanOrEqual(1);
  });

  it("treats AI disabled as an info item and failed AI jobs as critical work", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      aiDisabled: true,
      aiJobs: [
        {
          jobId: "job-failed",
          clubId: "club-ready",
          clubName: "Ready Club",
          sessionTitle: "7회차",
          status: "FAILED",
          errorCode: "PROVIDER_RATE_LIMITED",
          stale: false,
          startedAt: "2026-05-27T00:00:00Z",
        },
      ],
    });

    expect(result.queueItems.find((item) => item.id === "ai-disabled")).toMatchObject({
      type: "ai",
      severity: "info",
      primaryActionLabel: "AI 비활성",
    });
    expect(result.queueItems.find((item) => item.id === "ai-job-failed")).toMatchObject({
      type: "ai",
      severity: "critical",
      primaryActionLabel: "AI 실패",
    });
  });

  it("shows support role mutation limits in the selected brief", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      role: "SUPPORT",
      selectedItemId: "club-club-ready",
      selectedClubId: "club-ready",
    });

    expect(result.selectedBrief?.permissionNote).toBe("현재 역할은 변경 작업을 실행할 수 없습니다.");
    expect(result.selectedBrief?.primaryAction.disabled).toBe(true);
  });
});

describe("buildPlatformAdminWorkbench — closing risk queue", () => {
  it("adds closing risk items ahead of notification warnings and below publish blockers", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedItemId: "closing-risk-session-1",
      closingRisks: [{
        clubId: "club-ready",
        clubSlug: "ready-club",
        clubName: "Ready Club",
        sessionId: "session-1",
        sessionNumber: 12,
        bookTitle: "모던 자바스크립트",
        meetingDate: "2026-06-20",
        overallState: "BLOCKED",
        primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
        hostClosingHref: "/clubs/ready-club/app/host/sessions/session-1/closing",
      }],
      notificationSnapshot,
    });

    expect(result.queueItems.map((item) => item.id)).toContain("closing-risk-session-1");
    expect(result.queueItems.find((item) => item.id === "closing-risk-session-1")).toMatchObject({
      type: "closing-risk",
      severity: "critical",
      name: "Ready Club · No.12",
      slug: "ready-club",
      reason: "모던 자바스크립트 · 피드백 문서 다시 확인",
      primaryActionLabel: "호스트 클로징 보드",
      href: "/clubs/ready-club/app/host/sessions/session-1/closing",
    });
    expect(result.selectedBrief?.item.id).toBe("closing-risk-session-1");
    expect(result.selectedBrief?.primaryAction.href).toBe("/clubs/ready-club/app/host/sessions/session-1/closing");
    expect(result.selectedBrief?.closingRisk).toMatchObject({
      sessionId: "session-1",
      stateLabel: "차단",
      blockerLabel: "피드백 문서 다시 확인",
    });
  });

  it("adds age and repeat labels to closing-risk queue items", () => {
    const result = buildPlatformAdminWorkbench({
      role: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      selectedClubId: null,
      clubs: [],
      domains: [],
      closingRisks: [{
        clubId: "club-1",
        clubSlug: "reading-sai",
        clubName: "읽는사이",
        sessionId: "session-7",
        sessionNumber: 7,
        bookTitle: "페인트",
        meetingDate: "2026-06-18",
        overallState: "BLOCKED",
        primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
        hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
        ageDays: 3,
        occurrenceCount: 2,
        ledgerState: "ACTIVE",
      }],
    });

    const item = result.queueItems.find((candidate) => candidate.id === "closing-risk-session-7");
    expect(item?.reason).toBe("페인트 · 피드백 문서 다시 확인 · 3일째 차단 · 반복 2회");
    expect(item?.badges).toContain("3일째 차단");
    expect(result.selectedBrief?.closingRisk).toMatchObject({
      ageLabel: "3일째 차단",
      occurrenceLabel: "반복 2회",
      trackingLabel: "추적 중",
    });
  });

  it("adds tracking-unavailable copy without raw errors", () => {
    const result = buildPlatformAdminWorkbench({
      role: "OWNER",
      activeClubCount: 0,
      domainActionRequiredCount: 0,
      selectedClubId: null,
      clubs: [],
      domains: [],
      closingRisks: [{
        clubId: "club-1",
        clubSlug: "reading-sai",
        clubName: "읽는사이",
        sessionId: "session-7",
        sessionNumber: 7,
        bookTitle: "페인트",
        meetingDate: "2026-06-18",
        overallState: "BLOCKED",
        primaryBlocker: "RAW_PRIVATE_STACK_TRACE",
        hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
        ledgerState: "UNTRACKED",
      }],
      closingRisksUnavailable: true,
    });

    expect(result.queueItems.some((item) => item.reason.includes("RAW_PRIVATE_STACK_TRACE"))).toBe(false);
    expect(result.queueItems.find((item) => item.id === "closing-risk-session-7")?.badges).toContain("추적 상태 확인 불가");
  });

  it("uses safe fallback labels for unknown closing risk codes", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedItemId: "closing-risk-session-unknown",
      closingRisks: [{
        clubId: "club-ready",
        clubSlug: "ready-club",
        clubName: "Ready Club",
        sessionId: "session-unknown",
        sessionNumber: 13,
        bookTitle: "Unknown Codes",
        meetingDate: "2026-06-20",
        overallState: "RAW_PRIVATE_STATE",
        primaryBlocker: "RAW_PRIVATE_BLOCKER",
        hostClosingHref: "/clubs/ready-club/app/host/sessions/session-unknown/closing",
      }],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("확인 필요");
    expect(serialized).not.toContain("RAW_PRIVATE_STATE");
    expect(serialized).not.toContain("RAW_PRIVATE_BLOCKER");
  });

  it("adds a partial failure item when closing risk query cannot be read", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      closingRisksUnavailable: true,
    });

    expect(result.queueItems.find((item) => item.id === "partial-closing-risks")).toMatchObject({
      type: "partial-error",
      severity: "warn",
      primaryActionLabel: "클로징 확인 불가",
    });
  });
});
