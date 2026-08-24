import {
  readmatesFetch,
  readmatesFetchResponse,
  RECOVER_READ_SESSION_EXPIRY,
  type ReadmatesApiContext,
  type ExplicitReadmatesApiContext,
} from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";
import type {
  CreatedSessionResponse,
  CreateHostInvitationRequest,
  HostAttendanceResponse,
  HostAttendanceUpdate,
  AttendanceVersion,
  CorrectionPublicationVersionVector,
  ExpectedCloseRevisions,
  ExpectedExposureRevision,
  ExpectedPublicationRevision,
  ExpectedSessionRevision,
  HostClubOperationsResponse,
  HostInvitationListPage,
  HostInvitationResponse,
  HostNotificationDeliveryListResponse,
  HostMemberListPage,
  HostNotificationEventListResponse,
  HostMemberProfileResponse,
  HostNotificationDetailResponse,
  HostNotificationEventType,
  HostNotificationItemListResponse,
  HostNotificationPolicyResponse,
  HostNotificationSummary,
  HostNotificationStatus,
  HostSessionDeletionPreviewResponse,
  HostSessionDeletionResponse,
  HostSessionTrashItem,
  HostSessionTrashPage,
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
  HostSessionAccessScopeRequest,
  HostSessionListPage,
  HostListMode,
  HostSessionPublicationRequest,
  HostSessionRequest,
  HostSessionScheduleDefaultsWire,
  HostSessionVisibilityRequest,
  HostSessionVisibilityUpdateResult,
  HostMutationEnvelope,
  HostMutationOperation,
  HostMutationReconciliation,
  PublicationVersionVector,
  ManualNotificationConfirmRequest,
  ManualNotificationConfirmResponse,
  ManualNotificationDispatchListResponse,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  NotificationTestMailAuditItem,
  NotificationTestMailAuditPage,
  SendNotificationTestMailRequest,
  SessionImportCommitResponse,
  SessionImportPreviewResponse,
  SessionImportRequest,
  UpdateHostMemberProfileRequest,
  UpdateHostNotificationPolicyRequest,
  ViewerMember,
} from "./host-contracts";
import {
  AccessHostSessionMutationEnvelopeSchema,
  AttendanceHostSessionMutationEnvelopeSchema,
  CloseHostSessionMutationEnvelopeSchema,
  CorrectionPublishHostSessionMutationEnvelopeSchema,
  CreateHostSessionMutationEnvelopeSchema,
  PublishHostSessionMutationEnvelopeSchema,
  PublicationHostSessionMutationEnvelopeSchema,
  ReverseHostSessionMutationEnvelopeSchema,
  SessionRevisionMutationEnvelopeSchema,
  UpdateHostSessionMutationEnvelopeSchema,
  HostSessionVisibilityUpdateResponseSchema,
  HostMutationReconciliationSchema,
  HostMutationIdempotencyKeySchema,
  parseHostAttendanceResponse,
  parseHostSessionDetailResponse,
  parseHostSessionDeletionResponse,
  parseHostSessionTrashItem,
  parseHostSessionTrashPage,
  parseHostSessionListPage,
  parseHostMemberListPage,
  parseHostNotificationDeliveryListResponse,
  parseHostInvitationListPage,
  parseSessionImportPreviewResponse,
} from "./host-contracts";
import { normalizeHostSessionScheduleDefaults } from "../model/host-schedule-defaults-state";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";
import type { HostSessionReverseRequest } from "./host-session-record-contracts";

export type { HostSessionReverseRequest };

export type ExplicitHostApiContext = ExplicitReadmatesApiContext;
export type HostSessionCreateEnvelope = HostMutationEnvelope<HostSessionRequest, Record<string, never>>;
export type HostSessionUpdateEnvelope = HostMutationEnvelope<HostSessionRequest, ExpectedSessionRevision>;
export type HostSessionRevisionEnvelope = HostMutationEnvelope<Record<string, never>, ExpectedSessionRevision>;
export type HostSessionCloseEnvelope = HostMutationEnvelope<Record<string, never>, ExpectedCloseRevisions>;
export type HostSessionPublishEnvelope = HostMutationEnvelope<Record<string, never>, PublicationVersionVector>;
export type HostSessionReverseEnvelope = HostMutationEnvelope<
  Omit<HostSessionReverseRequest, "expectedSessionRevision">,
  ExpectedSessionRevision
>;
export type HostSessionAccessEnvelope = HostMutationEnvelope<HostSessionAccessScopeRequest, ExpectedExposureRevision>;
export type HostSessionPublicationEnvelope = HostMutationEnvelope<HostSessionPublicationRequest, ExpectedPublicationRevision>;
export type HostSessionAttendanceEnvelope = HostMutationEnvelope<
  {
    entries: Array<HostAttendanceUpdate & { expectedAttendanceRevision: number }>;
  },
  { rows: AttendanceVersion[]; participantSetRevision?: number }
>;
export type HostSessionCorrectionPublishEnvelope = HostMutationEnvelope<
  Record<string, never>,
  CorrectionPublicationVersionVector
>;

function parseEnvelope<T>(schema: { parse(value: unknown): unknown }, envelope: T): T {
  schema.parse(envelope);
  return envelope;
}

export function fetchHostCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export function fetchHostClubOperations(context: { clubSlug: string | undefined }) {
  return readmatesFetch<HostClubOperationsResponse>("/api/host/club-operations", undefined, context);
}

export function fetchHostNotificationSummary(context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationSummary>("/api/host/notifications/summary", undefined, context);
}

export function fetchHostNotificationPolicy(context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationPolicyResponse>(
    "/api/host/notifications/policy",
    undefined,
    context,
  );
}

export function updateHostNotificationPolicy(
  request: UpdateHostNotificationPolicyRequest,
  context?: ReadmatesApiContext,
) {
  return readmatesFetch<HostNotificationPolicyResponse>(
    "/api/host/notifications/policy",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    context,
  );
}

export function processHostNotifications() {
  return readmatesFetchResponse("/api/host/notifications/process", { method: "POST" });
}

function hostNotificationItemSearch(status?: HostNotificationStatus, page?: PageRequest) {
  const params = new URLSearchParams();
  if (status) {
    params.set("status", status);
  }
  if (page?.limit !== undefined) {
    params.set("limit", String(page.limit));
  }
  if (page?.cursor) {
    params.set("cursor", page.cursor);
  }
  const search = params.toString();
  return search ? `?${search}` : "";
}

export function fetchHostNotificationItems(status?: HostNotificationStatus, context?: ReadmatesApiContext, page?: PageRequest) {
  const search = hostNotificationItemSearch(status, page);
  return readmatesFetch<HostNotificationItemListResponse>(`/api/host/notifications/items${search}`, undefined, context);
}

export function fetchHostNotificationEvents(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<HostNotificationEventListResponse>(`/api/host/notifications/events${pagingSearchParams(page)}`, undefined, context);
}

export function fetchHostNotificationDeliveries(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<HostNotificationDeliveryListResponse>(`/api/host/notifications/deliveries${pagingSearchParams(page)}`, undefined, context).then(parseHostNotificationDeliveryListResponse);
}

export function fetchManualNotificationOptions(
  context?: ReadmatesApiContext,
  request?: { sessionId?: string; search?: string; page?: PageRequest },
) {
  const params = new URLSearchParams();
  if (request?.sessionId) {
    params.set("sessionId", request.sessionId);
  }
  if (request?.search) {
    params.set("search", request.search);
  }
  const pageParams = pagingSearchParams(request?.page);
  const pageSearch = pageParams.startsWith("?") ? pageParams.slice(1) : "";
  if (pageSearch) {
    new URLSearchParams(pageSearch).forEach((value, key) => params.set(key, value));
  }
  const search = params.toString();
  return readmatesFetch<ManualNotificationOptionsResponse>(
    `/api/host/notifications/manual/options${search ? `?${search}` : ""}`,
    undefined,
    context,
  );
}

export function fetchManualNotificationDispatches(
  context?: ReadmatesApiContext,
  request?: { sessionId?: string; eventType?: HostNotificationEventType; page?: PageRequest },
) {
  const params = new URLSearchParams();
  if (request?.sessionId) {
    params.set("sessionId", request.sessionId);
  }
  if (request?.eventType) {
    params.set("eventType", request.eventType);
  }
  const pageParams = pagingSearchParams(request?.page);
  const pageSearch = pageParams.startsWith("?") ? pageParams.slice(1) : "";
  if (pageSearch) {
    new URLSearchParams(pageSearch).forEach((value, key) => params.set(key, value));
  }
  const search = params.toString();
  return readmatesFetch<ManualNotificationDispatchListResponse>(
    `/api/host/notifications/manual/dispatches${search ? `?${search}` : ""}`,
    undefined,
    context,
  );
}

export function previewManualNotification(request: ManualNotificationPreviewRequest) {
  return readmatesFetch<ManualNotificationPreviewResponse>("/api/host/notifications/manual/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function confirmManualNotification(request: ManualNotificationConfirmRequest) {
  return readmatesFetch<ManualNotificationConfirmResponse>("/api/host/notifications/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function fetchHostNotificationDetail(id: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationDetailResponse>(
    `/api/host/notifications/items/${encodeURIComponent(id)}`,
    undefined,
    context,
  );
}

export function retryHostNotification(id: string) {
  return readmatesFetch<HostNotificationDetailResponse>(
    `/api/host/notifications/items/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
  );
}

export function restoreHostNotification(id: string) {
  return readmatesFetch<HostNotificationDetailResponse>(
    `/api/host/notifications/items/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export function sendHostNotificationTestMail(request: SendNotificationTestMailRequest) {
  return readmatesFetch<NotificationTestMailAuditItem>("/api/host/notifications/test-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function fetchHostNotificationTestMailAudit(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<NotificationTestMailAuditPage>(`/api/host/notifications/test-mail/audit${pagingSearchParams(page)}`, undefined, context);
}

export function fetchHostSessions(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<HostSessionListPage>(`/api/host/sessions${pagingSearchParams(page)}`, undefined, context);
}

export function fetchHostSessionList(
  mode: HostListMode,
  context?: ReadmatesApiContext,
  page?: PageRequest,
) {
  const params = new URLSearchParams({ mode });
  if (page?.limit !== undefined) {
    params.set("limit", String(page.limit));
  }
  if (page?.cursor) {
    params.set("cursor", page.cursor);
  }
  return readmatesFetch<HostSessionListPage>(
    `/api/host/sessions?${params.toString()}`,
    undefined,
    context,
  ).then((value) => parseHostSessionListPage(value, mode));
}

export function fetchHostSessionScheduleDefaults(context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionScheduleDefaultsWire>(
    "/api/host/sessions/schedule-defaults",
    undefined,
    context,
    RECOVER_READ_SESSION_EXPIRY,
  ).then(normalizeHostSessionScheduleDefaults);
}

export function fetchHostSessionDetail(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`, undefined, context).then(parseHostSessionDetailResponse);
}

export function fetchHostSessionTrashList(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<HostSessionTrashPage>(
    `/api/host/sessions/trash${pagingSearchParams(page)}`,
    undefined,
    context,
  ).then(parseHostSessionTrashPage);
}

export function fetchHostSessionTrash(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionTrashItem>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/trash`,
    undefined,
    context,
  ).then(parseHostSessionTrashItem);
}

export function fetchHostMutationReconciliation(
  operation: HostMutationOperation,
  resourceSlot: string,
  idempotencyKey: string,
  context: ExplicitHostApiContext,
): Promise<HostMutationReconciliation> {
  const parsedKey = HostMutationIdempotencyKeySchema.parse(idempotencyKey);
  return readmatesFetch<HostMutationReconciliation>(
    `/api/host/mutations/${encodeURIComponent(operation)}/${encodeURIComponent(resourceSlot)}/${encodeURIComponent(parsedKey)}`,
    undefined,
    context,
  ).then((value) => HostMutationReconciliationSchema.parse(value));
}

export function restoreHostSession(
  sessionId: string,
  envelope: HostSessionRevisionEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<HostSessionDetailResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/restore`,
    { method: "POST", body: JSON.stringify(parseEnvelope(SessionRevisionMutationEnvelopeSchema, envelope)) },
    context,
  ).then(parseHostSessionDetailResponse);
}

export function fetchHostSessionClosingStatus(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionClosingStatusResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/closing-status`,
    undefined,
    context,
  );
}

export function createHostSession(
  envelope: HostSessionCreateEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse("/api/host/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(CreateHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<CreatedSessionResponse> }>;
}

export function updateHostSession(
  sessionId: string,
  envelope: HostSessionUpdateEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(UpdateHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function fetchHostSessionDeletionPreview(
  sessionId: string,
  context?: ReadmatesApiContext,
): Promise<HostSessionDeletionPreviewResponse> {
  return readmatesFetch<HostSessionDeletionPreviewResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/deletion-preview`,
    undefined,
    context,
  );
}

export function deleteHostSession(
  sessionId: string,
  envelope: HostSessionRevisionEnvelope,
  context: ExplicitHostApiContext,
): Promise<HostSessionDeletionResponse> {
  return readmatesFetch<HostSessionDeletionResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", body: JSON.stringify(parseEnvelope(SessionRevisionMutationEnvelopeSchema, envelope)) },
    context,
  ).then(parseHostSessionDeletionResponse);
}

export async function saveHostSessionAttendance(
  sessionId: string,
  envelope: HostSessionAttendanceEnvelope,
  context: ExplicitHostApiContext,
): Promise<HostAttendanceResponse> {
  const response = await readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(AttendanceHostSessionMutationEnvelopeSchema, envelope)),
  }, context);
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return parseHostAttendanceResponse(await response.json());
}

export function saveHostSessionPublication(
  sessionId: string,
  envelope: HostSessionPublicationEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publication`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(PublicationHostSessionMutationEnvelopeSchema, envelope)),
  }, context);
}

export async function saveHostSessionVisibility(
  sessionId: string,
  request: HostSessionVisibilityRequest,
  context?: ReadmatesApiContext,
): Promise<HostSessionVisibilityUpdateResult> {
  const response = await readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context);
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return HostSessionVisibilityUpdateResponseSchema.parse(
    await response.json(),
  );
}

export async function saveHostSessionAccessScope(
  sessionId: string,
  envelope: HostSessionAccessEnvelope,
  context: ExplicitHostApiContext,
): Promise<HostSessionVisibilityUpdateResult> {
  const response = await readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/access-scope`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(AccessHostSessionMutationEnvelopeSchema, envelope)),
  }, context);
  if (!response.ok) {
    throw await apiErrorFromResponse(response);
  }
  return HostSessionVisibilityUpdateResponseSchema.parse(await response.json());
}

export function openHostSession(
  sessionId: string,
  envelope: HostSessionRevisionEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/open`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(SessionRevisionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function closeHostSession(
  sessionId: string,
  envelope: HostSessionCloseEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(CloseHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function publishHostSession(
  sessionId: string,
  envelope: HostSessionPublishEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(PublishHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function correctionPublishHostSession(
  sessionId: string,
  envelope: HostSessionCorrectionPublishEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/correction-publish`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(CorrectionPublishHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function reopenHostSession(
  sessionId: string,
  envelope: HostSessionReverseEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(ReverseHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function unpublishHostSession(
  sessionId: string,
  envelope: HostSessionReverseEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/unpublish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(ReverseHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function returnHostSessionToDraft(
  sessionId: string,
  envelope: HostSessionReverseEnvelope,
  context: ExplicitHostApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/return-to-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(ReverseHostSessionMutationEnvelopeSchema, envelope)),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function previewHostSessionImport(sessionId: string, request: SessionImportRequest) {
  return readmatesFetch<SessionImportPreviewResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  ).then(parseSessionImportPreviewResponse);
}

export function commitHostSessionImport(sessionId: string, request: SessionImportRequest) {
  return readmatesFetch<SessionImportCommitResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
}

export function fetchHostMembers(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<HostMemberListPage>(
    `/api/host/members${pagingSearchParams(page)}`,
    undefined,
    context,
  ).then(parseHostMemberListPage);
}

export function submitHostMemberLifecycle(
  membershipId: string,
  path: "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove",
  request?: MemberLifecycleRequest,
) {
  return readmatesFetchResponse(`/api/host/members/${encodeURIComponent(membershipId)}${path}`, {
    method: "POST",
    body: request ? JSON.stringify(request) : undefined,
  }) as Promise<Response & { json(): Promise<MemberLifecycleResponse> }>;
}

export function submitHostViewerAction(membershipId: string, action: "activate" | "deactivate-viewer") {
  return readmatesFetch<ViewerMember>(`/api/host/members/${encodeURIComponent(membershipId)}/${action}`, {
    method: "POST",
  });
}

export function submitHostMemberProfile(membershipId: string, displayName: string) {
  const request: UpdateHostMemberProfileRequest = { displayName };

  return readmatesFetchResponse(`/api/host/members/${encodeURIComponent(membershipId)}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }) as Promise<Response & { json(): Promise<HostMemberProfileResponse> }>;
}

export function fetchHostInvitations(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<HostInvitationListPage>(`/api/host/invitations${pagingSearchParams(page)}`, undefined, context).then(parseHostInvitationListPage);
}

export function listHostInvitationsResponse(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetchResponse(`/api/host/invitations${pagingSearchParams(page)}`, undefined, context) as Promise<Response & {
    json(): Promise<HostInvitationListPage>;
  }>;
}

export function createHostInvitation(request: CreateHostInvitationRequest) {
  return readmatesFetchResponse("/api/host/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }) as Promise<Response & { json(): Promise<HostInvitationResponse> }>;
}

export function revokeHostInvitation(invitationId: string) {
  return readmatesFetchResponse(`/api/host/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: "POST",
  });
}

export async function parseHostInvitationResponse(response: Response): Promise<HostInvitationResponse> {
  return (await response.json()) as HostInvitationResponse;
}

export async function parseHostInvitationListResponse(response: Response): Promise<HostInvitationListPage> {
  return (await response.json()) as HostInvitationListPage;
}
