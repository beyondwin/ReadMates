import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import { saveCheckin } from "@/features/current-session/actions/save-checkin";
import { saveQuestion, saveQuestions } from "@/features/current-session/actions/save-question";
import { saveLongReview, saveOneLineReview } from "@/features/current-session/actions/save-review";
import { updateRsvp } from "@/features/current-session/actions/update-rsvp";
import { currentSessionAction } from "@/features/current-session/route/current-session-data";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectJsonRequest(
  fetchMock: ReturnType<typeof vi.fn>,
  callNumber: number,
  expected: { path: string; method: string; body: unknown },
) {
  expect(fetchMock).toHaveBeenNthCalledWith(
    callNumber,
    expected.path,
    expect.objectContaining({
      method: expected.method,
      body: JSON.stringify(expected.body),
      cache: "no-store",
    }),
  );

  const [, init] = fetchMock.mock.calls[callNumber - 1] as [string, RequestInit];
  const headers = init.headers;
  expect(headers).toBeInstanceOf(Headers);
  expect((headers as Headers).get("Content-Type")).toBe("application/json");
}

describe("current session actions", () => {
  it("loads the current session through the feature API client", async () => {
    const responseBody = { currentSession: null };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(responseBody));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCurrentSession()).resolves.toEqual(responseBody);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current",
      expect.objectContaining({
        cache: "no-store",
      }),
    );
  });

  it("routes writes through the current session API client", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveCurrentSessionCheckin(72);
    await saveCurrentSessionQuestions([
      { priority: 1, text: "first question" },
      { priority: 2, text: "second question" },
    ]);
    await saveCurrentSessionLongReview("long review");
    await saveCurrentSessionOneLineReview("one line");
    await updateCurrentSessionRsvp("GOING");

    expectJsonRequest(fetchMock, 1, {
      path: "/api/bff/api/sessions/current/checkin",
      method: "PUT",
      body: { readingProgress: 72 },
    });
    expectJsonRequest(fetchMock, 2, {
      path: "/api/bff/api/sessions/current/questions",
      method: "PUT",
      body: {
        questions: [
          { priority: 1, text: "first question" },
          { priority: 2, text: "second question" },
        ],
      },
    });
    expectJsonRequest(fetchMock, 3, {
      path: "/api/bff/api/sessions/current/reviews",
      method: "POST",
      body: { body: "long review" },
    });
    expectJsonRequest(fetchMock, 4, {
      path: "/api/bff/api/sessions/current/one-line-reviews",
      method: "POST",
      body: { text: "one line" },
    });
    expectJsonRequest(fetchMock, 5, {
      path: "/api/bff/api/sessions/current/rsvp",
      method: "PATCH",
      body: { status: "GOING" },
    });
  });

  it("routes save actions through the centralized ReadMates fetch helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveCheckin(72);
    await saveQuestion(1, "single question", "draft thought");
    await saveQuestions([
      { priority: 1, text: "first question" },
      { priority: 2, text: "second question" },
    ]);
    await saveLongReview("long review");
    await saveOneLineReview("one line");
    await updateRsvp("GOING");

    expectJsonRequest(fetchMock, 1, {
      path: "/api/bff/api/sessions/current/checkin",
      method: "PUT",
      body: { readingProgress: 72 },
    });
    expectJsonRequest(fetchMock, 2, {
      path: "/api/bff/api/sessions/current/questions",
      method: "POST",
      body: { priority: 1, text: "single question", draftThought: "draft thought" },
    });
    expectJsonRequest(fetchMock, 3, {
      path: "/api/bff/api/sessions/current/questions",
      method: "PUT",
      body: {
        questions: [
          { priority: 1, text: "first question" },
          { priority: 2, text: "second question" },
        ],
      },
    });
    expectJsonRequest(fetchMock, 4, {
      path: "/api/bff/api/sessions/current/reviews",
      method: "POST",
      body: { body: "long review" },
    });
    expectJsonRequest(fetchMock, 5, {
      path: "/api/bff/api/sessions/current/one-line-reviews",
      method: "POST",
      body: { text: "one line" },
    });
    expectJsonRequest(fetchMock, 6, {
      path: "/api/bff/api/sessions/current/rsvp",
      method: "PATCH",
      body: { status: "GOING" },
    });
  });

  it("uses centralized 401 handling for action responses", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign: assignMock });

    await expect(saveCheckin(10)).rejects.toThrow("ReadMates session expired");

    expect(assignMock).toHaveBeenCalledWith("/login");
  });

  it.each([
    ["rsvp", { intent: "rsvp", status: "GOING" }],
    ["checkin", { intent: "checkin", readingProgress: 35 }],
    ["questions", { intent: "questions", questions: [{ priority: 2, text: "blocked question" }] }],
    ["longReview", { intent: "longReview", body: "blocked review" }],
    ["oneLineReview", { intent: "oneLineReview", text: "blocked line" }],
  ])("returns failed backend responses from the %s route action", async (_intent, payload) => {
    const failureBody = { code: "CURRENT_SESSION_WRITE_REJECTED", message: "Cannot write current session data." };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(failureBody, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new Request("https://readmates.test/app/session/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await currentSessionAction({ request } as Parameters<typeof currentSessionAction>[0]);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual(failureBody);
  });
});
