import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
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

export async function fetchArchiveSessions(context?: ReadmatesApiContext) {
  return readmatesFetch<ArchiveSessionItem[]>("/api/archive/sessions", undefined, context);
}

export async function fetchMyArchiveQuestions(context?: ReadmatesApiContext) {
  return readmatesFetch<MyArchiveQuestionItem[]>("/api/archive/me/questions", undefined, context);
}

export async function fetchMyArchiveReviews(context?: ReadmatesApiContext) {
  return readmatesFetch<MyArchiveReviewItem[]>("/api/archive/me/reviews", undefined, context);
}

export async function fetchMyFeedbackDocuments(context?: ReadmatesApiContext): Promise<FeedbackDocumentListItem[]> {
  const response = await readmatesFetchResponse("/api/feedback-documents/me", undefined, context);

  if (response.status === 403) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`ReadMates feedback documents fetch failed: ${response.status}`);
  }

  return response.json() as Promise<FeedbackDocumentListItem[]>;
}

export async function fetchMemberArchiveSession(sessionId: string, context?: ReadmatesApiContext) {
  const response = await readmatesFetchResponse(`/api/archive/sessions/${encodeURIComponent(sessionId)}`, undefined, context);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`ReadMates member session fetch failed: ${sessionId} (${response.status})`);
  }

  return response.json() as Promise<MemberArchiveSessionDetailResponse>;
}

export async function fetchMyPage(context?: ReadmatesApiContext) {
  return readmatesFetch<MyPageResponse>("/api/app/me", undefined, context);
}

export async function updateMyProfile(displayName: string) {
  const request: UpdateMemberProfileRequest = { displayName };

  return readmatesFetchResponse(
    "/api/me/profile",
    jsonRequest({ method: "PATCH" }, request),
  ) as Promise<Response & { json(): Promise<MemberProfileResponse> }>;
}

export async function fetchNoteSessions(context?: ReadmatesApiContext) {
  return readmatesFetch<NoteSessionItem[]>("/api/notes/sessions", undefined, context);
}

export async function fetchNotesFeed(sessionId: string, context?: ReadmatesApiContext) {
  return readmatesFetch<NoteFeedItem[]>(`/api/notes/feed?sessionId=${encodeURIComponent(sessionId)}`, undefined, context);
}

export async function leaveMembership(currentSessionPolicy: CurrentSessionPolicy = "APPLY_NOW") {
  return readmatesFetchResponse(
    "/api/me/membership/leave",
    jsonRequest({ method: "POST" }, { currentSessionPolicy }),
  );
}

export function fetchNotificationPreferences(context?: ReadmatesApiContext) {
  return readmatesFetch<NotificationPreferencesResponse>("/api/me/notifications/preferences", undefined, context);
}

export function saveNotificationPreferences(request: NotificationPreferencesRequest) {
  return readmatesFetch<NotificationPreferencesResponse>(
    "/api/me/notifications/preferences",
    jsonRequest({ method: "PUT" }, request),
  );
}
