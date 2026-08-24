import {
  readmatesFetch,
  readmatesFetchResponse,
  RECOVER_READ_SESSION_EXPIRY,
  type ExplicitReadmatesApiContext,
} from "@/shared/api/client";
import {
  completeHostResponseBody,
  hostApiErrorFromResponse,
  isHostSecurityPurgeCode,
  readHostResponseJson,
} from "@/shared/api/host-authority-event";
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

async function rawHostResponse(
  responsePromise: Promise<Response>,
  context: ExplicitHostApiContext,
  requestKind: string,
): Promise<Response> {
  const response = await responsePromise;
  if (!response.ok) {
    const error = await hostApiErrorFromResponse(response, {
      clubSlug: context.clubSlug,
      requestKind,
    });
    if (isHostSecurityPurgeCode(error.code)) throw error;
  }
  return completeHostResponseBody(response);
}

export function fetchHostCurrentSession(context: ExplicitHostApiContext) {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export function fetchHostClubOperations(context: ExplicitHostApiContext) {
  return readmatesFetch<HostClubOperationsResponse>("/api/host/club-operations", undefined, context);
}

export function fetchHostNotificationSummary(context: ExplicitHostApiContext) {
  return readmatesFetch<HostNotificationSummary>("/api/host/notifications/summary", undefined, context);
}

export function fetchHostNotificationPolicy(context: ExplicitHostApiContext) {
  return readmatesFetch<HostNotificationPolicyResponse>(
    "/api/host/notifications/policy",
    undefined,
    context,
  );
}

export function updateHostNotificationPolicy(
  request: UpdateHostNotificationPolicyRequest,
  context: ExplicitHostApiContext,
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

export function processHostNotifications(context: ExplicitHostApiContext) {
  return rawHostResponse(
    readmatesFetchResponse("/api/host/notifications/process", { method: "POST" }, context),
    context,
    "NOTIFICATIONS_PROCESS",
  );
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

export function fetchHostNotificationItems(
  status: HostNotificationStatus | undefined,
  context: ExplicitHostApiContext,
  page?: PageRequest,
) {
  const search = hostNotificationItemSearch(status, page);
  return readmatesFetch<HostNotificationItemListResponse>(`/api/host/notifications/items${search}`, undefined, context);
}

export function fetchHostNotificationEvents(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<HostNotificationEventListResponse>(`/api/host/notifications/events${pagingSearchParams(page)}`, undefined, context);
}

export function fetchHostNotificationDeliveries(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<HostNotificationDeliveryListResponse>(`/api/host/notifications/deliveries${pagingSearchParams(page)}`, undefined, context).then(parseHostNotificationDeliveryListResponse);
}

export function fetchManualNotificationOptions(
  context: ExplicitHostApiContext,
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
  context: ExplicitHostApiContext,
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

export function previewManualNotification(
  request: ManualNotificationPreviewRequest,
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<ManualNotificationPreviewResponse>("/api/host/notifications/manual/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context);
}

export function confirmManualNotification(
  request: ManualNotificationConfirmRequest,
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<ManualNotificationConfirmResponse>("/api/host/notifications/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context);
}

export function fetchHostNotificationDetail(id: string, context: ExplicitHostApiContext) {
  return readmatesFetch<HostNotificationDetailResponse>(
    `/api/host/notifications/items/${encodeURIComponent(id)}`,
    undefined,
    context,
  );
}

export function retryHostNotification(id: string, context: ExplicitHostApiContext) {
  return readmatesFetch<HostNotificationDetailResponse>(
    `/api/host/notifications/items/${encodeURIComponent(id)}/retry`,
    { method: "POST" },
    context,
  );
}

export function restoreHostNotification(id: string, context: ExplicitHostApiContext) {
  return readmatesFetch<HostNotificationDetailResponse>(
    `/api/host/notifications/items/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
    context,
  );
}

export function sendHostNotificationTestMail(
  request: SendNotificationTestMailRequest,
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<NotificationTestMailAuditItem>("/api/host/notifications/test-mail", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context);
}

export function fetchHostNotificationTestMailAudit(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<NotificationTestMailAuditPage>(`/api/host/notifications/test-mail/audit${pagingSearchParams(page)}`, undefined, context);
}

export function fetchHostSessions(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<HostSessionListPage>(`/api/host/sessions${pagingSearchParams(page)}`, undefined, context);
}

export function fetchHostSessionList(
  mode: HostListMode,
  context: ExplicitHostApiContext,
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

export function fetchHostSessionScheduleDefaults(context: ExplicitHostApiContext) {
  return readmatesFetch<HostSessionScheduleDefaultsWire>(
    "/api/host/sessions/schedule-defaults",
    undefined,
    context,
    RECOVER_READ_SESSION_EXPIRY,
  ).then(normalizeHostSessionScheduleDefaults);
}

export function fetchHostSessionDetail(sessionId: string, context: ExplicitHostApiContext) {
  return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`, undefined, context).then(parseHostSessionDetailResponse);
}

export function fetchHostSessionTrashList(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<HostSessionTrashPage>(
    `/api/host/sessions/trash${pagingSearchParams(page)}`,
    undefined,
    context,
  ).then(parseHostSessionTrashPage);
}

export function fetchHostSessionTrash(sessionId: string, context: ExplicitHostApiContext) {
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

export function fetchHostSessionClosingStatus(sessionId: string, context: ExplicitHostApiContext) {
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
  return rawHostResponse(readmatesFetchResponse("/api/host/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(CreateHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_CREATE") as Promise<Response & { json(): Promise<CreatedSessionResponse> }>;
}

export function updateHostSession(
  sessionId: string,
  envelope: HostSessionUpdateEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(UpdateHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_BASIC_SAVE") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function fetchHostSessionDeletionPreview(
  sessionId: string,
  context: ExplicitHostApiContext,
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
    throw await hostApiErrorFromResponse(response, {
      clubSlug: context.clubSlug,
      requestKind: "SESSION_ATTENDANCE_SAVE",
    });
  }
  return parseHostAttendanceResponse(await readHostResponseJson(response));
}

export function saveHostSessionPublication(
  sessionId: string,
  envelope: HostSessionPublicationEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publication`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(PublicationHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_PUBLICATION_SAVE");
}

export async function saveHostSessionVisibility(
  sessionId: string,
  request: HostSessionVisibilityRequest,
  context: ExplicitHostApiContext,
): Promise<HostSessionVisibilityUpdateResult> {
  const response = await readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context);
  if (!response.ok) {
    throw await hostApiErrorFromResponse(response, {
      clubSlug: context.clubSlug,
      requestKind: "SESSION_VISIBILITY_SAVE",
    });
  }
  return HostSessionVisibilityUpdateResponseSchema.parse(
    await readHostResponseJson(response),
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
    throw await hostApiErrorFromResponse(response, {
      clubSlug: context.clubSlug,
      requestKind: "SESSION_ACCESS_SCOPE_SAVE",
    });
  }
  return HostSessionVisibilityUpdateResponseSchema.parse(await readHostResponseJson(response));
}

export function openHostSession(
  sessionId: string,
  envelope: HostSessionRevisionEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/open`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(SessionRevisionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_OPEN") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function closeHostSession(
  sessionId: string,
  envelope: HostSessionCloseEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(CloseHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_CLOSE") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function publishHostSession(
  sessionId: string,
  envelope: HostSessionPublishEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(PublishHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_PUBLISH") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function correctionPublishHostSession(
  sessionId: string,
  envelope: HostSessionCorrectionPublishEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/correction-publish`, {
    method: "POST",
    body: JSON.stringify(parseEnvelope(CorrectionPublishHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_CORRECTION_PUBLISH") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function reopenHostSession(
  sessionId: string,
  envelope: HostSessionReverseEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(ReverseHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_REOPEN") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function unpublishHostSession(
  sessionId: string,
  envelope: HostSessionReverseEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/unpublish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(ReverseHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_UNPUBLISH") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function returnHostSessionToDraft(
  sessionId: string,
  envelope: HostSessionReverseEnvelope,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/return-to-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parseEnvelope(ReverseHostSessionMutationEnvelopeSchema, envelope)),
  }, context), context, "SESSION_RETURN_TO_DRAFT") as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function previewHostSessionImport(
  sessionId: string,
  request: SessionImportRequest,
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<SessionImportPreviewResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    context,
  ).then(parseSessionImportPreviewResponse);
}

export function commitHostSessionImport(
  sessionId: string,
  request: SessionImportRequest,
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<SessionImportCommitResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/session-import/commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
    context,
  );
}

export function fetchHostMembers(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<HostMemberListPage>(
    `/api/host/members${pagingSearchParams(page)}`,
    undefined,
    context,
  ).then(parseHostMemberListPage);
}

export function submitHostMemberLifecycle(
  membershipId: string,
  path: "/suspend" | "/deactivate" | "/restore" | "/current-session/add" | "/current-session/remove",
  request: MemberLifecycleRequest | undefined,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/members/${encodeURIComponent(membershipId)}${path}`, {
    method: "POST",
    body: request ? JSON.stringify(request) : undefined,
  }, context), context, "MEMBER_LIFECYCLE") as Promise<Response & { json(): Promise<MemberLifecycleResponse> }>;
}

export function submitHostViewerAction(
  membershipId: string,
  action: "activate" | "deactivate-viewer",
  context: ExplicitHostApiContext,
) {
  return readmatesFetch<ViewerMember>(`/api/host/members/${encodeURIComponent(membershipId)}/${action}`, {
    method: "POST",
  }, context);
}

export function submitHostMemberProfile(
  membershipId: string,
  displayName: string,
  context: ExplicitHostApiContext,
) {
  const request: UpdateHostMemberProfileRequest = { displayName };

  return rawHostResponse(readmatesFetchResponse(`/api/host/members/${encodeURIComponent(membershipId)}/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context), context, "MEMBER_PROFILE") as Promise<Response & { json(): Promise<HostMemberProfileResponse> }>;
}

export function fetchHostInvitations(context: ExplicitHostApiContext, page?: PageRequest) {
  return readmatesFetch<HostInvitationListPage>(`/api/host/invitations${pagingSearchParams(page)}`, undefined, context).then(parseHostInvitationListPage);
}

export function listHostInvitationsResponse(context: ExplicitHostApiContext, page?: PageRequest) {
  return rawHostResponse(
    readmatesFetchResponse(`/api/host/invitations${pagingSearchParams(page)}`, undefined, context),
    context,
    "INVITATION_LIST",
  ) as Promise<Response & {
    json(): Promise<HostInvitationListPage>;
  }>;
}

export function createHostInvitation(
  request: CreateHostInvitationRequest,
  context: ExplicitHostApiContext,
) {
  return rawHostResponse(readmatesFetchResponse("/api/host/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context), context, "INVITATION_CREATE") as Promise<Response & { json(): Promise<HostInvitationResponse> }>;
}

export function revokeHostInvitation(invitationId: string, context: ExplicitHostApiContext) {
  return rawHostResponse(readmatesFetchResponse(`/api/host/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: "POST",
  }, context), context, "INVITATION_REVOKE");
}

export async function parseHostInvitationResponse(response: Response): Promise<HostInvitationResponse> {
  return readHostResponseJson<HostInvitationResponse>(response);
}

export async function parseHostInvitationListResponse(response: Response): Promise<HostInvitationListPage> {
  return readHostResponseJson<HostInvitationListPage>(response);
}
