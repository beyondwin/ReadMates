import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import type {
  ArchiveSessionItem,
  CurrentSessionPolicy,
  FeedbackDocumentListItem,
  MemberProfileResponse,
  NotificationPreferencesRequest,
  NotificationPreferencesResponse,
  UpdateMemberProfileRequest,
  MemberArchiveSessionDetailResponse,
  MyArchiveQuestionItem,
  MyArchiveReviewItem,
  MyPageResponse,
  NoteFeedItem,
  NoteSessionItem,
} from "@/features/archive/api/archive-contracts";

function jsonRequest(init: Omit<RequestInit, "headers" | "body">, body: unknown): RequestInit {
  return {
    ...init,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function fetchArchiveSessions() {
  return readmatesFetch<ArchiveSessionItem[]>("/api/archive/sessions");
}

export async function fetchMyArchiveQuestions() {
  return readmatesFetch<MyArchiveQuestionItem[]>("/api/archive/me/questions");
}

export async function fetchMyArchiveReviews() {
  return readmatesFetch<MyArchiveReviewItem[]>("/api/archive/me/reviews");
}

export async function fetchMyFeedbackDocuments(): Promise<FeedbackDocumentListItem[]> {
  const response = await readmatesFetchResponse("/api/feedback-documents/me");

  if (response.status === 403) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`ReadMates feedback documents fetch failed: ${response.status}`);
  }

  return response.json() as Promise<FeedbackDocumentListItem[]>;
}

export async function fetchMemberArchiveSession(sessionId: string) {
  const response = await readmatesFetchResponse(`/api/archive/sessions/${encodeURIComponent(sessionId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`ReadMates member session fetch failed: ${sessionId} (${response.status})`);
  }

  return response.json() as Promise<MemberArchiveSessionDetailResponse>;
}

export async function fetchMyPage() {
  return readmatesFetch<MyPageResponse>("/api/app/me");
}

export async function updateMyProfile(displayName: string) {
  const request: UpdateMemberProfileRequest = { displayName };

  return readmatesFetchResponse(
    "/api/me/profile",
    jsonRequest({ method: "PATCH" }, request),
  ) as Promise<Response & { json(): Promise<MemberProfileResponse> }>;
}

export async function fetchNoteSessions() {
  return readmatesFetch<NoteSessionItem[]>("/api/notes/sessions");
}

export async function fetchNotesFeed(sessionId: string) {
  return readmatesFetch<NoteFeedItem[]>(`/api/notes/feed?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function leaveMembership(currentSessionPolicy: CurrentSessionPolicy = "APPLY_NOW") {
  return readmatesFetchResponse(
    "/api/me/membership/leave",
    jsonRequest({ method: "POST" }, { currentSessionPolicy }),
  );
}

export function fetchNotificationPreferences() {
  return readmatesFetch<NotificationPreferencesResponse>("/api/me/notifications/preferences");
}

export function saveNotificationPreferences(request: NotificationPreferencesRequest) {
  return readmatesFetch<NotificationPreferencesResponse>(
    "/api/me/notifications/preferences",
    jsonRequest({ method: "PUT" }, request),
  );
}
