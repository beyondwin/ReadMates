import type {
  ClubAiUsageSummary,
  ClubReadinessSummary,
  ClubSessionProgress,
} from "@/shared/model/club-operations";
import { clubAiFailureDelta } from "@/shared/model/club-operations";

export type AdminClubOperationsSnapshot = {
  schema: "admin.club_operations_snapshot.v1";
  generatedAt: string;
  club: {
    clubId: string;
    slug: string;
    name: string;
    status: string;
    publicVisibility: string;
  };
  readiness: ClubReadinessSummary;
  memberActivity: {
    activeCount: number;
    dormantCount: number;
    pendingViewerCount: number;
    hostCount: number;
  };
  sessionProgress: ClubSessionProgress;
  notificationHealth: {
    pending: number;
    failed: number;
    dead: number;
    lastSuccessAt: string | null;
    failureClusters: Array<{ safeErrorCode: string; count: number }>;
    recentFailed7d: number;
    priorFailed7d: number;
  };
  aiUsage: ClubAiUsageSummary;
  closingRisks?: AdminClubClosingRisks;
  safeLinks: Array<{
    label: string;
    href: string;
    kind: "ADMIN_ROUTE" | "HOST_ROUTE";
  }>;
};

export type AdminClubClosingRisks = {
  incompleteCount: number;
  blockedCount: number;
  readyCount: number;
  items: AdminClubClosingRiskItem[];
  recentlyResolvedItems?: AdminClubClosingRiskItem[];
  trackingUnavailable?: boolean;
};

export type AdminClubClosingRiskItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  overallState: string;
  primaryBlocker: string | null;
  hostClosingHref: string;
  firstDetectedAt?: string | null;
  lastSeenAt?: string | null;
  resolvedAt?: string | null;
  ageDays?: number | null;
  occurrenceCount?: number;
  ledgerState?: "ACTIVE" | "RESOLVED" | "UNTRACKED" | (string & {});
};

export function notificationFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return snapshot.notificationHealth.recentFailed7d - snapshot.notificationHealth.priorFailed7d;
}

export function aiFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return clubAiFailureDelta(snapshot.aiUsage);
}

export type ClubNextAction = { label: string; href: string; kind: "ADMIN_ROUTE" | "HOST_ROUTE" };

export function closingRiskStateLabel(state: string): string {
  switch (state) {
    case "BLOCKED":
      return "차단";
    case "IN_PROGRESS":
      return "진행 중";
    case "READY":
      return "확인 준비";
    case "RESOLVED":
      return "해소됨";
    default:
      return "확인 필요";
  }
}

export function closingRiskBlockerLabel(code: string | null): string {
  switch (code) {
    case null:
      return "확인 필요";
    case "FEEDBACK_DOCUMENT_INVALID":
      return "피드백 문서 확인 필요";
    case "SESSION_CLOSE_REQUIRED":
      return "세션 종료 필요";
    case "RECORD_PACKAGE_REQUIRED":
      return "기록 패키지 필요";
    case "FEEDBACK_DOCUMENT_REQUIRED":
      return "피드백 문서 필요";
    case "MEMBER_NOTIFICATION_REQUIRED":
      return "멤버 알림 확인";
    case "PUBLIC_RECORD_REQUIRED":
      return "공개 기록 확인";
    default:
      return "확인 필요";
  }
}

export function closingRiskSafeStateCode(state: string): string {
  switch (state) {
    case "BLOCKED":
    case "IN_PROGRESS":
    case "READY":
    case "RESOLVED":
      return state;
    default:
      return "UNKNOWN";
  }
}

export function closingRiskAgeLabel(item: AdminClubClosingRiskItem): string | null {
  if (typeof item.ageDays !== "number" || Number.isNaN(item.ageDays)) return null;

  const days = Math.max(0, Math.floor(item.ageDays));
  switch (item.overallState) {
    case "BLOCKED":
      return `${days}일째 차단`;
    case "IN_PROGRESS":
      return `${days}일째 진행 중`;
    case "READY":
      return `${days}일째 조치 대기`;
    default:
      return `${days}일째 확인 필요`;
  }
}

export function closingRiskOccurrenceLabel(item: AdminClubClosingRiskItem): string | null {
  const count = item.occurrenceCount ?? 0;
  return count > 1 ? `반복 ${count}회` : null;
}

export function closingRiskTrackingLabel(item: AdminClubClosingRiskItem): string {
  switch (item.ledgerState) {
    case "ACTIVE":
      return "추적 중";
    case "RESOLVED":
      return "해소됨";
    default:
      return "추적 상태 확인 불가";
  }
}

export function closingRiskResolvedAtLabel(item: AdminClubClosingRiskItem): string | null {
  return item.resolvedAt ?? null;
}

export function closingRiskFirstDetectedLabel(item: AdminClubClosingRiskItem): string | null {
  return item.firstDetectedAt ? `최초 감지 ${item.firstDetectedAt}` : null;
}

export function closingRiskLastSeenLabel(item: AdminClubClosingRiskItem): string | null {
  return item.lastSeenAt ? `최근 감지 ${item.lastSeenAt}` : null;
}

export function closingRiskOverflowCount(snapshot: AdminClubOperationsSnapshot): number {
  const closingRisks = snapshot.closingRisks;
  if (!closingRisks) return 0;

  return Math.max(0, closingRisks.incompleteCount - Math.min(closingRisks.items.length, 5));
}

export function blockerNextAction(code: string, slug: string): ClubNextAction | null {
  switch (code) {
    case "HOST_REQUIRED":
      return { label: "호스트 지정", href: `/clubs/${slug}/app`, kind: "HOST_ROUTE" };
    case "DOMAIN_ACTION_REQUIRED":
      return { label: "도메인 조치", href: `/clubs/${slug}/app`, kind: "HOST_ROUTE" };
    case "CLUB_NOT_ACTIVE":
      return { label: "클럽 상태 확인", href: `/clubs/${slug}/app`, kind: "HOST_ROUTE" };
    default:
      return null;
  }
}
