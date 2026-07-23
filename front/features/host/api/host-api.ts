import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";
import type {
  CreatedSessionResponse,
  CreateHostInvitationRequest,
  HostAttendanceUpdate,
  HostClubOperationsResponse,
  HostDashboardResponse,
  HostInvitationListPage,
  HostInvitationResponse,
  HostNotificationDeliveryListResponse,
  HostMemberListPage,
  HostNotificationEventListResponse,
  HostMemberProfileResponse,
  HostNotificationDetailResponse,
  HostNotificationEventType,
  HostNotificationItemListResponse,
  HostNotificationSummary,
  HostNotificationStatus,
  HostSessionDeletionPreviewResponse,
  HostSessionDeletionResponse,
  HostSessionClosingStatusResponse,
  HostSessionDetailResponse,
  HostSessionListPage,
  HostSessionPublicationRequest,
  HostSessionRequest,
  HostSessionVisibilityRequest,
  HostSessionVisibilityPreviewRequest,
  HostSessionVisibilityPreviewResponse,
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
  ViewerMember,
} from "./host-contracts";
import {
  parseHostSessionDetailResponse,
  parseHostNotificationDeliveryListResponse,
  parseHostInvitationListPage,
  parseSessionImportPreviewResponse,
} from "./host-contracts";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";

export function fetchHostCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export function fetchHostDashboard(context?: ReadmatesApiContext) {
  return readmatesFetch<HostDashboardResponse>("/api/host/dashboard", undefined, context);
}

export function fetchHostClubOperations(context: { clubSlug: string | undefined }) {
  return readmatesFetch<HostClubOperationsResponse>("/api/host/club-operations", undefined, context);
}

export function fetchHostNotificationSummary(context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationSummary>("/api/host/notifications/summary", undefined, context);
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

export function fetchHostSessionDetail(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`, undefined, context).then(parseHostSessionDetailResponse);
}

export function fetchHostSessionClosingStatus(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionClosingStatusResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/closing-status`,
    undefined,
    context,
  );
}

export function createHostSession(request: HostSessionRequest) {
  return readmatesFetchResponse("/api/host/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }) as Promise<Response & { json(): Promise<CreatedSessionResponse> }>;
}

export function updateHostSession(sessionId: string, request: HostSessionRequest) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function fetchHostSessionDeletionPreview(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/deletion-preview`, {
    method: "GET",
  }, context) as Promise<Response & { json(): Promise<HostSessionDeletionPreviewResponse> }>;
}

export function deleteHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  }) as Promise<Response & { json(): Promise<HostSessionDeletionResponse> }>;
}

export function saveHostSessionAttendance(sessionId: string, attendance: HostAttendanceUpdate[]) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/attendance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(attendance),
  });
}

export function saveHostSessionPublication(sessionId: string, request: HostSessionPublicationRequest) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publication`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export function saveHostSessionVisibility(
  sessionId: string,
  request: HostSessionVisibilityRequest,
  context?: ReadmatesApiContext,
) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, context) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function previewHostSessionVisibility(
  sessionId: string,
  request: HostSessionVisibilityPreviewRequest,
  context?: ReadmatesApiContext,
) {
  return readmatesFetch<HostSessionVisibilityPreviewResponse>(
    `/api/host/sessions/${encodeURIComponent(sessionId)}/visibility-preview`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    context,
  );
}

export function openHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/open`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function closeHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
}

export function publishHostSession(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/publish`, {
    method: "POST",
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
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
  return readmatesFetch<HostMemberListPage>(`/api/host/members${pagingSearchParams(page)}`, undefined, context);
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
