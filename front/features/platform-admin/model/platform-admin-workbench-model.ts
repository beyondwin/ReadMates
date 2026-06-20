import type { AdminNotificationOperationsSnapshot } from "@/features/platform-admin/model/platform-admin-notifications-model";
import type { PlatformAdminTodayClosingRisk } from "@/features/platform-admin/model/platform-admin-domain-types";

export type PlatformAdminRole = "OWNER" | "OPERATOR" | "SUPPORT";
export type PlatformAdminClubStatus = "SETUP_REQUIRED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type PlatformAdminClubPublicVisibility = "PRIVATE" | "PUBLIC";
export type FirstHostOnboardingState = "MISSING" | "INVITED" | "ASSIGNED";
export type PlatformAdminDomainStatus =
  | "REQUESTED"
  | "ACTION_REQUIRED"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";

export type WorkQueueSeverity =
  | "blocked"
  | "critical"
  | "attention"
  | "warn"
  | "ready"
  | "stable"
  | "info";
// Filter chips are deferred (see spec Non-Goals); severity ordering covers triage for the first pass.
// When added back, key filtering off typed signals (e.g., severity, a domainState field) — not badge strings.

export type PlatformAdminWorkbenchClub = {
  clubId: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  status: PlatformAdminClubStatus;
  publicVisibility: PlatformAdminClubPublicVisibility;
  domainCount: number;
  domainActionRequiredCount: number;
  firstHostOnboardingState: FirstHostOnboardingState;
};

export type PlatformAdminWorkbenchDomain = {
  id: string;
  clubId: string;
  hostname: string;
  kind: string;
  status: PlatformAdminDomainStatus;
  desiredState: string;
  manualAction: string;
  errorCode: string | null;
  isPrimary: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
};

export type PlatformAdminAiOpsJobInput = {
  jobId: string;
  clubId: string;
  clubName: string;
  sessionTitle: string;
  status: string;
  errorCode: string | null;
  stale: boolean;
  startedAt: string;
};

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
  closingRisks?: ReadonlyArray<PlatformAdminTodayClosingRisk>;
  closingRisksUnavailable?: boolean;
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
    | "open-host-closing"
    | "open-detail"
    | "none";
  label: string;
  href: string;
  disabled: boolean;
  reason: string | null;
};

export type WorkbenchQueueItemType = "club" | "notification" | "ai" | "closing-risk" | "partial-error";

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

export type PlatformAdminClosingRiskBrief = {
  kind: "closing-risk";
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  stateLabel: string;
  blockerLabel: string;
  ageLabel: string | null;
  occurrenceLabel: string | null;
  trackingLabel: string;
};

export type PlatformAdminSelectedBrief = {
  item: WorkbenchQueueItem;
  club: PlatformAdminWorkbenchClub | null;
  closingRisk: PlatformAdminClosingRiskBrief | null;
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

export type SelectedClubAction = SelectedAdminAction;
export type PlatformAdminWorkQueueItem = WorkbenchQueueItem;
export type PlatformAdminSelectedClubBrief = PlatformAdminWorkbenchClub & {
  domains: PlatformAdminWorkbenchDomain[];
  publishChecklist: PublishChecklistItem[];
  primaryAction: SelectedAdminAction;
  queueItem: WorkbenchQueueItem;
};

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
  const closingRiskItems = buildClosingRiskQueueItems(input.closingRisks ?? [], input.closingRisksUnavailable ?? false);
  const closingRiskBriefsByQueueId = buildClosingRiskBriefsByQueueId(input.closingRisks ?? []);
  const queueItems = [...clubItems, ...notificationItems, ...aiItems, ...closingRiskItems].sort(compareQueueItems);
  const selectedItem = selectQueueItem(input.selectedItemId, input.selectedClubId, queueItems);
  const selectedBrief = selectedItem
    ? buildSelectedBrief(selectedItem, input.clubs, domainsByClub, permissions, closingRiskBriefsByQueueId)
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

function buildClosingRiskQueueItems(
  risks: ReadonlyArray<PlatformAdminTodayClosingRisk>,
  unavailable: boolean,
): WorkbenchQueueItem[] {
  const items = risks.map((risk): WorkbenchQueueItem => {
    const blockerLabel = closingRiskBlockerLabel(risk.primaryBlocker);
    const ageLabel = closingRiskAgeLabel(risk);
    const occurrenceLabel = closingRiskOccurrenceLabel(risk);
    const reasonParts = [risk.bookTitle, blockerLabel, ageLabel, occurrenceLabel].filter(
      (value): value is string => Boolean(value),
    );
    return {
      id: closingRiskQueueId(risk.sessionId),
      type: "closing-risk",
      clubId: risk.clubId,
      slug: risk.clubSlug,
      name: `${risk.clubName} · No.${risk.sessionNumber}`,
      severity: closingRiskSeverity(risk.overallState),
      reason: reasonParts.join(" · "),
      primaryActionLabel: risk.hostClosingHref ? "호스트 클로징 보드" : "클럽 운영 상세",
      badges: closingRiskBadges(risk, blockerLabel),
      sortRank: closingRiskSortRank(risk.overallState),
      href: risk.hostClosingHref || `/admin/clubs/${risk.clubId}`,
    };
  });

  if (!unavailable) return items;

  return [
    ...items,
    {
      id: "partial-closing-risks",
      type: "partial-error",
      clubId: null,
      slug: "platform",
      name: "클로징 리스크",
      severity: "warn",
      reason: "오늘 클로징 리스크 큐를 확인하지 못했습니다.",
      primaryActionLabel: "클로징 확인 불가",
      badges: ["closing risks unavailable"],
      sortRank: 33,
      href: "/admin/today",
    },
  ];
}

function buildClosingRiskBriefsByQueueId(
  risks: ReadonlyArray<PlatformAdminTodayClosingRisk>,
): Map<string, PlatformAdminClosingRiskBrief> {
  const briefs = new Map<string, PlatformAdminClosingRiskBrief>();
  for (const risk of risks) {
    briefs.set(closingRiskQueueId(risk.sessionId), {
      kind: "closing-risk",
      sessionId: risk.sessionId,
      sessionNumber: risk.sessionNumber,
      bookTitle: risk.bookTitle,
      meetingDate: risk.meetingDate,
      stateLabel: closingRiskStateLabel(risk.overallState),
      blockerLabel: closingRiskBlockerLabel(risk.primaryBlocker),
      ageLabel: closingRiskAgeLabel(risk),
      occurrenceLabel: closingRiskOccurrenceLabel(risk),
      trackingLabel: closingRiskTrackingLabel(risk),
    });
  }
  return briefs;
}

function closingRiskQueueId(sessionId: string): string {
  return `closing-risk-${sessionId}`;
}

function closingRiskStateLabel(state: string): string {
  if (state === "BLOCKED") return "차단";
  if (state === "IN_PROGRESS") return "진행 중";
  if (state === "READY") return "확인 준비";
  return "확인 필요";
}

function closingRiskBlockerLabel(blocker: string | null): string {
  if (blocker === "FEEDBACK_DOCUMENT_INVALID") return "피드백 문서 다시 확인";
  if (blocker === "SESSION_CLOSE_REQUIRED") return "세션 종료 필요";
  if (blocker === "RECORD_PACKAGE_REQUIRED") return "기록 패키지 필요";
  if (blocker === "FEEDBACK_DOCUMENT_REQUIRED") return "피드백 문서 필요";
  if (blocker === "MEMBER_NOTIFICATION_REQUIRED") return "멤버 알림 확인";
  if (blocker === "PUBLIC_RECORD_REQUIRED") return "공개 기록 확인";
  return "확인 필요";
}

function closingRiskAgeLabel(risk: PlatformAdminTodayClosingRisk): string | null {
  if (typeof risk.ageDays !== "number" || Number.isNaN(risk.ageDays)) return null;
  const days = Math.max(0, Math.floor(risk.ageDays));
  if (risk.overallState === "BLOCKED") return `${days}일째 차단`;
  if (risk.overallState === "IN_PROGRESS") return `${days}일째 진행 중`;
  if (risk.overallState === "READY") return `${days}일째 조치 대기`;
  return `${days}일째 확인 필요`;
}

function closingRiskOccurrenceLabel(risk: PlatformAdminTodayClosingRisk): string | null {
  const count = risk.occurrenceCount ?? 0;
  return count > 1 ? `반복 ${count}회` : null;
}

function closingRiskTrackingLabel(risk: PlatformAdminTodayClosingRisk): string {
  if (risk.ledgerState === "ACTIVE") return "추적 중";
  if (risk.ledgerState === "RESOLVED") return "해소됨";
  return "추적 상태 확인 불가";
}

function closingRiskBadges(risk: PlatformAdminTodayClosingRisk, blockerLabel: string): string[] {
  const trackingLabel = closingRiskTrackingLabel(risk);
  return [
    closingRiskStateLabel(risk.overallState),
    blockerLabel,
    closingRiskAgeLabel(risk),
    closingRiskOccurrenceLabel(risk),
    trackingLabel === "추적 상태 확인 불가" ? trackingLabel : null,
  ].filter((value): value is string => Boolean(value));
}

function closingRiskSeverity(state: string): WorkQueueSeverity {
  if (state === "BLOCKED") return "critical";
  if (state === "IN_PROGRESS") return "warn";
  return "attention";
}

function closingRiskSortRank(state: string): number {
  if (state === "BLOCKED") return 25;
  if (state === "IN_PROGRESS") return 35;
  return 45;
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

function buildSelectedBrief(
  item: WorkbenchQueueItem,
  clubs: PlatformAdminWorkbenchClub[],
  domainsByClub: Map<string, PlatformAdminWorkbenchDomain[]>,
  permissions: PlatformAdminPermissionView,
  closingRiskBriefsByQueueId: Map<string, PlatformAdminClosingRiskBrief>,
): PlatformAdminSelectedBrief {
  const club = item.clubId ? clubs.find((candidate) => candidate.clubId === item.clubId) ?? null : null;
  const domains = club ? domainsByClub.get(club.clubId) ?? [] : [];
  const closingRisk = item.type === "closing-risk" ? closingRiskBriefsByQueueId.get(item.id) ?? null : null;
  const publishChecklist = club && !closingRisk ? buildPublishChecklist(club, domains) : [];
  const primaryAction = buildSelectedAction(item, club, domains, permissions);
  return {
    item,
    club,
    closingRisk,
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

  if (item.type === "closing-risk") {
    return {
      kind: item.primaryActionLabel === "호스트 클로징 보드" ? "open-host-closing" : "open-detail",
      label: item.primaryActionLabel,
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
  if (item.type === "closing-risk") {
    links.push({ label: item.primaryActionLabel, href: item.href });
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

function buildPublishChecklist(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): PublishChecklistItem[] {
  const hasPublicInfo = [club.name, club.tagline, club.about].every((value) => value.trim().length > 0);
  const lifecycleAllowed = club.status !== "SUSPENDED" && club.status !== "ARCHIVED";
  const hasBlockingDomain = domains.some((domain) => domain.status === "FAILED");
  return [
    {
      id: "public-info",
      label: "공개 정보",
      passed: hasPublicInfo,
      detail: hasPublicInfo ? "이름, tagline, about이 입력되어 있습니다." : "공개 소개 정보가 비어 있습니다.",
    },
    {
      id: "first-host",
      label: "첫 호스트 지정",
      passed: club.firstHostOnboardingState === "ASSIGNED",
      detail: hostStateDetail(club.firstHostOnboardingState),
    },
    {
      id: "lifecycle",
      label: "운영 상태",
      passed: lifecycleAllowed,
      detail: lifecycleAllowed ? "공개 가능한 운영 상태입니다." : "정지 또는 보관 상태에서는 공개 전환하지 않습니다.",
    },
    {
      id: "domains",
      label: "도메인 상태",
      passed: !hasBlockingDomain,
      detail: hasBlockingDomain ? "실패한 도메인 확인이 있습니다." : "도메인 실패가 없습니다.",
    },
  ];
}

function groupDomainsByClub(domains: PlatformAdminWorkbenchDomain[]): Map<string, PlatformAdminWorkbenchDomain[]> {
  const grouped = new Map<string, PlatformAdminWorkbenchDomain[]>();
  for (const domain of domains) {
    grouped.set(domain.clubId, [...(grouped.get(domain.clubId) ?? []), domain]);
  }
  return grouped;
}

function hostStateDetail(state: FirstHostOnboardingState): string {
  switch (state) {
    case "ASSIGNED":
      return "첫 호스트가 지정되어 있습니다.";
    case "INVITED":
      return "첫 호스트 초대 수락을 기다리고 있습니다.";
    case "MISSING":
      return "첫 호스트가 아직 없습니다.";
  }
}
