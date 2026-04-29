import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
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

export function fetchHostCurrentSession() {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current");
}

export function fetchHostDashboard() {
  return readmatesFetch<HostDashboardResponse>("/api/host/dashboard");
}

export function fetchHostNotificationSummary() {
  return readmatesFetch<HostNotificationSummary>("/api/host/notifications/summary");
}

export function processHostNotifications() {
  return readmatesFetchResponse("/api/host/notifications/process", { method: "POST" });
}

export function fetchHostNotificationItems(status?: HostNotificationStatus) {
  const search = status ? `?status=${encodeURIComponent(status)}` : "";
  return readmatesFetch<HostNotificationItemListResponse>(`/api/host/notifications/items${search}`);
}

export function fetchHostNotificationEvents() {
  return readmatesFetch<HostNotificationEventListResponse>("/api/host/notifications/events");
}

export function fetchHostNotificationDeliveries() {
  return readmatesFetch<HostNotificationDeliveryListResponse>("/api/host/notifications/deliveries");
}

export function fetchHostNotificationDetail(id: string) {
  return readmatesFetch<HostNotificationDetailResponse>(`/api/host/notifications/items/${encodeURIComponent(id)}`);
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

export function fetchHostNotificationTestMailAudit() {
  return readmatesFetch<NotificationTestMailAuditItem[]>("/api/host/notifications/test-mail/audit");
}

export function fetchHostSessions() {
  return readmatesFetch<HostSessionListItem[]>("/api/host/sessions");
}

export function fetchHostSessionDetail(sessionId: string) {
  return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`);
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

export function fetchHostSessionDeletionPreview(sessionId: string) {
  return readmatesFetchResponse(`/api/host/sessions/${encodeURIComponent(sessionId)}/deletion-preview`, {
    method: "GET",
  }) as Promise<Response & { json(): Promise<HostSessionDeletionPreviewResponse> }>;
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

export function fetchHostMembers() {
  return readmatesFetch<HostMemberListItem[]>("/api/host/members");
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

export function fetchHostInvitations() {
  return readmatesFetch<HostInvitationListItem[]>("/api/host/invitations");
}

export function listHostInvitationsResponse() {
  return readmatesFetchResponse("/api/host/invitations") as Promise<Response & {
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
