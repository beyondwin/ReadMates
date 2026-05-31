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
  safeLinks: Array<{
    label: string;
    href: string;
    kind: "ADMIN_ROUTE" | "HOST_ROUTE";
  }>;
};

export function notificationFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return snapshot.notificationHealth.recentFailed7d - snapshot.notificationHealth.priorFailed7d;
}

export function aiFailureDelta(snapshot: AdminClubOperationsSnapshot): number {
  return clubAiFailureDelta(snapshot.aiUsage);
}

export type ClubNextAction = { label: string; href: string; kind: "ADMIN_ROUTE" | "HOST_ROUTE" };

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
