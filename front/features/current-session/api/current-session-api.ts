import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import type {
  CheckinRequest,
  CurrentSessionResponse,
  CreateQuestionRequest,
  RsvpStatus,
} from "@/features/current-session/api/current-session-contracts";

type QuestionListItem = Pick<CreateQuestionRequest, "priority" | "text">;

function jsonRequest(init: Omit<RequestInit, "headers" | "body">, body: unknown): RequestInit {
  return {
    ...init,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function getCurrentSession(context?: ReadmatesApiContext) {
  return readmatesFetch<CurrentSessionResponse>("/api/sessions/current", undefined, context);
}

export async function updateCurrentSessionRsvp(status: RsvpStatus) {
  return readmatesFetchResponse(
    "/api/sessions/current/rsvp",
    jsonRequest({ method: "PATCH" }, { status }),
  );
}

export async function saveCurrentSessionCheckin(readingProgress: CheckinRequest["readingProgress"]) {
  return readmatesFetchResponse(
    "/api/sessions/current/checkin",
    jsonRequest({ method: "PUT" }, { readingProgress }),
  );
}

export async function saveCurrentSessionQuestion(
  priority: CreateQuestionRequest["priority"],
  text: CreateQuestionRequest["text"],
  draftThought: NonNullable<CreateQuestionRequest["draftThought"]>,
) {
  return readmatesFetchResponse(
    "/api/sessions/current/questions",
    jsonRequest({ method: "POST" }, { priority, text, draftThought }),
  );
}

export async function saveCurrentSessionQuestions(questions: QuestionListItem[]) {
  return readmatesFetchResponse(
    "/api/sessions/current/questions",
    jsonRequest({ method: "PUT" }, { questions }),
  );
}

export async function saveCurrentSessionOneLineReview(text: string) {
  return readmatesFetchResponse(
    "/api/sessions/current/one-line-reviews",
    jsonRequest({ method: "POST" }, { text }),
  );
}

export async function saveCurrentSessionLongReview(body: string) {
  return readmatesFetchResponse(
    "/api/sessions/current/reviews",
    jsonRequest({ method: "POST" }, { body }),
  );
}
