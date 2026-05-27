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
  readiness: {
    state: string;
    blockingReasons: string[];
    nextAction: string | null;
  };
  memberActivity: {
    activeCount: number;
    dormantCount: number;
    pendingViewerCount: number;
    hostCount: number;
  };
  sessionProgress: {
    upcomingCount: number;
    currentOpenCount: number;
    closedCount: number;
    publishedRecordCount: number;
    incompleteRecordCount: number;
  };
  notificationHealth: {
    pending: number;
    failed: number;
    dead: number;
    lastSuccessAt: string | null;
    failureClusters: Array<{ safeErrorCode: string; count: number }>;
  };
  aiUsage: {
    activeJobs: number;
    failedRecentJobs: number;
    staleCandidates: number;
    costEstimateUsd: string;
    state: string;
  };
  safeLinks: Array<{
    label: string;
    href: string;
    kind: "ADMIN_ROUTE" | "HOST_ROUTE";
  }>;
};
