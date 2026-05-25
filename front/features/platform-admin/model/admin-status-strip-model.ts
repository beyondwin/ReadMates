import type {
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminRole,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";

export type AdminStripMetrics = {
  platformRole: PlatformAdminRole;
  setupRequiredCount: number;
  readyToPublishCount: number;
  domainActionRequiredCount: number;
};

export function isClubReadyToPublish(club: PlatformAdminClub): boolean {
  return (
    club.status === "ACTIVE" &&
    club.publicVisibility === "PRIVATE" &&
    club.firstHostOnboardingState === "ASSIGNED" &&
    club.domainActionRequiredCount === 0
  );
}

export function deriveStripMetrics(
  summary: PlatformAdminSummaryResponse,
  clubs: PlatformAdminClubListResponse,
): AdminStripMetrics {
  let setupRequired = 0;
  let readyToPublish = 0;
  for (const club of clubs.items) {
    if (club.status === "SETUP_REQUIRED") setupRequired += 1;
    if (isClubReadyToPublish(club)) readyToPublish += 1;
  }
  return {
    platformRole: summary.platformRole,
    setupRequiredCount: setupRequired,
    readyToPublishCount: readyToPublish,
    domainActionRequiredCount: summary.domainActionRequiredCount,
  };
}
