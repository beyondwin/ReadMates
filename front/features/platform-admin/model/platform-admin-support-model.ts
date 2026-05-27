export type AdminSupportSearchResult = {
  subjectId: string;
  displayName: string;
  maskedEmail: string;
  kind: string;
  platformAdminRole: "OWNER" | "OPERATOR" | "SUPPORT" | null;
  platformAdminStatus: string | null;
  clubMembershipSummary: Array<{ clubId: string; clubName: string; role: string; status: string }>;
  grantEligible: boolean;
  grantBlockedReason: string | null;
};

export type AdminSupportGrantLedgerItem = {
  grantId: string;
  clubId: string;
  clubName: string;
  granteeUserId: string;
  granteeDisplayName: string;
  granteeMaskedEmail: string;
  scope: "METADATA_READ" | "HOST_SUPPORT_READ";
  reason: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  status: string;
  createdByRole: string;
};

export type AdminSupportGrantRequest = {
  clubId: string;
  granteeSubjectId: string;
  scope: "METADATA_READ" | "HOST_SUPPORT_READ";
  reason: string;
  expiresAt: string;
};
