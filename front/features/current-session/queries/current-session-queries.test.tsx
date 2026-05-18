import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/current-session/api/current-session-api", () => ({
  getCurrentSession: vi.fn(),
  saveCurrentSessionCheckin: vi.fn(),
  saveCurrentSessionLongReview: vi.fn(),
  saveCurrentSessionOneLineReview: vi.fn(),
  saveCurrentSessionQuestions: vi.fn(),
  updateCurrentSessionRsvp: vi.fn(),
}));

import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import {
  currentSessionKeys,
  currentSessionQuery,
  invalidateCurrentSession,
  useSaveCurrentSessionCheckinMutation,
  useSaveCurrentSessionLongReviewMutation,
  useSaveCurrentSessionOneLineReviewMutation,
  useSaveCurrentSessionQuestionsMutation,
  useUpdateCurrentSessionRsvpMutation,
} from "./current-session-queries";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) {
    throw new Error("Missing queryFn");
  }
  return query.queryFn({} as never);
}

beforeEach(() => {
  vi.mocked(getCurrentSession).mockReset();
  vi.mocked(updateCurrentSessionRsvp).mockReset();
  vi.mocked(saveCurrentSessionCheckin).mockReset();
  vi.mocked(saveCurrentSessionQuestions).mockReset();
  vi.mocked(saveCurrentSessionLongReview).mockReset();
  vi.mocked(saveCurrentSessionOneLineReview).mockReset();
});

describe("current session query keys", () => {
  it("scopes keys by club slug and uses null for unscoped routes", () => {
    expect(currentSessionKeys.scope({ clubSlug: "reading-sai" })).toEqual([
      "current-session",
      "scope",
      "reading-sai",
    ]);
    expect(currentSessionKeys.current({ clubSlug: "reading-sai" })).toEqual([
      "current-session",
      "scope",
      "reading-sai",
      "current",
    ]);
    expect(currentSessionKeys.scope()).toEqual(["current-session", "scope", null]);
  });

  it("query function calls getCurrentSession with the route context", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ currentSession: null });

    await runQuery(currentSessionQuery({ clubSlug: "reading-sai" }));

    expect(getCurrentSession).toHaveBeenCalledWith({ clubSlug: "reading-sai" });
  });

  it("invalidates the current session scope", async () => {
    const client = { invalidateQueries: vi.fn().mockResolvedValue(undefined) };

    await invalidateCurrentSession(client as never, { clubSlug: "reading-sai" });

    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: currentSessionKeys.scope({ clubSlug: "reading-sai" }),
    });
  });
});

describe("current session mutation hooks", () => {
  it.each([
    [
      "rsvp",
      () => useUpdateCurrentSessionRsvpMutation({ clubSlug: "reading-sai" }),
      updateCurrentSessionRsvp,
      "GOING" as const,
    ],
    [
      "checkin",
      () => useSaveCurrentSessionCheckinMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionCheckin,
      72,
    ],
    [
      "questions",
      () => useSaveCurrentSessionQuestionsMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionQuestions,
      [{ priority: 1, text: "토론 질문" }],
    ],
    [
      "long review",
      () => useSaveCurrentSessionLongReviewMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionLongReview,
      "긴 서평",
    ],
    [
      "one-line review",
      () => useSaveCurrentSessionOneLineReviewMutation({ clubSlug: "reading-sai" }),
      saveCurrentSessionOneLineReview,
      "한줄평",
    ],
  ] as const)("invalidates current-session after successful %s save", async (_name, hook, apiFn, payload) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(hook, { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(payload as never);
    });

    expect(apiFn).toHaveBeenCalledWith(payload, { clubSlug: "reading-sai" });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: currentSessionKeys.scope({ clubSlug: "reading-sai" }),
    });
  });

  it("throws and leaves cache untouched when a save response is not ok", async () => {
    vi.mocked(saveCurrentSessionCheckin).mockResolvedValue(new Response("bad request", { status: 400 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => useSaveCurrentSessionCheckinMutation({ clubSlug: "reading-sai" }),
      { wrapper: Wrapper },
    );

    await expect(result.current.mutateAsync(72)).rejects.toThrow("Current session save failed");
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
