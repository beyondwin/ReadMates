import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  ArchiveSessionPage,
  CurrentSessionPolicy,
  FeedbackDocumentListPage,
  MemberProfileResponse,
  NotificationPreferencesRequest,
  NotificationPreferencesResponse,
  UpdateMemberProfileRequest,
  MemberArchiveSessionDetailResponse,
  MyArchiveQuestionPage,
  MyArchiveReviewPage,
  MyPageResponse,
  NoteFeedPage,
  NoteSessionPage,
} from "@/features/archive/api/archive-contracts";
import { pagingSearchParams, type PageRequest } from "@/shared/model/paging";

function jsonRequest(init: Omit<RequestInit, "headers" | "body">, body: unknown): RequestInit {
  return {
    ...init,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function fetchArchiveSessions(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<ArchiveSessionPage>(`/api/archive/sessions${pagingSearchParams(page)}`, undefined, context);
}

export async function fetchMyArchiveQuestions(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<MyArchiveQuestionPage>(`/api/archive/me/questions${pagingSearchParams(page)}`, undefined, context);
}

export async function fetchMyArchiveReviews(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<MyArchiveReviewPage>(`/api/archive/me/reviews${pagingSearchParams(page)}`, undefined, context);
}

export async function fetchMyFeedbackDocuments(context?: ReadmatesApiContext, page?: PageRequest): Promise<FeedbackDocumentListPage> {
  const response = await readmatesFetchResponse(`/api/feedback-documents/me${pagingSearchParams(page)}`, undefined, context);

  if (response.status === 403) {
    return { items: [], nextCursor: null };
  }

  if (!response.ok) {
    throw new Error(`ReadMates feedback documents fetch failed: ${response.status}`);
  }

  return response.json() as Promise<FeedbackDocumentListPage>;
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

export async function fetchNoteSessions(context?: ReadmatesApiContext, page?: PageRequest) {
  return readmatesFetch<NoteSessionPage>(`/api/notes/sessions${pagingSearchParams(page)}`, undefined, context);
}

export async function fetchNotesFeed(sessionId: string, context?: ReadmatesApiContext, page?: PageRequest) {
  const params = new URLSearchParams({ sessionId });

  if (page?.limit !== undefined) {
    params.set("limit", String(page.limit));
  }
  if (page?.cursor) {
    params.set("cursor", page.cursor);
  }

  return readmatesFetch<NoteFeedPage>(`/api/notes/feed?${params.toString()}`, undefined, context);
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
