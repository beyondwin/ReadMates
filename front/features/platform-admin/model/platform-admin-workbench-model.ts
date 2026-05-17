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

export type WorkQueueSeverity = "blocked" | "attention" | "ready" | "stable";
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

export type PlatformAdminWorkbenchInput = {
  role: PlatformAdminRole;
  activeClubCount: number;
  domainActionRequiredCount: number;
  selectedClubId: string | null;
  clubs: PlatformAdminWorkbenchClub[];
  domains: PlatformAdminWorkbenchDomain[];
};

export type PlatformAdminPermissionView = {
  canCreateClub: boolean;
  canUpdateClub: boolean;
  canManageDomains: boolean;
  canCreateSupportGrant: boolean;
  canRevokeSupportGrant: boolean;
};

export type PublishChecklistItem = {
  id: "public-info" | "first-host" | "lifecycle" | "domains";
  label: string;
  passed: boolean;
  detail: string;
};

export type SelectedClubAction =
  | { kind: "make-public"; label: string; disabled: boolean; reason: string | null }
  | { kind: "make-private"; label: string; disabled: boolean; reason: string | null }
  | { kind: "none"; label: string; disabled: true; reason: string };

export type PlatformAdminWorkQueueItem = {
  clubId: string;
  slug: string;
  name: string;
  severity: WorkQueueSeverity;
  reason: string;
  primaryActionLabel: string;
  badges: string[];
  sortRank: number;
};

export type PlatformAdminSelectedClubBrief = PlatformAdminWorkbenchClub & {
  domains: PlatformAdminWorkbenchDomain[];
  publishChecklist: PublishChecklistItem[];
  primaryAction: SelectedClubAction;
  queueItem: PlatformAdminWorkQueueItem;
};

export type PlatformAdminWorkbenchView = {
  permissions: PlatformAdminPermissionView;
  metrics: {
    platformRole: PlatformAdminRole;
    activeClubCount: number;
    needsActionCount: number;
    domainActionRequiredCount: number;
    publishReadyCount: number;
  };
  queueItems: PlatformAdminWorkQueueItem[];
  selectedClub: PlatformAdminSelectedClubBrief | null;
};

export function buildPlatformAdminWorkbench(input: PlatformAdminWorkbenchInput): PlatformAdminWorkbenchView {
  const domainsByClub = groupDomainsByClub(input.domains);
  const queueItems = input.clubs
    .map((club) => buildQueueItem(club, domainsByClub.get(club.clubId) ?? []))
    .sort((a, b) => a.sortRank - b.sortRank || a.name.localeCompare(b.name, "ko-KR"));
  const selectedClubId = selectClubId(input.selectedClubId, queueItems);
  const selectedClub = input.clubs.find((club) => club.clubId === selectedClubId) ?? null;
  const selectedDomains = selectedClub ? domainsByClub.get(selectedClub.clubId) ?? [] : [];
  const selectedQueueItem = queueItems.find((item) => item.clubId === selectedClub?.clubId) ?? null;

  return {
    permissions: permissionsForRole(input.role),
    metrics: {
      platformRole: input.role,
      activeClubCount: input.activeClubCount,
      needsActionCount: queueItems.filter((item) => item.severity === "blocked" || item.severity === "attention").length,
      domainActionRequiredCount: input.domainActionRequiredCount,
      publishReadyCount: queueItems.filter((item) => item.primaryActionLabel === "공개 전환").length,
    },
    queueItems,
    selectedClub: selectedClub && selectedQueueItem
      ? {
          ...selectedClub,
          domains: selectedDomains,
          publishChecklist: buildPublishChecklist(selectedClub, selectedDomains),
          primaryAction: buildPrimaryAction(selectedClub, selectedDomains),
          queueItem: selectedQueueItem,
        }
      : null,
  };
}

function permissionsForRole(role: PlatformAdminRole): PlatformAdminPermissionView {
  const canOperate = role === "OWNER" || role === "OPERATOR";
  return {
    canCreateClub: canOperate,
    canUpdateClub: canOperate,
    canManageDomains: canOperate,
    canCreateSupportGrant: role === "OWNER",
    canRevokeSupportGrant: role === "OWNER",
  };
}

function buildQueueItem(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): PlatformAdminWorkQueueItem {
  const checklist = buildPublishChecklist(club, domains);
  const failedDomain = domains.find((domain) => domain.status === "FAILED");
  const actionRequiredDomain = domains.find((domain) => domain.status === "ACTION_REQUIRED");
  const badges = [club.status, club.publicVisibility, `host ${club.firstHostOnboardingState}`];

  if (failedDomain) {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "attention",
      reason: `${failedDomain.hostname} 도메인 확인이 실패했습니다.`,
      primaryActionLabel: "도메인 확인",
      badges: [...badges, "domain FAILED"],
      sortRank: 20,
    };
  }

  if (actionRequiredDomain) {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "attention",
      reason: `${actionRequiredDomain.hostname} 연결 작업이 필요합니다.`,
      primaryActionLabel: "도메인 확인",
      badges: [...badges, "domain ACTION_REQUIRED"],
      sortRank: 30,
    };
  }

  if (!checklist.every((item) => item.passed)) {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "blocked",
      reason: checklist.find((item) => !item.passed)?.detail ?? "공개 준비 조건을 확인해야 합니다.",
      primaryActionLabel: "체크리스트",
      badges,
      sortRank: 10,
    };
  }

  if (club.publicVisibility === "PRIVATE") {
    return {
      clubId: club.clubId,
      slug: club.slug,
      name: club.name,
      severity: "ready",
      reason: "공개 전환 조건을 충족했습니다.",
      primaryActionLabel: "공개 전환",
      badges,
      sortRank: 40,
    };
  }

  return {
    clubId: club.clubId,
    slug: club.slug,
    name: club.name,
    severity: "stable",
    reason: "현재 공개 상태입니다.",
    primaryActionLabel: "검토",
    badges,
    sortRank: 50,
  };
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

function buildPrimaryAction(
  club: PlatformAdminWorkbenchClub,
  domains: PlatformAdminWorkbenchDomain[],
): SelectedClubAction {
  if (club.status === "SUSPENDED" || club.status === "ARCHIVED") {
    return {
      kind: "none",
      label: "전환 불가",
      disabled: true,
      reason: club.status === "ARCHIVED"
        ? "보관된 클럽은 공개/비공개 전환 대상이 아닙니다."
        : "정지된 클럽은 공개/비공개 전환 대상이 아닙니다.",
    };
  }

  const checklist = buildPublishChecklist(club, domains);
  const failed = checklist.find((item) => !item.passed);

  if (club.publicVisibility === "PUBLIC") {
    return { kind: "make-private", label: "비공개 전환", disabled: false, reason: null };
  }

  if (failed) {
    return { kind: "make-public", label: "공개 전환", disabled: true, reason: failed.detail };
  }

  return { kind: "make-public", label: "공개 전환", disabled: false, reason: null };
}

function groupDomainsByClub(domains: PlatformAdminWorkbenchDomain[]): Map<string, PlatformAdminWorkbenchDomain[]> {
  const grouped = new Map<string, PlatformAdminWorkbenchDomain[]>();
  for (const domain of domains) {
    grouped.set(domain.clubId, [...(grouped.get(domain.clubId) ?? []), domain]);
  }
  return grouped;
}

function selectClubId(
  requestedClubId: string | null,
  queueItems: PlatformAdminWorkQueueItem[],
): string | null {
  if (requestedClubId && queueItems.some((item) => item.clubId === requestedClubId)) {
    return requestedClubId;
  }
  return queueItems[0]?.clubId ?? null;
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
