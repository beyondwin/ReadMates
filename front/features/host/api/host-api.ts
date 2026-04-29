import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  CreatedSessionResponse,
  CreateHostInvitationRequest,
  CurrentSessionResponse,
  FeedbackDocumentResponse,
  HostAttendanceUpdate,
  HostDashboardResponse,
  HostInvitationListItem,
  HostInvitationResponse,
  HostNotificationDeliveryListResponse,
  HostMemberListItem,
  HostNotificationEventListResponse,
  HostMemberProfileResponse,
  HostNotificationDetailResponse,
  HostNotificationItemListResponse,
  HostNotificationSummary,
  HostNotificationStatus,
  HostSessionDeletionPreviewResponse,
  HostSessionDeletionResponse,
  HostSessionDetailResponse,
  HostSessionListItem,
  HostSessionPublicationRequest,
  HostSessionRequest,
  HostSessionVisibilityRequest,
  MemberLifecycleRequest,
  MemberLifecycleResponse,
  NotificationTestMailAuditItem,
  SendNotificationTestMailRequest,
  UpdateHostMemberProfileRequest,
  ViewerMember,
} from "./host-contracts";

export function fetchHostCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export function fetchHostDashboard(context?: ReadmatesApiContext) {
  return readmatesFetch<HostDashboardResponse>("/api/host/dashboard", undefined, context);
}

export function fetchHostNotificationSummary(context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationSummary>("/api/host/notifications/summary", undefined, context);
}

export function processHostNotifications() {
  return readmatesFetchResponse("/api/host/notifications/process", { method: "POST" });
}

export function fetchHostNotificationItems(status?: HostNotificationStatus, context?: ReadmatesApiContext) {
  const search = status ? `?status=${encodeURIComponent(status)}` : "";
  return readmatesFetch<HostNotificationItemListResponse>(`/api/host/notifications/items${search}`, undefined, context);
}

export function fetchHostNotificationEvents(context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationEventListResponse>("/api/host/notifications/events", undefined, context);
}

export function fetchHostNotificationDeliveries(context?: ReadmatesApiContext) {
  return readmatesFetch<HostNotificationDeliveryListResponse>("/api/host/notifications/deliveries", undefined, context);
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

export function fetchHostNotificationTestMailAudit(context?: ReadmatesApiContext) {
  return readmatesFetch<NotificationTestMailAuditItem[]>("/api/host/notifications/test-mail/audit", undefined, context);
}

export function fetchHostSessions(context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionListItem[]>("/api/host/sessions", undefined, context);
}

export function fetchHostSessionDetail(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`, undefined, context);
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

export function saveHostSessionVisibility(sessionId: string, request: HostSessionVisibilityRequest) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }) as Promise<Response & { json(): Promise<HostSessionDetailResponse> }>;
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

export function uploadHostSessionFeedbackDocument(sessionId: string, formData: FormData) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/feedback-document`, {
    method: "POST",
    body: formData,
  }) as Promise<Response & { json(): Promise<FeedbackDocumentResponse> }>;
}

export function fetchHostMembers(context?: ReadmatesApiContext) {
  return readmatesFetch<HostMemberListItem[]>("/api/host/members", undefined, context);
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

export function fetchHostInvitations(context?: ReadmatesApiContext) {
  return readmatesFetch<HostInvitationListItem[]>("/api/host/invitations", undefined, context);
}

export function listHostInvitationsResponse(context?: ReadmatesApiContext) {
  return readmatesFetchResponse("/api/host/invitations", undefined, context) as Promise<Response & {
    json(): Promise<HostInvitationListItem[]>;
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

export async function parseHostInvitationListResponse(response: Response): Promise<HostInvitationListItem[]> {
  return (await response.json()) as HostInvitationListItem[];
}
