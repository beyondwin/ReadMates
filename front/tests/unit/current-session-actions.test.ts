import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCheckin } from "@/features/current-session/actions/save-checkin";
import { saveQuestions } from "@/features/current-session/actions/save-question";
import { saveLongReview, saveOneLineReview } from "@/features/current-session/actions/save-review";
import { updateRsvp } from "@/features/current-session/actions/update-rsvp";

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
  it("routes save actions through the centralized ReadMates fetch helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await saveCheckin(72, "chapter notes");
    await saveQuestions([{ text: "first question" }, { text: "second question" }]);
    await saveLongReview("long review");
    await saveOneLineReview("one line");
    await updateRsvp("GOING");

    expectJsonRequest(fetchMock, 1, {
      path: "/api/bff/api/sessions/current/checkin",
      method: "PUT",
      body: { readingProgress: 72, note: "chapter notes" },
    });
    expectJsonRequest(fetchMock, 2, {
      path: "/api/bff/api/sessions/current/questions",
      method: "PUT",
      body: { questions: [{ text: "first question" }, { text: "second question" }] },
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

  it("uses centralized 401 handling for action responses", async () => {
    const assignMock = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", { assign: assignMock });

    await expect(saveCheckin(10, "expired")).rejects.toThrow("ReadMates session expired");

    expect(assignMock).toHaveBeenCalledWith("/login");
  });
});
