import { readmatesFetch, readmatesFetchResponse, type ReadmatesApiContext } from "@/shared/api/client";
import {
  parseCurrentSessionResponse,
  type CheckinRequest,
  type CreateQuestionRequest,
  type RsvpStatus,
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
  return readmatesFetch<unknown>("/api/sessions/current", undefined, context).then(parseCurrentSessionResponse);
}

export async function updateCurrentSessionRsvp(status: RsvpStatus, context?: ReadmatesApiContext) {
  return readmatesFetchResponse(
    "/api/sessions/current/rsvp",
    jsonRequest({ method: "PATCH" }, { status }),
    context,
  );
}

export async function saveCurrentSessionCheckin(
  readingProgress: CheckinRequest["readingProgress"],
  context?: ReadmatesApiContext,
) {
  return readmatesFetchResponse(
    "/api/sessions/current/checkin",
    jsonRequest({ method: "PUT" }, { readingProgress }),
    context,
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

export async function saveCurrentSessionQuestions(questions: QuestionListItem[], context?: ReadmatesApiContext) {
  return readmatesFetchResponse(
    "/api/sessions/current/questions",
    jsonRequest({ method: "PUT" }, { questions }),
    context,
  );
}

export async function saveCurrentSessionOneLineReview(text: string, context?: ReadmatesApiContext) {
  return readmatesFetchResponse(
    "/api/sessions/current/one-line-reviews",
    jsonRequest({ method: "POST" }, { text }),
    context,
  );
}

export async function saveCurrentSessionLongReview(body: string, context?: ReadmatesApiContext) {
  return readmatesFetchResponse(
    "/api/sessions/current/reviews",
    jsonRequest({ method: "POST" }, { body }),
    context,
  );
}
