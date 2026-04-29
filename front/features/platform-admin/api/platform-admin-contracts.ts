export type PlatformAdminRole = "OWNER" | "OPERATOR" | "SUPPORT";

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
  domainsRequiringAction: PlatformAdminDomainResponse[];
};
