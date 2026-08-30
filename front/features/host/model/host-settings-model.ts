export type HostSettingsView = {
  clubId: string;
  clubSlug: string;
  name: string;
  approvalPolicy: "INVITE_ONLY" | "HOST_APPROVAL";
  defaultTimezone: string;
  scheduleReminderEnabled: boolean;
  recordPublicationDefault: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  revision: number;
  status: "SETUP_REQUIRED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";
};

export type HostSettingsUpdateRequest = Omit<
  HostSettingsView,
  "clubId" | "clubSlug" | "revision" | "status"
> & { expectedRevision: number; idempotencyKey: string };

export type HostClosePreviewView = {
  previewId: string;
  clubId: string;
  actorMembershipId: string;
  clubRevision: number;
  effectHash: string;
  effects: {
    clubStatus: "ARCHIVED";
    memberAccess: "ENDED";
    publicRecords: "UNCHANGED";
  };
  expiresAt: string;
};

export type HostInvitationLinkView = {
  linkId: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "EXHAUSTED" | "EXPIRED";
  maxUses: number;
  usedCount: number;
  expiresAt: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type HostInvitationLinkUpdateRequest = {
  name: string;
  maxUses: number;
  expiresAt: string;
  idempotencyKey: string;
  expectedRevision: number;
  status: HostInvitationLinkView["status"];
};

export type HostInvitationLinkCreateView = {
  link: HostInvitationLinkView;
  oneTimeSharePath: string | null;
  receipt: {
    receiptId: string;
    action: "CREATED" | "UPDATED";
    linkId: string;
    revision: number;
    replayed: boolean;
  };
};

export type HostCoHostMemberView = {
  membershipId: string;
  displayName: string;
  avatarKey?: string;
  status: "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
  role: "MEMBER" | "HOST";
};

export type HostCoHostChangeRequest = {
  membershipId: string;
  action: "promote" | "demote";
  expectedRevision: number;
  idempotencyKey: string;
};

export type HostSettingsHistoryItemView = {
  historyId: string;
  revision: number;
  action: "SETTINGS_UPDATED" | "CO_HOST_PROMOTED" | "CO_HOST_DEMOTED" | "CLUB_ENDED";
  subjectMembershipId: string | null;
  beforeSettings: Record<string, string | null>;
  afterSettings: Record<string, string | null>;
  occurredAt: string;
};

export type HostSettingsHistoryPageView = {
  items: HostSettingsHistoryItemView[];
  nextCursor: string | null;
};
