import { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
import type {
  ArchiveSessionItem,
  CurrentSessionPolicy,
  FeedbackDocumentListItem,
  MemberArchiveSessionDetailResponse,
  MyArchiveQuestionItem,
  MyArchiveReviewItem,
  MyPageResponse,
  NoteFeedItem,
  NoteSessionItem,
} from "@/features/archive/api/archive-contracts";

export type ArchiveListRouteData = {
  sessions: ArchiveSessionItem[];
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
  reports: FeedbackDocumentListItem[];
};

export type MyPageRouteData = {
  data: MyPageResponse;
  reports: FeedbackDocumentListItem[];
  questionCount: number;
  reviewCount: number;
};

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

export async function fetchNoteSessions() {
  return readmatesFetch<NoteSessionItem[]>("/api/notes/sessions");
}

export async function fetchNotesFeed(sessionId: string) {
  return readmatesFetch<NoteFeedItem[]>(`/api/notes/feed?sessionId=${encodeURIComponent(sessionId)}`);
}

export async function loadArchiveListRouteData(): Promise<ArchiveListRouteData> {
  const [sessions, questions, reviews, reports] = await Promise.all([
    fetchArchiveSessions(),
    fetchMyArchiveQuestions(),
    fetchMyArchiveReviews(),
    fetchMyFeedbackDocuments(),
  ]);

  return { sessions, questions, reviews, reports };
}

export async function loadMyPageRouteData(): Promise<MyPageRouteData> {
  const [data, reports, questions, reviews] = await Promise.all([
    fetchMyPage(),
    fetchMyFeedbackDocuments(),
    fetchMyArchiveQuestions(),
    fetchMyArchiveReviews(),
  ]);

  return { data, reports, questionCount: questions.length, reviewCount: reviews.length };
}

export async function leaveMembership(currentSessionPolicy: CurrentSessionPolicy = "APPLY_NOW") {
  return readmatesFetchResponse(
    "/api/me/membership/leave",
    jsonRequest({ method: "POST" }, { currentSessionPolicy }),
  );
}
