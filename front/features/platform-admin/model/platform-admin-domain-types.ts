export type PlatformAdminRole = "OWNER" | "OPERATOR" | "SUPPORT";

export type SupportAccessGrantScope = "METADATA_READ" | "HOST_SUPPORT_READ";

export type SupportAccessGrantResponse = {
  id: string;
  clubId: string;
  grantedByUserId: string;
  granteeUserId: string;
  scope: SupportAccessGrantScope;
  reason: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type CreateSupportAccessGrantRequest = {
  clubId: string;
  granteeUserId: string;
  scope: SupportAccessGrantScope;
  reason: string;
  expiresAt: string;
};

export type PlatformAdminDomainKind = "SUBDOMAIN" | "CUSTOM_DOMAIN";
export type PlatformAdminDomainStatus =
  | "REQUESTED"
  | "ACTION_REQUIRED"
  | "PROVISIONING"
  | "ACTIVE"
  | "FAILED"
  | "DISABLED";
export type PlatformAdminDomainDesiredState = "ENABLED" | "DISABLED";
export type PlatformAdminDomainManualAction = "CLOUDFLARE_PAGES_CUSTOM_DOMAIN" | "NONE";

export type PlatformAdminDomainResponse = {
  id: string;
  clubId: string;
  hostname: string;
  kind: PlatformAdminDomainKind;
  status: PlatformAdminDomainStatus;
  desiredState: PlatformAdminDomainDesiredState;
  manualAction: PlatformAdminDomainManualAction;
  errorCode: string | null;
  isPrimary: boolean;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
};

export type CreatePlatformAdminDomainRequest = {
  hostname: string;
  kind: PlatformAdminDomainKind;
  isPrimary?: boolean;
};

export type PlatformAdminSummaryResponse = {
  platformRole: PlatformAdminRole;
  activeClubCount: number;
  domainActionRequiredCount: number;
  domains?: PlatformAdminDomainResponse[];
  domainsRequiringAction: PlatformAdminDomainResponse[];
};

export type PlatformAdminClubStatus = "SETUP_REQUIRED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type PlatformAdminClubPublicVisibility = "PRIVATE" | "PUBLIC";
export type FirstHostOnboardingState = "MISSING" | "INVITED" | "ASSIGNED";

export type PlatformAdminClub = {
  clubId: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  status: PlatformAdminClubStatus;
  publicVisibility: PlatformAdminClubPublicVisibility;
  domainCount: number;
  domainActionRequiredCount: number;
  notificationFailureCount: number;
  aiFailureCount: number;
  firstHostOnboardingState: FirstHostOnboardingState;
};

export type PlatformAdminClubListResponse = {
  items: PlatformAdminClub[];
};

export type PlatformAdminTodayClosingRiskState = "BLOCKED" | "IN_PROGRESS" | "READY" | (string & {});
export type PlatformAdminClosingRiskLedgerState = "ACTIVE" | "RESOLVED" | "UNTRACKED" | (string & {});

export type PlatformAdminTodayClosingRisk = {
  clubId: string;
  clubSlug: string;
  clubName: string;
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  overallState: PlatformAdminTodayClosingRiskState;
  primaryBlocker: string | null;
  hostClosingHref: string | null;
  firstDetectedAt?: string | null;
  lastSeenAt?: string | null;
  resolvedAt?: string | null;
  ageDays?: number | null;
  occurrenceCount?: number;
  ledgerState?: PlatformAdminClosingRiskLedgerState;
};

export type PlatformAdminTodayClosingRisksResponse = {
  schema: "admin.today_closing_risks.v1";
  generatedAt: string;
  items: PlatformAdminTodayClosingRisk[];
  trackingUnavailable?: boolean;
};

export type UpdatePlatformAdminClubRequest = {
  name?: string;
  tagline?: string;
  about?: string;
  publicVisibility?: PlatformAdminClubPublicVisibility;
};

export type PlatformAdminOnboardingRequest = {
  club: {
    name: string;
    slug: string;
    tagline: string;
    about: string;
  };
  firstHost: {
    email: string;
    name: string;
  };
  domain?: {
    hostname: string;
    kind: PlatformAdminDomainKind;
  };
  existingUserConfirmation?: string;
};

export type PlatformAdminOnboardingPreviewResponse = {
  club: {
    slug: string;
    available: boolean;
  };
  firstHost: {
    kind: "EXISTING_USER" | "NEW_USER";
    email: string;
    existingUserId: string | null;
    existingUserName: string | null;
    requiredConfirmation: string | null;
  };
  domain: null | {
    hostname: string;
    available: boolean;
  };
};

export type PlatformAdminOnboardingResultResponse = {
  club: PlatformAdminClub;
  hostOnboarding: {
    kind: "EXISTING_USER_ASSIGNED" | "INVITATION_CREATED";
    email: string;
    userId: string | null;
    invitationId: string | null;
    acceptUrl: string | null;
    emailDelivery: {
      status: "SENT" | "FAILED" | "SKIPPED";
    };
  };
  domain: PlatformAdminDomainResponse | null;
};

export type PlatformAdminAiOpsAction = "FORCE_CANCEL" | "RETRY_COMMIT";

export type PlatformAdminAiOpsSummaryResponse = {
  activeJobCount: number;
  failedLast24h: number;
  monthToDateCostEstimateUsd: string;
  failureCodes: Array<{ code: string; count: number }>;
  providerCosts: Array<{ provider: string; model: string; costEstimateUsd: string }>;
  staleCandidateCount: number;
  costTrend: {
    window: "7d" | "30d" | "90d";
    currentCostUsd: string;
    priorCostUsd: string;
    currentJobCount: number;
    priorJobCount: number;
    deltaDirection: "UP" | "DOWN" | "FLAT" | "NONE";
    availability: "AVAILABLE" | "NOT_ENOUGH_DATA";
  };
};

export type PlatformAdminAiOpsJob = {
  jobId: string;
  club: { clubId: string; slug: string | null; name: string | null };
  session: { sessionId: string; number: number | null; bookTitle: string | null };
  status: string;
  stage: string | null;
  provider: string;
  model: string;
  errorCode: string | null;
  safeErrorMessage: string | null;
  costEstimateUsd: string;
  createdAt: string;
  lastUpdatedAt: string;
  expiresAt: string | null;
  staleCandidate: boolean;
  revision?: number | null;
  cleanupPending?: boolean;
  availableActions: PlatformAdminAiOpsAction[];
};

export type PlatformAdminAiOpsJobListResponse = {
  items: PlatformAdminAiOpsJob[];
  nextCursor: string | null;
};

export type PlatformAdminAiOpsFilters = {
  status?: string;
  clubId?: string;
  errorCode?: string;
  cursor?: string;
};

export type PlatformAdminAiOpsActionResponse = {
  jobId: string;
  previousStatus: string;
  nextStatus: string;
};
