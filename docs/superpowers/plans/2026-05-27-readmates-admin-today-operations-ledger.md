# ReadMates Admin Today Operations Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/today` as a platform operations ledger that prioritizes today's club, domain, notification, and AI operations work.

**Architecture:** Keep the existing route-first frontend boundary. `admin-today-route.tsx` owns TanStack Query composition and URL state, `platform-admin-workbench-model.ts` owns pure queue/brief calculation, and `ui` modules render from props and callbacks only. No new server endpoint is required for the first pass; existing admin summary, clubs, notification snapshot, and AI Ops queries are combined.

**Tech Stack:** React, Vite, React Router 7, TanStack Query v5, Vitest, Testing Library, CSS in `front/src/styles/globals.css`.

---

## Source Documents

- Approved design: `docs/superpowers/specs/2026-05-27-readmates-admin-today-operations-ledger-design.md`
- Frontend guide: `docs/agents/front.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`
- Architecture source of truth: `docs/development/architecture.md`

## Scope Check

This plan is frontend-only. It does not add server API routes, database migrations, or BFF behavior. It changes the `/admin/today` composition and presentation using existing platform-admin data contracts.

## File Structure

- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
  - Add typed queue item kinds for club, notification, AI, and partial data failures.
  - Add selected item brief calculation by queue item id.
  - Add notification snapshot and AI query state inputs.
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
  - Cover queue ordering, notification risk mapping, AI disabled/error mapping, selected item fallback, and SUPPORT affordances.
- Create: `front/features/platform-admin/ui/admin-today-ledger.tsx`
  - Shell component for the two-column desktop and single-column mobile ledger.
- Create: `front/features/platform-admin/ui/admin-work-queue.tsx`
  - Queue list component that renders all item kinds and emits selected item ids.
- Create: `front/features/platform-admin/ui/admin-selected-brief.tsx`
  - Selected item brief component with primary action, drill links, checklist, and permission explanation.
- Create: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`
  - UI tests for empty, partial-failure, support role, and queue selection states.
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
  - Compose summary/clubs/notification/AI queries without non-null assertions.
  - Persist selected queue item in `?selected=`.
  - Pass query partial-failure state to the model.
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
  - Cover route query composition with seeded data and notification risk data.
- Modify: `front/src/styles/globals.css`
  - Add today-ledger layout, queue, brief, risk badge, and mobile responsive styles.
- Modify: `CHANGELOG.md`
  - Add an `Unreleased` line for the admin today ledger productization.

## Task 1: Workbench Model Queue Contract

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`

- [ ] **Step 1: Add failing model tests for mixed queue items**

Append these tests to `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`.

```ts
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
```

- [ ] **Step 2: Run focused model tests and verify they fail**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts -t "operations ledger queue"
```

Expected: FAIL because `selectedItemId`, `notificationSnapshot`, `notificationUnavailable`, `operationsWarningCount`, `selectedBrief`, and partial-error queue items do not exist yet.

- [ ] **Step 3: Replace the workbench queue types**

In `front/features/platform-admin/model/platform-admin-workbench-model.ts`, add these imports and replace the queue/brief-related type definitions from `PlatformAdminWorkbenchInput` through `PlatformAdminWorkbenchView`.

```ts
import type { AdminNotificationOperationsSnapshot } from "@/features/platform-admin/model/platform-admin-notifications-model";

export type WorkQueueSeverity =
  | "blocked"
  | "critical"
  | "attention"
  | "warn"
  | "ready"
  | "stable"
  | "info";

export type PlatformAdminWorkbenchInput = {
  role: PlatformAdminRole;
  activeClubCount: number;
  domainActionRequiredCount: number;
  selectedClubId: string | null;
  selectedItemId?: string | null;
  clubs: PlatformAdminWorkbenchClub[];
  domains: PlatformAdminWorkbenchDomain[];
  notificationSnapshot?: AdminNotificationOperationsSnapshot | null;
  notificationUnavailable?: boolean;
  aiJobs?: ReadonlyArray<PlatformAdminAiOpsJobInput>;
  aiDisabled?: boolean;
  aiUnavailable?: boolean;
};

export type PlatformAdminPermissionView = {
  canCreateClub: boolean;
  canUpdateClub: boolean;
  canManageDomains: boolean;
  canCreateSupportGrant: boolean;
  canRevokeSupportGrant: boolean;
  canForceCancelAiJob: boolean;
};

export type PublishChecklistItem = {
  id: "public-info" | "first-host" | "lifecycle" | "domains";
  label: string;
  passed: boolean;
  detail: string;
};

export type SelectedAdminAction = {
  kind:
    | "make-public"
    | "make-private"
    | "check-domain"
    | "open-notifications"
    | "open-ai-ops"
    | "open-detail"
    | "none";
  label: string;
  href: string;
  disabled: boolean;
  reason: string | null;
};

export type WorkbenchQueueItemType = "club" | "notification" | "ai" | "partial-error";

export type WorkbenchQueueItem = {
  id: string;
  type: WorkbenchQueueItemType;
  clubId: string | null;
  slug: string;
  name: string;
  severity: WorkQueueSeverity;
  reason: string;
  primaryActionLabel: string;
  badges: string[];
  sortRank: number;
  href: string;
};

export type PlatformAdminSelectedBrief = {
  item: WorkbenchQueueItem;
  club: PlatformAdminWorkbenchClub | null;
  domains: PlatformAdminWorkbenchDomain[];
  publishChecklist: PublishChecklistItem[];
  primaryAction: SelectedAdminAction;
  drillLinks: Array<{ label: string; href: string }>;
  permissionNote: string | null;
};

export type PlatformAdminWorkbenchView = {
  permissions: PlatformAdminPermissionView;
  metrics: {
    platformRole: PlatformAdminRole;
    activeClubCount: number;
    needsActionCount: number;
    domainActionRequiredCount: number;
    publishReadyCount: number;
    operationsWarningCount: number;
  };
  queueItems: WorkbenchQueueItem[];
  selectedBrief: PlatformAdminSelectedBrief | null;
};
```

- [ ] **Step 4: Implement the model builder and helper functions**

Replace `buildPlatformAdminWorkbench`, `buildAiQueueItem`, `permissionsForRole`, `buildQueueItem`, and `selectClubId` with this implementation. Keep the existing `buildPublishChecklist`, `buildPrimaryAction`, `groupDomainsByClub`, and `hostStateDetail` functions, then adapt `buildPrimaryAction` in the next step.

```ts
export function buildPlatformAdminWorkbench(input: PlatformAdminWorkbenchInput): PlatformAdminWorkbenchView {
  const permissions = permissionsForRole(input.role);
  const domainsByClub = groupDomainsByClub(input.domains);
  const clubItems = input.clubs
    .map((club) => buildClubQueueItem(club, domainsByClub.get(club.clubId) ?? []))
    .sort(compareQueueItems);
  const notificationItems = buildNotificationQueueItems(input.notificationSnapshot, input.notificationUnavailable ?? false);
  const aiItems = buildAiQueueItems(input.aiJobs ?? [], {
    disabled: input.aiDisabled ?? false,
    unavailable: input.aiUnavailable ?? false,
  });
  const queueItems = [...clubItems, ...notificationItems, ...aiItems].sort(compareQueueItems);
  const selectedItem = selectQueueItem(input.selectedItemId, input.selectedClubId, queueItems);
  const selectedBrief = selectedItem
    ? buildSelectedBrief(selectedItem, input.clubs, domainsByClub, permissions)
    : null;

  return {
    permissions,
    metrics: {
      platformRole: input.role,
      activeClubCount: input.activeClubCount,
      needsActionCount: queueItems.filter((item) =>
        item.severity === "blocked" || item.severity === "critical" || item.severity === "attention"
      ).length,
      domainActionRequiredCount: input.domainActionRequiredCount,
      publishReadyCount: queueItems.filter((item) => item.primaryActionLabel === "공개 전환").length,
      operationsWarningCount: queueItems.filter((item) => item.severity === "critical" || item.severity === "warn").length,
    },
    queueItems,
    selectedBrief,
  };
}

function compareQueueItems(a: WorkbenchQueueItem, b: WorkbenchQueueItem): number {
  return a.sortRank - b.sortRank || a.name.localeCompare(b.name, "ko-KR") || a.id.localeCompare(b.id);
}

function buildClubQueueItem(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): WorkbenchQueueItem {
  const checklist = buildPublishChecklist(club, domains);
  const failedDomain = domains.find((domain) => domain.status === "FAILED");
  const actionRequiredDomain = domains.find((domain) => domain.status === "ACTION_REQUIRED");
  const badges = [club.status, club.publicVisibility, `host ${club.firstHostOnboardingState}`];

  if (failedDomain) {
    return {
      id: `club-${club.clubId}`,
      type: "club",
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "attention",
      reason: `${failedDomain.hostname} 도메인 확인이 실패했습니다.`,
      primaryActionLabel: "도메인 확인",
      badges: [...badges, "domain FAILED"],
      sortRank: 20,
      href: `/admin/clubs/${club.clubId}`,
    };
  }

  if (actionRequiredDomain) {
    return {
      id: `club-${club.clubId}`,
      type: "club",
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "attention",
      reason: `${actionRequiredDomain.hostname} 연결 작업이 필요합니다.`,
      primaryActionLabel: "도메인 확인",
      badges: [...badges, "domain ACTION_REQUIRED"],
      sortRank: 30,
      href: `/admin/clubs/${club.clubId}`,
    };
  }

  if (!checklist.every((item) => item.passed)) {
    return {
      id: `club-${club.clubId}`,
      type: "club",
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "blocked",
      reason: checklist.find((item) => !item.passed)?.detail ?? "공개 준비 조건을 확인해야 합니다.",
      primaryActionLabel: "체크리스트",
      badges,
      sortRank: 10,
      href: `/admin/clubs/${club.clubId}`,
    };
  }

  if (club.publicVisibility === "PRIVATE") {
    return {
      id: `club-${club.clubId}`,
      type: "club",
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "ready",
      reason: "공개 전환 조건을 충족했습니다.",
      primaryActionLabel: "공개 전환",
      badges,
      sortRank: 40,
      href: `/admin/clubs/${club.clubId}`,
    };
  }

  return {
    id: `club-${club.clubId}`,
    type: "club",
    clubId: club.clubId,
    slug: club.slug,
    name: club.name,
    severity: "stable",
    reason: "현재 공개 상태입니다.",
    primaryActionLabel: "검토",
    badges,
    sortRank: 70,
    href: `/admin/clubs/${club.clubId}`,
  };
}

function buildNotificationQueueItems(
  snapshot: AdminNotificationOperationsSnapshot | null | undefined,
  unavailable: boolean,
): WorkbenchQueueItem[] {
  if (unavailable) {
    return [{
      id: "partial-notifications",
      type: "partial-error",
      clubId: null,
      slug: "platform",
      name: "알림 운영",
      severity: "warn",
      reason: "알림 운영 snapshot을 확인하지 못했습니다.",
      primaryActionLabel: "알림 확인 불가",
      badges: ["notifications unavailable"],
      sortRank: 35,
      href: "/admin/notifications",
    }];
  }

  if (!snapshot) return [];

  const clubItems = snapshot.clubHealth
    .filter((club) => club.failed > 0 || club.dead > 0)
    .map((club): WorkbenchQueueItem => ({
      id: `notification-${club.clubId}`,
      type: "notification",
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: club.dead > 0 ? "critical" : "warn",
      reason: `알림 실패 ${club.failed}건 · dead ${club.dead}건`,
      primaryActionLabel: "알림 진단",
      badges: ["notifications", club.dead > 0 ? "DEAD" : "FAILED"],
      sortRank: club.dead > 0 ? 15 : 32,
      href: `/admin/notifications?clubId=${encodeURIComponent(club.clubId)}`,
    }));

  const platformBacklog =
    snapshot.outboxSummary.dead +
    snapshot.outboxSummary.failed +
    snapshot.deliverySummary.dead +
    snapshot.deliverySummary.failed +
    snapshot.relaySummary.stalePublishing +
    snapshot.relaySummary.staleSending;

  if (platformBacklog === 0) return clubItems;

  return [
    ...clubItems,
    {
      id: "notification-platform",
      type: "notification",
      clubId: null,
      slug: "platform",
      name: "알림 outbox",
      severity: snapshot.outboxSummary.dead + snapshot.deliverySummary.dead > 0 ? "critical" : "warn",
      reason: `실패/정체 신호 ${platformBacklog}건`,
      primaryActionLabel: "알림 운영",
      badges: ["outbox", "delivery"],
      sortRank: 18,
      href: "/admin/notifications?focus=outbox_backlog",
    },
  ];
}

function buildAiQueueItems(
  jobs: ReadonlyArray<PlatformAdminAiOpsJobInput>,
  state: { disabled: boolean; unavailable: boolean },
): WorkbenchQueueItem[] {
  const items: WorkbenchQueueItem[] = [];

  if (state.disabled) {
    items.push({
      id: "ai-disabled",
      type: "ai",
      clubId: null,
      slug: "platform",
      name: "AI Ops",
      severity: "info",
      reason: "AI generation이 비활성 상태입니다.",
      primaryActionLabel: "AI 비활성",
      badges: ["AI_DISABLED"],
      sortRank: 90,
      href: "/admin/ai-ops",
    });
  }

  if (state.unavailable) {
    items.push({
      id: "partial-ai",
      type: "partial-error",
      clubId: null,
      slug: "platform",
      name: "AI Ops",
      severity: "warn",
      reason: "AI Ops 작업 목록을 확인하지 못했습니다.",
      primaryActionLabel: "AI 확인 불가",
      badges: ["ai unavailable"],
      sortRank: 36,
      href: "/admin/ai-ops",
    });
  }

  for (const job of jobs) {
    const failed = job.status === "FAILED";
    const stale = job.stale;
    if (!failed && !stale) continue;
    items.push({
      id: `ai-${job.jobId}`,
      type: "ai",
      clubId: job.clubId,
      slug: job.clubId,
      name: job.clubName,
      severity: failed ? "critical" : "warn",
      reason: `${job.clubName} · ${job.sessionTitle}`,
      primaryActionLabel: failed ? "AI 실패" : "AI stale",
      badges: [failed ? "FAILED" : "STALE", job.errorCode ?? "no_error_code"],
      sortRank: failed ? 16 : 34,
      href: `/admin/ai-ops?clubId=${encodeURIComponent(job.clubId)}`,
    });
  }

  return items;
}

function permissionsForRole(role: PlatformAdminRole): PlatformAdminPermissionView {
  const canOperate = role === "OWNER" || role === "OPERATOR";
  return {
    canCreateClub: canOperate,
    canUpdateClub: canOperate,
    canManageDomains: canOperate,
    canCreateSupportGrant: role === "OWNER",
    canRevokeSupportGrant: role === "OWNER",
    canForceCancelAiJob: canOperate,
  };
}
```

- [ ] **Step 5: Add selected brief helpers**

In the same model file, replace the old `buildPrimaryAction` return type usage and add these helpers before `groupDomainsByClub`.

```ts
function buildSelectedBrief(
  item: WorkbenchQueueItem,
  clubs: PlatformAdminWorkbenchClub[],
  domainsByClub: Map<string, PlatformAdminWorkbenchDomain[]>,
  permissions: PlatformAdminPermissionView,
): PlatformAdminSelectedBrief {
  const club = item.clubId ? clubs.find((candidate) => candidate.clubId === item.clubId) ?? null : null;
  const domains = club ? domainsByClub.get(club.clubId) ?? [] : [];
  const publishChecklist = club ? buildPublishChecklist(club, domains) : [];
  const primaryAction = buildSelectedAction(item, club, domains, permissions);
  return {
    item,
    club,
    domains,
    publishChecklist,
    primaryAction,
    drillLinks: buildDrillLinks(item, club),
    permissionNote: primaryAction.disabled && primaryAction.reason === "현재 역할은 변경 작업을 실행할 수 없습니다."
      ? primaryAction.reason
      : null,
  };
}

function buildSelectedAction(
  item: WorkbenchQueueItem,
  club: PlatformAdminWorkbenchClub | null,
  domains: PlatformAdminWorkbenchDomain[],
  permissions: PlatformAdminPermissionView,
): SelectedAdminAction {
  if (item.type === "club" && club) {
    const action = buildClubVisibilityAction(club, domains);
    if (!permissions.canUpdateClub && action.kind !== "none") {
      return { ...action, disabled: true, reason: "현재 역할은 변경 작업을 실행할 수 없습니다." };
    }
    return action;
  }

  if (item.type === "notification") {
    return {
      kind: "open-notifications",
      label: "알림 운영 열기",
      href: item.href,
      disabled: false,
      reason: null,
    };
  }

  if (item.type === "ai") {
    return {
      kind: "open-ai-ops",
      label: "AI Ops 열기",
      href: item.href,
      disabled: false,
      reason: null,
    };
  }

  return {
    kind: "open-detail",
    label: "상세 화면 열기",
    href: item.href,
    disabled: false,
    reason: null,
  };
}

function buildClubVisibilityAction(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): SelectedAdminAction {
  if (club.status === "SUSPENDED" || club.status === "ARCHIVED") {
    return {
      kind: "none",
      label: "전환 불가",
      href: `/admin/clubs/${club.clubId}`,
      disabled: true,
      reason: club.status === "ARCHIVED"
        ? "보관된 클럽은 공개/비공개 전환 대상이 아닙니다."
        : "정지된 클럽은 공개/비공개 전환 대상이 아닙니다.",
    };
  }

  const checklist = buildPublishChecklist(club, domains);
  const failed = checklist.find((candidate) => !candidate.passed);

  if (club.publicVisibility === "PUBLIC") {
    return {
      kind: "make-private",
      label: "비공개 전환",
      href: `/admin/clubs/${club.clubId}`,
      disabled: false,
      reason: null,
    };
  }

  if (failed) {
    return {
      kind: "make-public",
      label: "공개 전환",
      href: `/admin/clubs/${club.clubId}`,
      disabled: true,
      reason: failed.detail,
    };
  }

  return {
    kind: "make-public",
    label: "공개 전환",
    href: `/admin/clubs/${club.clubId}`,
    disabled: false,
    reason: null,
  };
}

function buildDrillLinks(
  item: WorkbenchQueueItem,
  club: PlatformAdminWorkbenchClub | null,
): Array<{ label: string; href: string }> {
  const links: Array<{ label: string; href: string }> = [];
  if (club) {
    links.push({ label: "클럽 상세", href: `/admin/clubs/${club.clubId}` });
  }
  if (item.type === "notification") {
    links.push({ label: "알림 운영", href: item.href });
  }
  if (item.type === "ai") {
    links.push({ label: "AI Ops", href: item.href });
  }
  links.push({ label: "감사 로그", href: club ? `/admin/audit?clubId=${club.clubId}` : "/admin/audit" });
  return links;
}

function selectQueueItem(
  requestedItemId: string | null | undefined,
  requestedClubId: string | null,
  queueItems: WorkbenchQueueItem[],
): WorkbenchQueueItem | null {
  if (requestedItemId) {
    const byId = queueItems.find((item) => item.id === requestedItemId);
    if (byId) return byId;
  }
  if (requestedClubId) {
    const byClub = queueItems.find((item) => item.type === "club" && item.clubId === requestedClubId);
    if (byClub) return byClub;
  }
  return queueItems[0] ?? null;
}
```

Remove the old `SelectedClubAction`, `PlatformAdminWorkQueueItem`, `WorkbenchClubQueueItem`, `WorkbenchAiQueueItem`, `PlatformAdminSelectedClubBrief`, `buildAiQueueItem`, `buildQueueItem`, `buildPrimaryAction`, and `selectClubId` definitions after the new functions compile.

- [ ] **Step 6: Run the focused model tests and verify they pass**

Before running, update the existing assertions in `front/features/platform-admin/model/platform-admin-workbench-model.test.ts` so they use the new queue ids and `selectedBrief` shape:

```ts
expect(workbench.queueItems.map((item) => item.id)).toEqual([
  "club-club-host-missing",
  "club-club-public",
  "club-club-ready",
]);
expect(workbench.selectedBrief?.club?.clubId).toBe("club-host-missing");

expect(workbench.selectedBrief?.publishChecklist.every((item) => item.passed)).toBe(true);
expect(workbench.selectedBrief?.primaryAction).toEqual({
  kind: "make-public",
  label: "공개 전환",
  href: "/admin/clubs/club-ready",
  disabled: false,
  reason: null,
});

expect(workbench.selectedBrief?.publishChecklist).toContainEqual({
  id: "first-host",
  label: "첫 호스트 지정",
  passed: false,
  detail: "첫 호스트가 아직 없습니다.",
});
expect(workbench.selectedBrief?.primaryAction.disabled).toBe(true);

expect(archived.selectedBrief?.primaryAction.kind).toBe("none");
expect(archived.selectedBrief?.primaryAction.disabled).toBe(true);

expect(workbench.selectedBrief?.club?.clubId).toBe("club-host-missing");
```

In the AI disabled test, assert the disabled platform item and the failed job separately:

```ts
const disabledItem = result.queueItems.find((item) => item.id === "ai-disabled");
const failedItem = result.queueItems.find((item) => item.id === "ai-job-3");
expect(disabledItem?.severity).toBe("info");
expect(failedItem?.severity).toBe("critical");
```

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts
```

Expected: PASS for all workbench model tests.

- [ ] **Step 7: Commit the model contract**

Run:

```bash
git add front/features/platform-admin/model/platform-admin-workbench-model.ts front/features/platform-admin/model/platform-admin-workbench-model.test.ts
git commit -m "feat(admin): model today operations ledger queue"
```

## Task 2: Today Ledger UI Components

**Files:**
- Create: `front/features/platform-admin/ui/admin-today-ledger.tsx`
- Create: `front/features/platform-admin/ui/admin-work-queue.tsx`
- Create: `front/features/platform-admin/ui/admin-selected-brief.tsx`
- Create: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`

- [ ] **Step 1: Add failing UI tests**

Create `front/features/platform-admin/ui/admin-today-ledger.test.tsx`.

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminTodayLedger } from "@/features/platform-admin/ui/admin-today-ledger";
import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";

const baseWorkbench: PlatformAdminWorkbenchView = {
  permissions: {
    canCreateClub: true,
    canUpdateClub: true,
    canManageDomains: true,
    canCreateSupportGrant: true,
    canRevokeSupportGrant: true,
    canForceCancelAiJob: true,
  },
  metrics: {
    platformRole: "OWNER",
    activeClubCount: 2,
    needsActionCount: 2,
    domainActionRequiredCount: 1,
    publishReadyCount: 1,
    operationsWarningCount: 1,
  },
  queueItems: [
    {
      id: "club-club-ready",
      type: "club",
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      severity: "ready",
      reason: "공개 전환 조건을 충족했습니다.",
      primaryActionLabel: "공개 전환",
      badges: ["ACTIVE", "PRIVATE"],
      sortRank: 40,
      href: "/admin/clubs/club-ready",
    },
    {
      id: "notification-platform",
      type: "notification",
      clubId: null,
      slug: "platform",
      name: "알림 outbox",
      severity: "critical",
      reason: "실패/정체 신호 3건",
      primaryActionLabel: "알림 운영",
      badges: ["outbox", "delivery"],
      sortRank: 18,
      href: "/admin/notifications?focus=outbox_backlog",
    },
  ],
  selectedBrief: {
    item: {
      id: "notification-platform",
      type: "notification",
      clubId: null,
      slug: "platform",
      name: "알림 outbox",
      severity: "critical",
      reason: "실패/정체 신호 3건",
      primaryActionLabel: "알림 운영",
      badges: ["outbox", "delivery"],
      sortRank: 18,
      href: "/admin/notifications?focus=outbox_backlog",
    },
    club: null,
    domains: [],
    publishChecklist: [],
    primaryAction: {
      kind: "open-notifications",
      label: "알림 운영 열기",
      href: "/admin/notifications?focus=outbox_backlog",
      disabled: false,
      reason: null,
    },
    drillLinks: [
      { label: "알림 운영", href: "/admin/notifications?focus=outbox_backlog" },
      { label: "감사 로그", href: "/admin/audit" },
    ],
    permissionNote: null,
  },
};

function renderLedger(workbench: PlatformAdminWorkbenchView = baseWorkbench, onSelectItem = vi.fn()) {
  return {
    onSelectItem,
    ...render(
      <MemoryRouter>
        <AdminTodayLedger workbench={workbench} selectedItemId={workbench.selectedBrief?.item.id ?? null} onSelectItem={onSelectItem} />
      </MemoryRouter>,
    ),
  };
}

describe("AdminTodayLedger", () => {
  it("renders the operations ledger summary, queue, and selected brief", () => {
    renderLedger();

    expect(screen.getByRole("heading", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getByText("조치 필요 2")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 작업 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선택 항목 브리프" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "알림 운영 열기" })).toHaveAttribute("href", "/admin/notifications?focus=outbox_backlog");
  });

  it("emits item ids when a queue row is selected", async () => {
    const user = userEvent.setup();
    const { onSelectItem } = renderLedger();

    await user.click(screen.getByRole("button", { name: /Ready Club/ }));

    expect(onSelectItem).toHaveBeenCalledWith("club-club-ready");
  });

  it("shows permission notes and disabled primary actions", () => {
    renderLedger({
      ...baseWorkbench,
      selectedBrief: {
        ...baseWorkbench.selectedBrief!,
        primaryAction: {
          kind: "make-public",
          label: "공개 전환",
          href: "/admin/clubs/club-ready",
          disabled: true,
          reason: "현재 역할은 변경 작업을 실행할 수 없습니다.",
        },
        permissionNote: "현재 역할은 변경 작업을 실행할 수 없습니다.",
      },
    });

    expect(screen.getByText("현재 역할은 변경 작업을 실행할 수 없습니다.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "공개 전환" })).toBeDisabled();
  });

  it("renders an honest empty state", () => {
    renderLedger({ ...baseWorkbench, queueItems: [], selectedBrief: null });

    const queue = screen.getByRole("region", { name: "운영 작업 큐" });
    expect(within(queue).getByText("오늘 처리할 플랫폼 작업이 없습니다.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run UI tests and verify they fail**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-ledger.test.tsx
```

Expected: FAIL because `AdminTodayLedger`, `AdminWorkQueue`, and `AdminSelectedBrief` do not exist.

- [ ] **Step 3: Create the queue component**

Create `front/features/platform-admin/ui/admin-work-queue.tsx`.

```tsx
import type { WorkbenchQueueItem } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  items: WorkbenchQueueItem[];
  selectedItemId: string | null;
  onSelectItem: (itemId: string) => void;
};

const severityLabel: Record<WorkbenchQueueItem["severity"], string> = {
  blocked: "막힘",
  critical: "긴급",
  attention: "확인",
  warn: "경고",
  ready: "준비",
  stable: "안정",
  info: "정보",
};

export function AdminWorkQueue({ items, selectedItemId, onSelectItem }: Props) {
  return (
    <section className="admin-work-queue" aria-label="운영 작업 큐">
      <div className="admin-work-queue__header">
        <p className="eyebrow">Operations ledger</p>
        <h2 className="h3 editorial">운영 작업 큐</h2>
      </div>
      {items.length === 0 ? (
        <p className="muted admin-work-queue__empty">오늘 처리할 플랫폼 작업이 없습니다.</p>
      ) : (
        <div className="admin-work-queue__list">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              className="admin-work-queue__row"
              data-severity={item.severity}
              aria-pressed={item.id === selectedItemId}
              onClick={() => onSelectItem(item.id)}
            >
              <span className="admin-work-queue__main">
                <span className="admin-work-queue__title">
                  <strong>{item.name}</strong>
                  <span>{item.slug}</span>
                </span>
                <span className="admin-work-queue__reason">{item.reason}</span>
              </span>
              <span className="admin-work-queue__meta">
                <span className="admin-work-queue__severity">{severityLabel[item.severity]}</span>
                <span className="admin-work-queue__action">{item.primaryActionLabel}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create the selected brief component**

Create `front/features/platform-admin/ui/admin-selected-brief.tsx`.

```tsx
import { Link } from "react-router-dom";
import type { PlatformAdminSelectedBrief } from "@/features/platform-admin/model/platform-admin-workbench-model";

type Props = {
  brief: PlatformAdminSelectedBrief | null;
};

export function AdminSelectedBrief({ brief }: Props) {
  if (!brief) {
    return (
      <section className="admin-selected-brief" aria-label="선택 항목 브리프">
        <p className="muted">선택할 작업이 없습니다.</p>
      </section>
    );
  }

  const primary = brief.primaryAction;
  return (
    <section className="admin-selected-brief" aria-label="선택 항목 브리프">
      <div className="admin-selected-brief__header">
        <p className="eyebrow">Selected brief</p>
        <h2 className="h3 editorial">{brief.item.name}</h2>
        <p className="tiny muted">
          {brief.item.slug} · {brief.item.primaryActionLabel} · {brief.item.reason}
        </p>
      </div>

      {brief.permissionNote ? (
        <p className="admin-selected-brief__notice">{brief.permissionNote}</p>
      ) : null}

      {brief.publishChecklist.length > 0 ? (
        <div className="admin-selected-brief__checklist" aria-label="공개 준비 체크리스트">
          {brief.publishChecklist.map((item) => (
            <div className="admin-selected-brief__check" data-state={item.passed ? "passed" : "blocked"} key={item.id}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      ) : null}

      {primary.kind === "make-public" || primary.kind === "make-private" ? (
        <button type="button" className="btn btn-primary btn-sm" disabled={primary.disabled}>
          {primary.label}
        </button>
      ) : (
        <Link className="btn btn-primary btn-sm" to={primary.href} aria-disabled={primary.disabled ? "true" : undefined}>
          {primary.label}
        </Link>
      )}

      {primary.reason && !brief.permissionNote ? (
        <p className="tiny muted">{primary.reason}</p>
      ) : null}

      <div className="admin-selected-brief__links" aria-label="관련 화면">
        {brief.drillLinks.map((link) => (
          <Link key={`${link.label}:${link.href}`} to={link.href} className="admin-selected-brief__link">
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Create the ledger shell component**

Create `front/features/platform-admin/ui/admin-today-ledger.tsx`.

```tsx
import type { PlatformAdminWorkbenchView } from "@/features/platform-admin/model/platform-admin-workbench-model";
import { AdminSelectedBrief } from "@/features/platform-admin/ui/admin-selected-brief";
import { AdminWorkQueue } from "@/features/platform-admin/ui/admin-work-queue";

type Props = {
  workbench: PlatformAdminWorkbenchView;
  selectedItemId: string | null;
  filterLabel?: string | null;
  onClearFilter?: () => void;
  onSelectItem: (itemId: string) => void;
};

export function AdminTodayLedger({
  workbench,
  selectedItemId,
  filterLabel = null,
  onClearFilter,
  onSelectItem,
}: Props) {
  return (
    <section className="admin-today-ledger" aria-labelledby="admin-today-title">
      <header className="admin-today-ledger__header">
        <div>
          <p className="eyebrow">Platform operations</p>
          <h1 id="admin-today-title" className="h1 editorial">오늘 할 일</h1>
          <p className="admin-today-ledger__lede">
            공개 준비, 도메인 조치, 알림 실패, AI 작업 이상을 오늘 처리할 순서로 정리합니다.
          </p>
        </div>
        <div className="admin-today-ledger__metrics" aria-label="오늘 운영 요약">
          <span>조치 필요 {workbench.metrics.needsActionCount}</span>
          <span>공개 준비 {workbench.metrics.publishReadyCount}</span>
          <span>운영 경고 {workbench.metrics.operationsWarningCount}</span>
        </div>
      </header>

      {filterLabel ? (
        <p className="admin-today-ledger__filter">
          필터: {filterLabel}
          {onClearFilter ? (
            <button type="button" onClick={onClearFilter}>
              해제
            </button>
          ) : null}
        </p>
      ) : null}

      <div className="admin-today-ledger__columns">
        <AdminWorkQueue items={workbench.queueItems} selectedItemId={selectedItemId} onSelectItem={onSelectItem} />
        <AdminSelectedBrief brief={workbench.selectedBrief} />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run UI tests and verify they pass**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-ledger.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit the UI components**

Run:

```bash
git add front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-work-queue.tsx front/features/platform-admin/ui/admin-selected-brief.tsx front/features/platform-admin/ui/admin-today-ledger.test.tsx
git commit -m "feat(admin): add today ledger UI"
```

## Task 3: Route Query Composition And Partial Failure Handling

**Files:**
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`

- [ ] **Step 1: Replace the route test with seeded query coverage**

Replace `front/features/platform-admin/route/admin-today-route.test.tsx` with this test file.

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminNotificationSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminTodayRoute } from "./admin-today-route";

function renderRoute(client: QueryClient, initialEntry = "/admin/today") {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminTodayRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seededClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 1,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, {
    items: [{
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
    }],
  });
  queryClient.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, {
    generatedAt: "2026-05-27T00:00:00Z",
    outboxSummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 1 },
    deliverySummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 1 },
    relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
    failureClusters: [],
    clubHealth: [],
    recentManualDispatches: [],
  });
  queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, {
    activeJobCount: 0,
    failedLast24h: 0,
    monthToDateCostEstimateUsd: "0.0000",
    failureCodes: [],
    providerCosts: [],
    staleCandidateCount: 0,
  });
  queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [], nextCursor: null });
  return queryClient;
}

describe("AdminTodayRoute", () => {
  it("renders the operations ledger from seeded admin queries", () => {
    renderRoute(seededClient(), "/admin/today?selected=club-club-ready");

    expect(screen.getByRole("heading", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 작업 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선택 항목 브리프" })).toBeInTheDocument();
    expect(screen.getByText("Ready Club")).toBeInTheDocument();
  });

  it("renders notification risk from the notification snapshot", () => {
    const client = seededClient();
    client.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, {
      generatedAt: "2026-05-27T00:00:00Z",
      outboxSummary: { pending: 0, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 1 },
      deliverySummary: { pending: 0, active: 0, failed: 0, dead: 1, sentOrPublishedLast24h: 1 },
      relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
      failureClusters: [],
      clubHealth: [{
        clubId: "club-ready",
        slug: "ready-club",
        name: "Ready Club",
        pending: 0,
        failed: 1,
        dead: 1,
        lastSuccessAt: null,
      }],
      recentManualDispatches: [],
    });

    renderRoute(client);

    expect(screen.getByText("Ready Club")).toBeInTheDocument();
    expect(screen.getByText(/알림 실패 1건/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx
```

Expected: FAIL because `AdminTodayRoute` still renders old `PlatformAdminWorkQueue` / `ClubOperationsBrief` props and does not load notification snapshot.

- [ ] **Step 3: Replace the route implementation**

Replace `front/features/platform-admin/route/admin-today-route.tsx` with this implementation.

```tsx
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { isReadmatesApiError } from "@/shared/api/errors";
import { AdminTodayLedger } from "@/features/platform-admin/ui/admin-today-ledger";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
  type WorkbenchQueueItem,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import { platformAdminNotificationSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

export function AdminTodayRoute() {
  const summaryQuery = useQuery(platformAdminSummaryQuery());
  const clubsQuery = useQuery(platformAdminClubsQuery());
  const notificationQuery = useQuery(platformAdminNotificationSnapshotQuery());
  const aiSummaryQuery = useQuery(platformAdminAiOpsSummaryQuery());
  const aiJobsQuery = useQuery(platformAdminAiOpsJobsQuery());
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter");
  const selectedItemId = searchParams.get("selected");

  const summary = summaryQuery.data;
  const clubs = clubsQuery.data;

  if (summaryQuery.isLoading || clubsQuery.isLoading) {
    return <p className="admin-today-ledger__loading">오늘 할 일을 불러오는 중입니다.</p>;
  }

  if (summaryQuery.isError || clubsQuery.isError || !summary || !clubs) {
    return (
      <section className="admin-today-ledger" aria-labelledby="admin-today-title">
        <h1 id="admin-today-title" className="h1 editorial">오늘 할 일</h1>
        <p className="admin-today-ledger__error" role="alert">
          플랫폼 작업 큐를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.
        </p>
      </section>
    );
  }

  const input: PlatformAdminWorkbenchInput = {
    role: summary.platformRole,
    activeClubCount: summary.activeClubCount,
    domainActionRequiredCount: summary.domainActionRequiredCount,
    selectedClubId: null,
    selectedItemId,
    clubs: clubs.items.map((club) => ({
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      tagline: club.tagline,
      about: club.about,
      status: club.status,
      publicVisibility: club.publicVisibility,
      domainCount: club.domainCount,
      domainActionRequiredCount: club.domainActionRequiredCount,
      firstHostOnboardingState: club.firstHostOnboardingState,
    })),
    domains: (summary.domains ?? summary.domainsRequiringAction ?? []).map((domain) => ({
      id: domain.id,
      clubId: domain.clubId,
      hostname: domain.hostname,
      kind: domain.kind,
      status: domain.status,
      desiredState: domain.desiredState,
      manualAction: domain.manualAction,
      errorCode: domain.errorCode,
      isPrimary: domain.isPrimary,
      verifiedAt: domain.verifiedAt,
      lastCheckedAt: domain.lastCheckedAt,
    })),
    notificationSnapshot: notificationQuery.data ?? null,
    notificationUnavailable: notificationQuery.isError,
    aiJobs: (aiJobsQuery.data?.items ?? []).map((job) => ({
      jobId: job.jobId,
      clubId: job.club.clubId,
      clubName: job.club.name ?? job.club.slug ?? "클럽",
      sessionTitle: job.session.bookTitle ?? "세션",
      status: job.status,
      errorCode: job.errorCode,
      stale: job.staleCandidate,
      startedAt: job.createdAt,
    })),
    aiDisabled: isReadmatesApiError(aiSummaryQuery.error) && aiSummaryQuery.error.status === 503,
    aiUnavailable: aiSummaryQuery.isError && !(isReadmatesApiError(aiSummaryQuery.error) && aiSummaryQuery.error.status === 503),
  };
  const workbench = buildPlatformAdminWorkbench(input);
  const filteredItems = filterQueueItems(workbench.queueItems, filter);
  const filteredWorkbench = { ...workbench, queueItems: filteredItems };

  function handleSelectItem(itemId: string) {
    const next = new URLSearchParams(searchParams);
    next.set("selected", itemId);
    setSearchParams(next, { replace: true });
  }

  function clearFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    setSearchParams(next, { replace: true });
  }

  return (
    <AdminTodayLedger
      workbench={filteredWorkbench}
      selectedItemId={selectedItemId}
      filterLabel={filter ? filterLabel(filter) : null}
      onClearFilter={filter ? clearFilter : undefined}
      onSelectItem={handleSelectItem}
    />
  );
}

function filterQueueItems(items: ReadonlyArray<WorkbenchQueueItem>, filter: string | null): WorkbenchQueueItem[] {
  if (!filter) return [...items];
  return items.filter((item) => matchesFilter(item, filter));
}

function matchesFilter(item: WorkbenchQueueItem, filter: string): boolean {
  if (filter === "setup_required") return item.badges.some((badge) => badge === "SETUP_REQUIRED");
  if (filter === "ready_to_publish") return item.primaryActionLabel === "공개 전환";
  if (filter === "domain_action") return item.badges.some((badge) => badge.includes("FAILED") || badge.includes("ACTION_REQUIRED"));
  if (filter === "operations_warning") return item.severity === "critical" || item.severity === "warn";
  return true;
}

function filterLabel(filter: string): string {
  if (filter === "setup_required") return "조치 필요";
  if (filter === "ready_to_publish") return "공개 준비";
  if (filter === "domain_action") return "도메인 조치";
  if (filter === "operations_warning") return "운영 경고";
  return filter;
}
```

- [ ] **Step 4: Run route tests and verify they pass**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/route/admin-today-route.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run model and UI tests together**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/route/admin-today-route.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit the route composition**

Run:

```bash
git add front/features/platform-admin/route/admin-today-route.tsx front/features/platform-admin/route/admin-today-route.test.tsx
git commit -m "feat(admin): compose today operations queries"
```

## Task 4: Styling And Responsive Polish

**Files:**
- Modify: `front/src/styles/globals.css`
- Modify: `front/features/platform-admin/ui/admin-today-ledger.test.tsx`

- [ ] **Step 1: Add class-level regression assertions**

Append this test to `front/features/platform-admin/ui/admin-today-ledger.test.tsx`.

```tsx
it("uses stable class hooks for desktop and mobile responsive styling", () => {
  const { container } = renderLedger();

  expect(container.querySelector(".admin-today-ledger__columns")).toBeInTheDocument();
  expect(container.querySelector(".admin-work-queue__row")).toBeInTheDocument();
  expect(container.querySelector(".admin-selected-brief__links")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI tests and verify the new assertion passes before CSS**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-ledger.test.tsx -t "stable class hooks"
```

Expected: PASS. This locks the class hooks before adding CSS.

- [ ] **Step 3: Add CSS for the today ledger**

Append this CSS near the existing `.admin-today` and `.platform-admin-work-queue` styles in `front/src/styles/globals.css`.

```css
.admin-today-ledger {
  display: grid;
  gap: 18px;
}

.admin-today-ledger__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
}

.admin-today-ledger__lede {
  max-width: 720px;
  margin: 6px 0 0;
  color: var(--text-3);
}

.admin-today-ledger__metrics {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.admin-today-ledger__metrics span,
.admin-today-ledger__filter,
.admin-selected-brief__notice {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 8px 10px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 900;
}

.admin-today-ledger__filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
}

.admin-today-ledger__filter button {
  border: 0;
  background: transparent;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
}

.admin-today-ledger__columns {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
  gap: 18px;
  align-items: start;
}

.admin-work-queue,
.admin-selected-brief {
  display: grid;
  gap: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 16px;
}

.admin-work-queue__header,
.admin-selected-brief__header {
  display: grid;
  gap: 4px;
}

.admin-work-queue__list {
  display: grid;
  gap: 8px;
}

.admin-work-queue__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-raised);
  padding: 12px;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.admin-work-queue__row:hover,
.admin-work-queue__row:focus-visible,
.admin-work-queue__row[aria-pressed="true"] {
  border-color: var(--accent);
  outline: none;
}

.admin-work-queue__row[data-severity="critical"],
.admin-work-queue__row[data-severity="blocked"] {
  border-left: 4px solid var(--danger);
}

.admin-work-queue__row[data-severity="attention"],
.admin-work-queue__row[data-severity="warn"] {
  border-left: 4px solid var(--warn);
}

.admin-work-queue__row[data-severity="ready"] {
  border-left: 4px solid var(--accent);
}

.admin-work-queue__main,
.admin-work-queue__meta,
.admin-selected-brief__check,
.admin-selected-brief__links {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.admin-work-queue__title {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
}

.admin-work-queue__title span,
.admin-work-queue__reason {
  color: var(--text-3);
  font-size: 12px;
}

.admin-work-queue__meta {
  justify-items: end;
  align-content: start;
}

.admin-work-queue__severity,
.admin-work-queue__action,
.admin-selected-brief__link {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 7px;
  color: var(--text-2);
  font-size: 11px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
}

.admin-selected-brief__checklist {
  display: grid;
  gap: 8px;
}

.admin-selected-brief__check {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg-sub);
  padding: 10px;
}

.admin-selected-brief__check[data-state="blocked"] {
  border-color: var(--warn);
}

.admin-selected-brief__check span {
  color: var(--text-3);
  font-size: 12px;
}

.admin-selected-brief__links {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}

.admin-today-ledger__loading,
.admin-today-ledger__error,
.admin-work-queue__empty {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  padding: 16px;
}

.admin-today-ledger__error {
  color: var(--danger);
}

@media (max-width: 860px) {
  .admin-today-ledger__header {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-today-ledger__metrics {
    justify-content: flex-start;
  }

  .admin-today-ledger__columns,
  .admin-work-queue__row {
    grid-template-columns: 1fr;
  }

  .admin-work-queue__meta {
    justify-items: start;
  }
}
```

- [ ] **Step 4: Run UI tests after CSS**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/ui/admin-today-ledger.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit styling**

Run:

```bash
git add front/src/styles/globals.css front/features/platform-admin/ui/admin-today-ledger.test.tsx
git commit -m "style(admin): polish today operations ledger"
```

## Task 5: Release Note And Full Frontend Verification

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add the Unreleased CHANGELOG line**

Open `CHANGELOG.md`. Under the existing `Unreleased` section, add this line in the most fitting frontend/admin subsection. If the section is a flat list, add it as a bullet under `Unreleased`.

```md
- platform-admin: redesigned `/admin/today` as an operations ledger that prioritizes club readiness, domain, notification, and AI Ops work.
```

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm --dir front exec vitest run features/platform-admin/model/platform-admin-workbench-model.test.ts features/platform-admin/ui/admin-today-ledger.test.tsx features/platform-admin/route/admin-today-route.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 4: Run frontend test suite**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 6: Manually inspect the admin surface**

Start the dev server if it is not already running.

```bash
pnpm --dir front dev
```

Open `/admin/today` in a browser with a platform admin session and inspect these viewport widths:

```text
390px mobile
768px tablet
1280px desktop
```

Expected:

- Text does not overlap or overflow queue rows, metric chips, or selected brief links.
- The desktop layout shows queue and brief side by side.
- The mobile layout shows queue first and selected brief below.
- `SUPPORT` role can read the ledger but sees disabled mutation CTAs with a reason.
- Optional AI/notification failures do not blank the club readiness queue.

- [ ] **Step 7: Run doc diff check**

Run:

```bash
git diff --check -- CHANGELOG.md
```

Expected: no output.

- [ ] **Step 8: Commit release note and verification cleanup**

Run:

```bash
git add CHANGELOG.md
git commit -m "docs: note admin today ledger"
```

If `CHANGELOG.md` already changed in a previous task commit during execution, run `git status --short` and skip this commit only when there is no remaining doc diff.

## Task 6: Final Review Checklist

**Files:**
- Review only unless verification discovers a defect.

- [ ] **Step 1: Inspect final diff against the branch base**

Run:

```bash
git diff --stat origin/main..HEAD
git diff --check origin/main..HEAD
```

Expected: `git diff --check` has no output.

- [ ] **Step 2: Confirm route-first boundaries**

Run:

```bash
rg -n "useQuery|fetch|readmatesFetch|platformAdmin.*Query|admin-today-route" front/features/platform-admin/ui/admin-today-ledger.tsx front/features/platform-admin/ui/admin-work-queue.tsx front/features/platform-admin/ui/admin-selected-brief.tsx front/features/platform-admin/model/platform-admin-workbench-model.ts
```

Expected:

- No matches in `front/features/platform-admin/ui/admin-today-ledger.tsx`.
- No matches in `front/features/platform-admin/ui/admin-work-queue.tsx`.
- No matches in `front/features/platform-admin/ui/admin-selected-brief.tsx`.
- No React/router/fetch matches in `front/features/platform-admin/model/platform-admin-workbench-model.ts`.

- [ ] **Step 3: Confirm no public-safety regressions in touched files**

Run:

```bash
rg -n "token|secret|password|@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}|/Users/|ocid1\\." front/features/platform-admin docs/superpowers/specs/2026-05-27-readmates-admin-today-operations-ledger-design.md CHANGELOG.md
```

Expected:

- No raw secrets or token-shaped examples.
- Synthetic masked examples such as `m***@example.com` in tests are acceptable.
- Local paths may appear only in tool output, not in committed source files.

- [ ] **Step 4: Capture final status**

Run:

```bash
git status --short
```

Expected: clean working tree, unless generated artifacts from local verification are explicitly untracked and ignored.
