export type AdminOperationCaseState = "OPEN" | "ACKNOWLEDGED" | "SNOOZED" | "RESOLVED";

export type AdminOperationSeverity = "CRITICAL" | "WARNING" | "READY" | "INFO";

export type AdminOperationSourceType =
  | "CLUB_READINESS"
  | "NOTIFICATION"
  | "AI_JOB"
  | "CLOSING_RISK";

export type AdminOperationSourceStatus = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "DISABLED";

export type AdminOperationAction = "ACKNOWLEDGE" | "SNOOZE" | "RESOLVE";

export type AdminOperationSummaryCode =
  | "CLUB_SETUP_REQUIRED"
  | "CLUB_DOMAIN_ACTION_REQUIRED"
  | "CLUB_READY_TO_PUBLISH"
  | "NOTIFICATION_DELIVERY_FAILURE"
  | "NOTIFICATION_PLATFORM_BACKLOG"
  | "AI_JOB_FAILED"
  | "AI_JOB_STALE"
  | "SESSION_CLOSING_BLOCKED";

export type AdminOperationReasonCode =
  | "OPERATOR_ACKNOWLEDGED"
  | "OPERATOR_SNOOZED"
  | "OPERATOR_RESOLVED"
  | "SIGNAL_OPENED"
  | "SIGNAL_REOPENED"
  | "SIGNAL_CLEARED";

export type AdminOperationAssigneeFilter = "ME";

export type AdminOperationCaseFilter = {
  states?: readonly AdminOperationCaseState[];
  severities?: readonly AdminOperationSeverity[];
  sources?: readonly AdminOperationSourceType[];
  assignee?: AdminOperationAssigneeFilter;
  limit?: number;
  cursor?: string;
};

export type AdminOperationCaseCounts = {
  open: number;
  critical: number;
  assignedToMe: number;
  snoozed: number;
};

export type AdminOperationSourceFreshness = {
  sourceType: AdminOperationSourceType;
  status: AdminOperationSourceStatus;
  generatedAt: string;
  lastSuccessfulAt: string | null;
  authoritative: boolean;
};

export type AdminOperationCaseCore = {
  id: string;
  sourceType: AdminOperationSourceType;
  clubId: string | null;
  state: AdminOperationCaseState;
  severity: AdminOperationSeverity;
  summaryCode: AdminOperationSummaryCode;
  firstObservedAt: string;
  lastObservedAt: string;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  assignedToMe: boolean;
  reopenCount: number;
  version: number;
  impactCount: number;
  detailHref: string;
};

export type AdminOperationCase = AdminOperationCaseCore & {
  allowedActions: AdminOperationAction[];
  source: AdminOperationSourceFreshness;
};

export type AdminOperationCaseEvent = {
  fromState: AdminOperationCaseState | null;
  toState: AdminOperationCaseState;
  action: AdminOperationAction | null;
  reasonCode: AdminOperationReasonCode;
  occurredAt: string;
  caseVersion: number;
};

export type AdminOperationCasesResponse = {
  schema: "admin.operation_cases.v1";
  generatedAt: string;
  counts: AdminOperationCaseCounts;
  sources: AdminOperationSourceFreshness[];
  items: AdminOperationCase[];
  nextCursor: string | null;
};

export type AdminOperationCaseDetailResponse = {
  schema: "admin.operation_cases.v1";
  item: AdminOperationCase;
  history: AdminOperationCaseEvent[];
};

export type AdminOperationCaseMutationResponse = AdminOperationCaseCore & {
  schema: "admin.operation_cases.v1";
};
