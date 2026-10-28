import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RECOVER_READ_SESSION_EXPIRY, type ReadmatesApiContext } from "@/shared/api/client";

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
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

function cacheState(client: QueryClient) {
  return client.getQueryCache().getAll().map((query) => ({
    queryKey: query.queryKey,
    data: query.state.data,
    isInvalidated: query.state.isInvalidated,
  }));
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

  it("writes the scoped query result to the normalized cache key", async () => {
    const response = { currentSession: null };
    const context = { clubSlug: "reading-sai" };
    vi.mocked(getCurrentSession).mockResolvedValue(response);
    const { client } = createWrapper();
    const options = currentSessionQuery(context);

    await client.fetchQuery(options);

    expect(options.queryKey).toEqual(currentSessionKeys.current(context));
    expect(getCurrentSession).toHaveBeenCalledWith(context);
    expect(client.getQueryData(currentSessionKeys.current(context))).toEqual(response);
  });

  it("opts only an explicitly mounted current-session query into read recovery", async () => {
    const response = { currentSession: null };
    const context = { clubSlug: "reading-sai" };
    vi.mocked(getCurrentSession).mockResolvedValue(response);
    const { client } = createWrapper();

    await client.fetchQuery(currentSessionQuery(context, RECOVER_READ_SESSION_EXPIRY));

    expect(getCurrentSession).toHaveBeenCalledWith(context, RECOVER_READ_SESSION_EXPIRY);
  });

  it("invalidates only the selected current-session scope while preserving values", async () => {
    const { client } = createWrapper();
    const selectedKey = currentSessionKeys.current({ clubSlug: "reading-sai" });
    const otherKey = currentSessionKeys.current({ clubSlug: "other-club" });
    client.setQueryData(selectedKey, { currentSession: { sessionId: "session-7" } });
    client.setQueryData(otherKey, { currentSession: { sessionId: "session-9" } });

    await invalidateCurrentSession(client, { clubSlug: "reading-sai" });

    expect(client.getQueryState(selectedKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(selectedKey)).toEqual({ currentSession: { sessionId: "session-7" } });
    expect(client.getQueryData(otherKey)).toEqual({ currentSession: { sessionId: "session-9" } });
  });
});

function mutationCase<T>(
  name: string,
  useMutation: () => { mutateAsync: (payload: T) => Promise<void> },
  api: (payload: T, context?: ReadmatesApiContext) => Promise<Response>,
  payload: T,
) {
  return {
    name,
    useRun() {
      const mutation = useMutation();
      return () => mutation.mutateAsync(payload);
    },
    respond(response: Response) { vi.mocked(api).mockResolvedValue(response); },
    expectSaved() { expect(api).toHaveBeenCalledWith(payload, { clubSlug: "reading-sai" }); },
  };
}

const mutationCases = [
  mutationCase("rsvp", () => useUpdateCurrentSessionRsvpMutation({ clubSlug: "reading-sai" }), updateCurrentSessionRsvp, "GOING"),
  mutationCase("checkin", () => useSaveCurrentSessionCheckinMutation({ clubSlug: "reading-sai" }), saveCurrentSessionCheckin, 72),
  mutationCase("questions", () => useSaveCurrentSessionQuestionsMutation({ clubSlug: "reading-sai" }), saveCurrentSessionQuestions, [{ priority: 1, text: "토론 질문" }]),
  mutationCase("long review", () => useSaveCurrentSessionLongReviewMutation({ clubSlug: "reading-sai" }), saveCurrentSessionLongReview, "긴 서평"),
  mutationCase("one-line review", () => useSaveCurrentSessionOneLineReviewMutation({ clubSlug: "reading-sai" }), saveCurrentSessionOneLineReview, "한줄평"),
];

describe("current session mutation hooks", () => {
  it.each(mutationCases)("invalidates the scoped cache and preserves its value after successful $name save", async ({ useRun, respond, expectSaved }) => {
    respond(new Response("{}", { status: 200 }));
    const { client, Wrapper } = createWrapper();
    const selectedKey = currentSessionKeys.current({ clubSlug: "reading-sai" });
    const otherKey = currentSessionKeys.current({ clubSlug: "other-club" });
    client.setQueryData(selectedKey, { currentSession: { sessionId: "session-7" } });
    client.setQueryData(otherKey, { currentSession: { sessionId: "session-9" } });
    const { result } = renderHook(useRun, { wrapper: Wrapper });

    await act(async () => {
      await result.current();
    });

    expectSaved();
    expect(client.getQueryState(selectedKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(selectedKey)).toEqual({ currentSession: { sessionId: "session-7" } });
  });

  it.each(mutationCases)("leaves every cached scope unchanged when $name save fails", async ({ useRun, respond }) => {
    respond(new Response("bad request", { status: 400 }));
    const { client, Wrapper } = createWrapper();
    client.setQueryData(
      currentSessionKeys.current({ clubSlug: "reading-sai" }),
      { currentSession: { sessionId: "session-7" } },
    );
    client.setQueryData(
      currentSessionKeys.current({ clubSlug: "other-club" }),
      { currentSession: { sessionId: "session-9" } },
    );
    const before = cacheState(client);
    const { result } = renderHook(useRun, { wrapper: Wrapper });

    await expect(result.current()).rejects.toThrow("Current session save failed");
    expect(cacheState(client)).toEqual(before);
  });
});
