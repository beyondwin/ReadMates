export type PlatformAdminRole = "OWNER" | "OPERATOR" | "SUPPORT";

export type PlatformAdminSummaryResponse = {
  platformRole: PlatformAdminRole;
  activeClubCount: number;
  domainActionRequiredCount: number;
};
