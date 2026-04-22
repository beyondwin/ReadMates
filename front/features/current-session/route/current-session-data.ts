import { redirect, type ActionFunctionArgs } from "react-router-dom";
import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import type { RsvpStatus } from "@/features/current-session/api/current-session-contracts";
import { readmatesFetch } from "@/shared/api/client";
import type { AuthMeResponse } from "@/shared/api/readmates";
import { canUseMemberApp } from "@/shared/auth/member-app-access";

type CurrentSessionActionIntent = "rsvp" | "checkin" | "questions" | "longReview" | "oneLineReview";

type CurrentSessionActionPayload = {
  intent?: unknown;
  status?: unknown;
  readingProgress?: unknown;
  note?: unknown;
  questions?: unknown;
  body?: unknown;
  text?: unknown;
};

export type CurrentSessionRouteData = {
  auth: AuthMeResponse;
  current: Awaited<ReturnType<typeof getCurrentSession>>;
};

export async function loadCurrentSessionRouteData(): Promise<CurrentSessionRouteData> {
  const auth = await readmatesFetch<AuthMeResponse>("/api/auth/me");

  if (!auth.authenticated) {
    throw redirect("/login");
  }

  if (!canUseMemberApp(auth)) {
    return { auth, current: { currentSession: null } };
  }

  const current = await getCurrentSession();

  return { auth, current };
}

export async function currentSessionLoader(): Promise<CurrentSessionRouteData> {
  return loadCurrentSessionRouteData();
}

function badRequest(message: string) {
  return Response.json({ ok: false, message }, { status: 400 });
}

function mutationResponse(response: Response) {
  if (!response.ok) {
    return response;
  }

  return Response.json({ ok: true });
}

function isCurrentSessionActionIntent(intent: unknown): intent is CurrentSessionActionIntent {
  return (
    intent === "rsvp" ||
    intent === "checkin" ||
    intent === "questions" ||
    intent === "longReview" ||
    intent === "oneLineReview"
  );
}

function isRsvpUpdateStatus(status: unknown): status is Exclude<RsvpStatus, "NO_RESPONSE"> {
  return status === "GOING" || status === "MAYBE" || status === "DECLINED";
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function questionPayload(value: unknown): Array<{ text: string }> | null {
  if (Array.isArray(value)) {
    const questions = value
      .filter((question): question is { text: unknown } => typeof question === "object" && question !== null && "text" in question)
      .map((question) => ({ text: stringValue(question.text) }));

    return questions.length === value.length ? questions : null;
  }

  if (typeof value === "string") {
    try {
      return questionPayload(JSON.parse(value));
    } catch {
      return null;
    }
  }

  return null;
}

async function actionPayloadFromRequest(request: Request): Promise<CurrentSessionActionPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await request.json()) as CurrentSessionActionPayload;
  }

  const formData = await request.formData();
  return {
    intent: formData.get("intent"),
    status: formData.get("status"),
    readingProgress: formData.get("readingProgress"),
    note: formData.get("note"),
    questions: formData.get("questions") ?? formData.getAll("question").map((question) => ({ text: question })),
    body: formData.get("body"),
    text: formData.get("text"),
  };
}

export async function currentSessionAction({ request }: ActionFunctionArgs) {
  const payload = await actionPayloadFromRequest(request);

  if (!isCurrentSessionActionIntent(payload.intent)) {
    return badRequest("Unknown current session action.");
  }

  if (payload.intent === "rsvp") {
    if (!isRsvpUpdateStatus(payload.status)) {
      return badRequest("Invalid RSVP status.");
    }

    const response = await updateCurrentSessionRsvp(payload.status);
    return mutationResponse(response);
  }

  if (payload.intent === "checkin") {
    const readingProgress = numberValue(payload.readingProgress);
    if (readingProgress === null) {
      return badRequest("Invalid reading progress.");
    }

    const response = await saveCurrentSessionCheckin(readingProgress, stringValue(payload.note));
    return mutationResponse(response);
  }

  if (payload.intent === "questions") {
    const questions = questionPayload(payload.questions);
    if (questions === null) {
      return badRequest("Invalid questions payload.");
    }

    const response = await saveCurrentSessionQuestions(questions);
    return mutationResponse(response);
  }

  if (payload.intent === "longReview") {
    const response = await saveCurrentSessionLongReview(stringValue(payload.body));
    return mutationResponse(response);
  }

  const response = await saveCurrentSessionOneLineReview(stringValue(payload.text));
  return mutationResponse(response);
}
