export type ClubReadinessSummary = {
  state: string;
  blockingReasons: string[];
  nextAction: string | null;
};

export type ClubSessionProgress = {
  upcomingCount: number;
  currentOpenCount: number;
  closedCount: number;
  publishedRecordCount: number;
  incompleteRecordCount: number;
};

export type ClubAiUsageSummary = {
  activeJobs: number;
  failedRecentJobs: number;
  staleCandidates: number;
  costEstimateUsd: string;
  state: string;
  priorFailedJobs7d: number;
};

export type HostClubOperationsSnapshot = {
  schema: "host.club_operations_snapshot.v1";
  generatedAt: string;
  club: { clubId: string; slug: string; name: string };
  readiness: ClubReadinessSummary;
  sessionProgress: ClubSessionProgress;
  aiUsage: ClubAiUsageSummary;
};

export function clubAiFailureDelta(aiUsage: ClubAiUsageSummary): number {
  return aiUsage.failedRecentJobs - aiUsage.priorFailedJobs7d;
}
