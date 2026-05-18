# ReadMates Frontend Server-State Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate remaining frontend server-state surfaces by migrating current-session and platform-admin to TanStack Query and extracting shared cursor pagination helpers.

**Architecture:** Preserve the existing route-first frontend boundary. Feature `queries` modules own query keys, queryOptions, mutation hooks, and invalidation/cache-update behavior; route modules keep route params and UI-only state; UI components remain prop/callback driven. Shared cursor helpers stay pure under `front/shared/query` and do not import app, page, or feature code.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vitest, Testing Library, TypeScript.

---

## File Structure

- Create `front/features/current-session/queries/current-session-queries.ts`  
  Owns current-session query keys, `currentSessionQuery`, save mutation hooks, and current-session invalidation.
- Create `front/features/current-session/queries/current-session-queries.test.tsx`  
  Tests current-session query keys, queryFn API calls, mutation invalidation, and non-OK mutation behavior.
- Modify `front/features/current-session/api/current-session-api.ts`  
  Adds optional `ReadmatesApiContext` to current-session mutation API wrappers so route-scoped mutations do not rely on browser location fallback.
- Modify `front/features/current-session/route/current-session-data.ts`  
  Adds `currentSessionLoaderFactory(queryClient)` and seeds `currentSessionQuery(context)` while keeping `currentSessionLoader` for non-factory tests and compatibility.
- Modify `front/features/current-session/route/current-session-route.tsx`  
  Replaces the custom refresh event / loader reload path with `useQuery` and current-session mutation hooks.
- Modify `front/features/current-session/index.ts`  
  Exports `currentSessionLoaderFactory`.
- Modify `front/src/app/routes/member.tsx` and `front/src/app/router.tsx`  
  Passes the app QueryClient into member route construction so current-session loader seeding uses the same cache as components.
- Modify `front/tests/unit/current-session.test.tsx`  
  Wraps route tests in `QueryClientProvider`, removes refresh-event assertions, and adds Query invalidation assertions.

- Create `front/shared/query/cursor-pagination.ts`  
  Provides stable cursor-page normalization and combining helpers.
- Create `front/shared/query/cursor-pagination.test.ts`  
  Pins normalization, cursor append, request generation, and page combining.
- Modify `front/features/host/queries/host-notification-queries.ts`  
  Reuses shared page normalization helpers without changing query key shape.
- Modify `front/features/host/queries/host-session-queries.ts`  
  Reuses shared page normalization helpers without changing query key shape.
- Modify `front/features/host/route/host-notifications-route.tsx`  
  Reuses shared cursor append/page request/combine helpers for ledger pages.
- Modify `front/features/archive/route/archive-list-route.tsx`  
  Reuses `combineCursorPages` for each load-more merge.
- Modify `front/features/host/queries/host-notification-queries.test.ts`, `front/features/host/queries/host-session-queries.test.ts`, and `front/tests/unit/host-notifications.test.tsx` when import names change; keep existing semantic key and load-more assertions intact.

- Create `front/features/platform-admin/queries/platform-admin-queries.ts`  
  Owns platform-admin query keys, queryOptions, mutation hooks, and targeted cache updates.
- Create `front/features/platform-admin/queries/platform-admin-queries.test.tsx`  
  Tests query keys, queryFns, mutation cache updates, and support grant invalidation/update behavior.
- Modify `front/features/platform-admin/route/platform-admin-data.ts`  
  Adds `platformAdminLoaderFactory(queryClient)` and seeds summary/clubs query data while preserving auth-first loading.
- Modify `front/features/platform-admin/route/platform-admin-route.tsx`  
  Reads summary/clubs/support grants from Query and keeps selected club, checking ids, and inline errors as UI-only state.
- Modify `front/src/app/routes/auth.tsx` and `front/src/app/router.tsx`  
  Passes QueryClient into auth routes so `/admin` loader and component share cache.
- Modify `front/tests/unit/platform-admin.test.tsx`  
  Wraps route tests with a query-aware router and updates assertions around support grant loading and mutation updates.

- Modify `docs/development/server-state-migration.md`  
  Marks `current-session` and `platform-admin` complete and documents `shared/query` cursor helpers.
- Modify `CHANGELOG.md`  
  Adds one concise Unreleased entry for the frontend server-state consolidation.

---

### Task 1: Current-Session Query Module And API Context

**Files:**
- Modify: `front/features/current-session/api/current-session-api.ts`
- Create: `front/features/current-session/queries/current-session-queries.ts`
- Create: `front/features/current-session/queries/current-session-queries.test.tsx`

- [ ] **Step 1: Write query and mutation tests**

Create `front/features/current-session/queries/current-session-queries.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm --dir front test -- current-session-queries
```

Expected: FAIL because `front/features/current-session/queries/current-session-queries.ts` does not exist and current-session API mutation functions do not accept a context argument.

- [ ] **Step 3: Add context-aware current-session API wrappers**

Modify `front/features/current-session/api/current-session-api.ts` so every mutation wrapper accepts an optional `ReadmatesApiContext` and passes it to `readmatesFetchResponse`:

```ts
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
  context?: ReadmatesApiContext,
) {
  return readmatesFetchResponse(
    "/api/sessions/current/questions",
    jsonRequest({ method: "POST" }, { priority, text, draftThought }),
    context,
  );
}

export async function saveCurrentSessionQuestions(
  questions: QuestionListItem[],
  context?: ReadmatesApiContext,
) {
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
```

Keep `front/features/current-session/actions/*.ts` unchanged. Those wrappers still compile because the context argument is optional.

- [ ] **Step 4: Implement the current-session query module**

Create `front/features/current-session/queries/current-session-queries.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import type { RsvpStatus } from "@/features/current-session/api/current-session-contracts";
import type { CurrentSessionQuestionPayloadItem } from "@/features/current-session/model/current-session-form-model";
import type { ReadmatesApiContext } from "@/shared/api/client";

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

async function requireOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error("Current session save failed");
  }
}

export const currentSessionKeys = {
  all: ["current-session"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...currentSessionKeys.all, "scope", scopeKey(context)] as const,
  current: (context?: ReadmatesApiContext) =>
    [...currentSessionKeys.scope(context), "current"] as const,
} as const;

export function currentSessionQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: currentSessionKeys.current(context),
    queryFn: () => getCurrentSession(context),
  });
}

export function invalidateCurrentSession(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: currentSessionKeys.scope(context) });
}

export function useUpdateCurrentSessionRsvpMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (status: Exclude<RsvpStatus, "NO_RESPONSE">) => {
      await requireOk(await updateCurrentSessionRsvp(status, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionCheckinMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (readingProgress: number) => {
      await requireOk(await saveCurrentSessionCheckin(readingProgress, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionQuestionsMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (questions: CurrentSessionQuestionPayloadItem[]) => {
      await requireOk(await saveCurrentSessionQuestions(questions, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionLongReviewMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      await requireOk(await saveCurrentSessionLongReview(body, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}

export function useSaveCurrentSessionOneLineReviewMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      await requireOk(await saveCurrentSessionOneLineReview(text, context));
    },
    onSuccess: () => invalidateCurrentSession(client, context),
  });
}
```

- [ ] **Step 5: Run the current-session query test**

Run:

```bash
pnpm --dir front test -- current-session-queries
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add front/features/current-session/api/current-session-api.ts \
  front/features/current-session/queries/current-session-queries.ts \
  front/features/current-session/queries/current-session-queries.test.tsx
git commit -m "feat(front): add current session query hooks"
```

---

### Task 2: Current-Session Route Migration

**Files:**
- Modify: `front/features/current-session/route/current-session-data.ts`
- Modify: `front/features/current-session/route/current-session-route.tsx`
- Modify: `front/features/current-session/index.ts`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`

- [ ] **Step 1: Update the route tests for QueryClientProvider and no refresh event**

In `front/tests/unit/current-session.test.tsx`, add imports:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
```

Add this helper near `installRouterRequestShim()`:

```tsx
function createCurrentSessionTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderCurrentSessionRouter(router: ReturnType<typeof createMemoryRouter>, client = createCurrentSessionTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
```

Replace route renders from:

```tsx
render(<RouterProvider router={router} />);
```

to:

```tsx
renderCurrentSessionRouter(router);
```

Replace the test named `"keeps current session content visible when a route refresh fails"` with:

```tsx
it("keeps current session content visible when a query refetch fails", async () => {
  installRouterRequestShim();
  let currentSessionRequests = 0;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();

    if (url === "/api/bff/api/auth/me") {
      return Promise.resolve(jsonResponse(routeAuthFixture));
    }

    if (url === "/api/bff/api/sessions/current") {
      currentSessionRequests += 1;

      if (currentSessionRequests === 1) {
        return Promise.resolve(jsonResponse(currentSessionData));
      }

      return Promise.resolve(jsonResponse({ message: "current session unavailable" }, 500));
    }

    return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = createCurrentSessionTestQueryClient();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <CurrentSessionRoute />,
        loader: currentSessionLoader,
        errorElement: <div>route error</div>,
        hydrateFallbackElement: <div>세션을 불러오는 중</div>,
      },
    ],
    { initialEntries: ["/"] },
  );

  renderCurrentSessionRouter(router, client);

  expect((await screen.findAllByText("테스트 책")).length).toBeGreaterThan(0);

  await client.invalidateQueries({ queryKey: ["current-session"] });

  await waitFor(() => {
    expect(currentSessionRequests).toBe(2);
  });
  expect(screen.queryByText("route error")).not.toBeInTheDocument();
  expect(screen.getAllByText("테스트 책").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "참석" }).length).toBeGreaterThan(0);
});
```

Replace the test named `"carries clubSlug through route refresh on a club-scoped path"` with:

```tsx
it("carries clubSlug through query refetch on a club-scoped path", async () => {
  installRouterRequestShim();
  const requestedUrls: string[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    requestedUrls.push(url);

    if (url.startsWith("/api/bff/api/auth/me")) {
      return Promise.resolve(jsonResponse(routeAuthFixture));
    }

    if (url.startsWith("/api/bff/api/sessions/current")) {
      return Promise.resolve(jsonResponse(currentSessionData));
    }

    return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = createCurrentSessionTestQueryClient();

  const router = createMemoryRouter(
    [
      {
        path: "/clubs/:clubSlug/app/session/current",
        element: <CurrentSessionRoute />,
        loader: currentSessionLoader,
        errorElement: <div>route error</div>,
        hydrateFallbackElement: <div>세션을 불러오는 중</div>,
      },
    ],
    { initialEntries: ["/clubs/reading-sai/app/session/current"] },
  );

  renderCurrentSessionRouter(router, client);

  expect((await screen.findAllByText("테스트 책")).length).toBeGreaterThan(0);

  const initialSessionRequests = requestedUrls.filter((url) =>
    url.startsWith("/api/bff/api/sessions/current"),
  );
  expect(initialSessionRequests.length).toBeGreaterThan(0);
  for (const url of initialSessionRequests) {
    expect(url).toContain("clubSlug=reading-sai");
  }

  const initialSessionRequestCount = initialSessionRequests.length;
  await client.invalidateQueries({ queryKey: ["current-session"] });

  await waitFor(() => {
    const sessionRequests = requestedUrls.filter((url) =>
      url.startsWith("/api/bff/api/sessions/current"),
    );
    expect(sessionRequests.length).toBe(initialSessionRequestCount + 1);
  });

  const sessionRequestsAfterRefetch = requestedUrls.filter((url) =>
    url.startsWith("/api/bff/api/sessions/current"),
  );
  for (const url of sessionRequestsAfterRefetch) {
    expect(url).toContain("clubSlug=reading-sai");
  }
});
```

- [ ] **Step 2: Run current-session tests to verify they fail**

Run:

```bash
pnpm --dir front test -- current-session
```

Expected: FAIL because `CurrentSessionRoute` still dispatches/listens for `readmates:route-refresh` and does not use Query.

- [ ] **Step 3: Add current-session loader factory**

Modify `front/features/current-session/route/current-session-data.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router-dom";
import {
  getCurrentSession,
  saveCurrentSessionCheckin,
  saveCurrentSessionLongReview,
  saveCurrentSessionOneLineReview,
  saveCurrentSessionQuestions,
  updateCurrentSessionRsvp,
} from "@/features/current-session/api/current-session-api";
import type { RsvpStatus } from "@/features/current-session/api/current-session-contracts";
import { currentSessionQuery } from "@/features/current-session/queries/current-session-queries";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";
```

Keep the existing payload parsing helpers. Replace `loadCurrentSessionRouteData` and `currentSessionLoader` with:

```ts
export async function loadCurrentSessionRouteData(args?: Pick<LoaderFunctionArgs, "params">): Promise<CurrentSessionRouteData> {
  const { auth, allowed } = await loadMemberAppAuth(args);

  if (!allowed) {
    return { auth, current: { currentSession: null } };
  }

  const context = { clubSlug: clubSlugFromLoaderArgs(args) };
  const current = await getCurrentSession(context);

  return { auth, current };
}

export function currentSessionLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<CurrentSessionRouteData> => {
    const { auth, allowed } = await loadMemberAppAuth(args);

    if (!allowed) {
      return { auth, current: { currentSession: null } };
    }

    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    const current = await client.fetchQuery(currentSessionQuery(context));

    return { auth, current };
  };
}

export async function currentSessionLoader(args?: LoaderFunctionArgs): Promise<CurrentSessionRouteData> {
  return loadCurrentSessionRouteData(args);
}
```

Leave `currentSessionAction` in the file for route action compatibility. It still uses the API wrappers without an explicit context, which preserves the current browser path fallback behavior.

- [ ] **Step 4: Replace route refresh state with Query state**

Replace `front/features/current-session/route/current-session-route.tsx` with:

```tsx
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  currentSessionQuery,
  useSaveCurrentSessionCheckinMutation,
  useSaveCurrentSessionLongReviewMutation,
  useSaveCurrentSessionOneLineReviewMutation,
  useSaveCurrentSessionQuestionsMutation,
  useUpdateCurrentSessionRsvpMutation,
} from "@/features/current-session/queries/current-session-queries";
import { CurrentSessionPage, type CurrentSessionSaveActions } from "@/features/current-session/ui/current-session-page";
import type { CurrentSessionInternalLinkProps, InternalLinkComponent } from "@/features/current-session/ui/current-session-types";
import type { CurrentSessionRouteData } from "@/features/current-session/route/current-session-data";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { RouteErrorBoundary } from "@/shared/ui/route-error";

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext | undefined {
  return clubSlug ? { clubSlug } : undefined;
}

function AnchorInternalLink({ href, children, ...props }: CurrentSessionInternalLinkProps) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

export function CurrentSessionRoute({
  internalLinkComponent = AnchorInternalLink,
}: {
  internalLinkComponent?: InternalLinkComponent;
}) {
  const loaderData = useLoaderData() as CurrentSessionRouteData;
  const params = useParams();
  const context = useMemo(() => contextFromClubSlug(params.clubSlug), [params.clubSlug]);
  const currentQuery = useQuery(currentSessionQuery(context));
  const updateRsvpMutation = useUpdateCurrentSessionRsvpMutation(context);
  const saveCheckinMutation = useSaveCurrentSessionCheckinMutation(context);
  const saveQuestionsMutation = useSaveCurrentSessionQuestionsMutation(context);
  const saveLongReviewMutation = useSaveCurrentSessionLongReviewMutation(context);
  const saveOneLineReviewMutation = useSaveCurrentSessionOneLineReviewMutation(context);

  const currentSessionSaveActions = useMemo<CurrentSessionSaveActions>(() => ({
    updateRsvp: (status) => updateRsvpMutation.mutateAsync(status),
    saveCheckin: (readingProgress) => saveCheckinMutation.mutateAsync(readingProgress),
    saveQuestions: (questions) => saveQuestionsMutation.mutateAsync(questions),
    saveLongReview: (body) => saveLongReviewMutation.mutateAsync(body),
    saveOneLineReview: (text) => saveOneLineReviewMutation.mutateAsync(text),
  }), [
    saveCheckinMutation,
    saveLongReviewMutation,
    saveOneLineReviewMutation,
    saveQuestionsMutation,
    updateRsvpMutation,
  ]);

  return (
    <CurrentSessionPage
      auth={loaderData.auth}
      data={currentQuery.data ?? loaderData.current}
      actions={currentSessionSaveActions}
      internalLinkComponent={internalLinkComponent}
    />
  );
}

export function CurrentSessionRouteError() {
  return <RouteErrorBoundary variant="member" />;
}
```

- [ ] **Step 5: Export the loader factory**

Modify `front/features/current-session/index.ts` so the data exports are:

```ts
export {
  currentSessionAction,
  currentSessionLoader,
  currentSessionLoaderFactory,
} from "@/features/current-session/route/current-session-data";
export type { CurrentSessionRouteData } from "@/features/current-session/route/current-session-data";
```

- [ ] **Step 6: Pass QueryClient into member routes**

Modify `front/src/app/routes/member.tsx`:

```tsx
import type { QueryClient } from "@tanstack/react-query";
import type { RouteObject } from "react-router-dom";
```

Change the route builders:

```tsx
function memberAppRoutes(queryClient: QueryClient, options: { includeIndex?: boolean } = {}): RouteObject[] {
```

Inside the `session/current` lazy import, import `currentSessionLoaderFactory` and return the factory loader:

```tsx
const {
  CurrentSessionRoute,
  CurrentSessionRouteError,
  currentSessionAction,
  currentSessionLoaderFactory,
} = await import("@/features/current-session");
```

```tsx
return {
  Component: CurrentSessionRouteElement,
  ErrorBoundary: CurrentSessionRouteError,
  action: currentSessionAction,
  loader: currentSessionLoaderFactory(queryClient),
};
```

Change `memberRoutes` signature and calls:

```tsx
export function memberRoutes(queryClient: QueryClient): RouteObject[] {
```

```tsx
children: memberAppRoutes(queryClient, { includeIndex: false }),
```

```tsx
children: memberAppRoutes(queryClient),
```

Modify `front/src/app/router.tsx`:

```ts
export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    publicRoutes(),
    ...authRoutes(),
    ...memberRoutes(queryClient),
    ...hostRoutes(queryClient),
  ];
}
```

- [ ] **Step 7: Run current-session and router tests**

Run:

```bash
pnpm --dir front test -- current-session spa-router
```

Expected: PASS. Before running, update any `front/tests/unit/spa-router.test.tsx` direct `memberRoutes()` call to use the exported `routes` object from `front/src/app/router.tsx`; this keeps the test on the same QueryClient-aware route construction path as the app.

- [ ] **Step 8: Confirm refresh event code is gone**

Run:

```bash
rg -n "READMATES_ROUTE_REFRESH_EVENT|readmates:route-refresh|requestCurrentSessionRouteRefresh" front/features/current-session front/tests/unit/current-session.test.tsx
```

Expected: no matches.

- [ ] **Step 9: Commit Task 2**

```bash
git add front/features/current-session/route/current-session-data.ts \
  front/features/current-session/route/current-session-route.tsx \
  front/features/current-session/index.ts \
  front/src/app/routes/member.tsx \
  front/src/app/router.tsx \
  front/tests/unit/current-session.test.tsx \
  front/tests/unit/spa-router.test.tsx
git commit -m "feat(front): move current session route state to query"
```

---

### Task 3: Shared Cursor Pagination Helpers

**Files:**
- Create: `front/shared/query/cursor-pagination.ts`
- Create: `front/shared/query/cursor-pagination.test.ts`
- Modify: `front/features/host/queries/host-notification-queries.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/archive/route/archive-list-route.tsx`
- Modify: `front/features/host/queries/host-notification-queries.test.ts`
- Modify: `front/features/host/queries/host-session-queries.test.ts`
- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Write helper tests**

Create `front/shared/query/cursor-pagination.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  appendCursor,
  combineCursorPages,
  normalizePageRequest,
  pageFromNormalizedPageRequest,
  pageRequests,
} from "./cursor-pagination";

describe("cursor pagination helpers", () => {
  it("normalizes omitted page fields to null", () => {
    expect(normalizePageRequest()).toEqual({ limit: null, cursor: null });
    expect(normalizePageRequest({})).toEqual({ limit: null, cursor: null });
    expect(normalizePageRequest({ limit: 20 })).toEqual({ limit: 20, cursor: null });
    expect(normalizePageRequest({ cursor: "cursor-1" })).toEqual({ limit: null, cursor: "cursor-1" });
    expect(normalizePageRequest({ limit: 20, cursor: "cursor-1" })).toEqual({ limit: 20, cursor: "cursor-1" });
  });

  it("converts normalized pages back to API page requests", () => {
    expect(pageFromNormalizedPageRequest({ limit: null, cursor: null })).toBeUndefined();
    expect(pageFromNormalizedPageRequest({ limit: 20, cursor: null })).toEqual({ limit: 20 });
    expect(pageFromNormalizedPageRequest({ limit: null, cursor: "cursor-1" })).toEqual({ cursor: "cursor-1" });
    expect(pageFromNormalizedPageRequest({ limit: 20, cursor: "cursor-1" })).toEqual({
      limit: 20,
      cursor: "cursor-1",
    });
  });

  it("builds first page plus cursor page requests", () => {
    expect(pageRequests(50, [])).toEqual([{ limit: 50 }]);
    expect(pageRequests(50, ["a", "b"])).toEqual([
      { limit: 50 },
      { limit: 50, cursor: "a" },
      { limit: 50, cursor: "b" },
    ]);
  });

  it("appends only new non-empty cursors", () => {
    expect(appendCursor([], null)).toEqual([]);
    expect(appendCursor([], undefined)).toEqual([]);
    expect(appendCursor([], "")).toEqual([]);
    expect(appendCursor(["a"], "a")).toEqual(["a"]);
    expect(appendCursor(["a"], "b")).toEqual(["a", "b"]);
  });

  it("combines cursor pages in order and keeps the latest nextCursor", () => {
    expect(combineCursorPages([
      { items: [1, 2], nextCursor: "b" },
      undefined,
      { items: [3], nextCursor: null },
    ])).toEqual({
      items: [1, 2, 3],
      nextCursor: null,
    });
  });

  it("returns an empty page when every input page is undefined", () => {
    expect(combineCursorPages<number>([undefined, undefined])).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
```

- [ ] **Step 2: Run helper test to verify it fails**

Run:

```bash
pnpm --dir front test -- cursor-pagination
```

Expected: FAIL because `front/shared/query/cursor-pagination.ts` does not exist.

- [ ] **Step 3: Implement shared helper**

Create `front/shared/query/cursor-pagination.ts`:

```ts
import type { PageRequest } from "@/shared/model/paging";

export type NormalizedPageRequest = {
  limit: number | null;
  cursor: string | null;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export function normalizePageRequest(page?: PageRequest): NormalizedPageRequest {
  return {
    limit: page?.limit ?? null,
    cursor: page?.cursor ?? null,
  };
}

export function pageFromNormalizedPageRequest(page: NormalizedPageRequest): PageRequest | undefined {
  if (page.limit === null && page.cursor === null) {
    return undefined;
  }

  return {
    ...(page.limit !== null ? { limit: page.limit } : {}),
    ...(page.cursor !== null ? { cursor: page.cursor } : {}),
  };
}

export function pageRequests(limit: number, cursors: string[]): PageRequest[] {
  return [{ limit }, ...cursors.map((cursor) => ({ limit, cursor }))];
}

export function appendCursor(cursors: string[], cursor: string | null | undefined): string[] {
  if (!cursor || cursors.includes(cursor)) {
    return cursors;
  }
  return [...cursors, cursor];
}

export function combineCursorPages<T>(pages: Array<CursorPage<T> | undefined>): CursorPage<T> {
  const lastPage = [...pages].reverse().find(Boolean);
  return {
    items: pages.flatMap((page) => page?.items ?? []),
    nextCursor: lastPage?.nextCursor ?? null,
  };
}
```

- [ ] **Step 4: Replace local normalization in host query modules**

In both `front/features/host/queries/host-notification-queries.ts` and `front/features/host/queries/host-session-queries.ts`, remove the local `NormalizedPageRequest`, `normalizePage`, and `pageFromNormalized` definitions.

Add:

```ts
import {
  normalizePageRequest,
  pageFromNormalizedPageRequest,
  type NormalizedPageRequest,
} from "@/shared/query/cursor-pagination";
```

Replace every `normalizePage(` call with `normalizePageRequest(`.

Replace every `pageFromNormalized(` call with `pageFromNormalizedPageRequest(`.

In helper functions that store normalized page objects, keep the property name `page` so query keys stay semantically identical. For example:

```ts
function normalizeManualDispatchesRequest(request?: ManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePageRequest(request?.page),
  };
}
```

- [ ] **Step 5: Replace local cursor helpers in host notifications route**

Modify `front/features/host/route/host-notifications-route.tsx` imports:

```tsx
import {
  appendCursor,
  combineCursorPages,
  pageRequests,
  type CursorPage,
} from "@/shared/query/cursor-pagination";
```

Remove local `PagedResponse`, `pageRequests`, `appendCursor`, and `combinePages`.

Replace:

```tsx
type PagedResponse<T> = {
  items: T[];
  nextCursor: string | null;
};
```

with no local type. Use `CursorPage<T>` in `combineManualOptions`:

```tsx
function combineManualOptions(
  pages: Array<ManualNotificationOptionsResponse | undefined>,
): ManualNotificationOptionsResponse {
  const first = pages.find(Boolean);
  const last = [...pages].reverse().find(Boolean);
  if (!first) {
    return {
      session: null,
      templates: [],
      members: { items: [], nextCursor: null },
      recentDispatches: [],
    };
  }

  return {
    ...first,
    members: {
      items: pages.flatMap((page) => page?.members.items ?? []),
      nextCursor: last?.members.nextCursor ?? null,
    },
  };
}
```

Replace combine calls:

```tsx
const events = combineCursorPages<HostNotificationEventListResponse["items"][number]>(eventQueries.map((query) => query.data));
const deliveries = combineCursorPages<HostNotificationDeliveryListResponse["items"][number]>(deliveryQueries.map((query) => query.data));
const audit = combineCursorPages<NotificationTestMailAuditPage["items"][number]>(auditQueries.map((query) => query.data));
const manualDispatches = combineCursorPages(manualDispatchQueries.map((query) => query.data));
```

- [ ] **Step 6: Use combineCursorPages in archive route load-more merges**

Add to `front/features/archive/route/archive-list-route.tsx`:

```tsx
import { combineCursorPages } from "@/shared/query/cursor-pagination";
```

For each load-more setter, replace the manual `{ items: [...], nextCursor }` merge with `combineCursorPages`. Example for sessions:

```tsx
sessions: combineCursorPages([currentPages.sessions, nextPage]),
```

Use the same form for `questions`, `reviews`, and `reports`:

```tsx
questions: combineCursorPages([currentPages.questions, nextPage]),
reviews: combineCursorPages([currentPages.reviews, nextPage]),
reports: combineCursorPages([currentPages.reports, nextPage]),
```

- [ ] **Step 7: Run targeted helper and affected route tests**

Run:

```bash
pnpm --dir front test -- cursor-pagination host-notification host-session archive
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add front/shared/query/cursor-pagination.ts \
  front/shared/query/cursor-pagination.test.ts \
  front/features/host/queries/host-notification-queries.ts \
  front/features/host/queries/host-session-queries.ts \
  front/features/host/route/host-notifications-route.tsx \
  front/features/archive/route/archive-list-route.tsx \
  front/features/host/queries/host-notification-queries.test.ts \
  front/features/host/queries/host-session-queries.test.ts \
  front/tests/unit/host-notifications.test.tsx
git commit -m "refactor(front): share cursor pagination helpers"
```

---

### Task 4: Platform-Admin Query Module And Loader Seeding

**Files:**
- Create: `front/features/platform-admin/queries/platform-admin-queries.ts`
- Create: `front/features/platform-admin/queries/platform-admin-queries.test.tsx`
- Modify: `front/features/platform-admin/route/platform-admin-data.ts`

- [ ] **Step 1: Write platform-admin query tests**

Create `front/features/platform-admin/queries/platform-admin-queries.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlatformAdminClub,
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

vi.mock("@/features/platform-admin/api/platform-admin-api", () => ({
  checkPlatformAdminDomainProvisioning: vi.fn(),
  commitPlatformAdminOnboarding: vi.fn(),
  createSupportAccessGrant: vi.fn(),
  fetchPlatformAdminClubs: vi.fn(),
  fetchPlatformAdminSummary: vi.fn(),
  listSupportAccessGrantsByClub: vi.fn(),
  revokeSupportAccessGrant: vi.fn(),
  updatePlatformAdminClub: vi.fn(),
}));

import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  createSupportAccessGrant,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  listSupportAccessGrantsByClub,
  revokeSupportAccessGrant,
  updatePlatformAdminClub,
} from "@/features/platform-admin/api/platform-admin-api";
import {
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
  platformAdminSupportGrantsQuery,
  useCheckPlatformAdminDomainProvisioningMutation,
  useCommitPlatformAdminOnboardingMutation,
  useCreateSupportAccessGrantMutation,
  useRevokeSupportAccessGrantMutation,
  useUpdatePlatformAdminClubMutation,
} from "./platform-admin-queries";

const club: PlatformAdminClub = {
  clubId: "club-1",
  slug: "reading-sai",
  name: "읽는사이",
  tagline: "함께 읽는 모임",
  about: "공개 소개",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 1,
  firstHostOnboardingState: "ASSIGNED",
};

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 1,
  domains: [],
  domainsRequiringAction: [],
};

const activeDomain: PlatformAdminDomainResponse = {
  id: "domain-1",
  clubId: "club-1",
  hostname: "reading-sai.example.test",
  kind: "SUBDOMAIN",
  status: "ACTIVE",
  desiredState: "ENABLED",
  manualAction: "NONE",
  errorCode: null,
  isPrimary: false,
  verifiedAt: "2026-05-18T00:00:00Z",
  lastCheckedAt: "2026-05-18T00:00:00Z",
};

const grant: SupportAccessGrantResponse = {
  id: "grant-1",
  clubId: "club-1",
  grantedByUserId: "owner-1",
  granteeUserId: "support-1",
  scope: "HOST_SUPPORT_READ",
  reason: "Support review",
  expiresAt: "2099-01-01T00:00:00Z",
  revokedAt: null,
  createdAt: "2026-05-18T00:00:00Z",
};

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
  vi.mocked(fetchPlatformAdminSummary).mockReset();
  vi.mocked(fetchPlatformAdminClubs).mockReset();
  vi.mocked(listSupportAccessGrantsByClub).mockReset();
  vi.mocked(checkPlatformAdminDomainProvisioning).mockReset();
  vi.mocked(commitPlatformAdminOnboarding).mockReset();
  vi.mocked(updatePlatformAdminClub).mockReset();
  vi.mocked(createSupportAccessGrant).mockReset();
  vi.mocked(revokeSupportAccessGrant).mockReset();
});

describe("platform admin query keys", () => {
  it("defines stable query keys", () => {
    expect(platformAdminKeys.summary()).toEqual(["platform-admin", "summary"]);
    expect(platformAdminKeys.clubs()).toEqual(["platform-admin", "clubs"]);
    expect(platformAdminKeys.supportGrants("club-1")).toEqual([
      "platform-admin",
      "support-grants",
      "club-1",
    ]);
    expect(platformAdminKeys.supportGrants(null)).toEqual([
      "platform-admin",
      "support-grants",
      null,
    ]);
  });

  it("query functions call platform admin API wrappers", async () => {
    vi.mocked(fetchPlatformAdminSummary).mockResolvedValue(summary);
    vi.mocked(fetchPlatformAdminClubs).mockResolvedValue({ items: [club] });
    vi.mocked(listSupportAccessGrantsByClub).mockResolvedValue([grant]);

    await runQuery(platformAdminSummaryQuery());
    await runQuery(platformAdminClubsQuery());
    await runQuery(platformAdminSupportGrantsQuery("club-1"));

    expect(fetchPlatformAdminSummary).toHaveBeenCalledOnce();
    expect(fetchPlatformAdminClubs).toHaveBeenCalledOnce();
    expect(listSupportAccessGrantsByClub).toHaveBeenCalledWith("club-1");
  });

  it("returns an empty grant list for null selected club", async () => {
    await expect(runQuery(platformAdminSupportGrantsQuery(null))).resolves.toEqual([]);
    expect(listSupportAccessGrantsByClub).not.toHaveBeenCalled();
  });
});

describe("platform admin mutation cache behavior", () => {
  it("updates summary domains after a successful domain check", async () => {
    vi.mocked(checkPlatformAdminDomainProvisioning).mockResolvedValue(activeDomain);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.summary(), {
      ...summary,
      domains: [{ ...activeDomain, status: "ACTION_REQUIRED", manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN" }],
      domainsRequiringAction: [{ ...activeDomain, status: "ACTION_REQUIRED", manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN" }],
    });
    const { result } = renderHook(() => useCheckPlatformAdminDomainProvisioningMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("domain-1");
    });

    expect(checkPlatformAdminDomainProvisioning).toHaveBeenCalledWith("domain-1");
    expect(client.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary())?.domains?.[0].status).toBe("ACTIVE");
    expect(client.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary())?.domainActionRequiredCount).toBe(0);
  });

  it("prepends created club and returned domain after onboarding commit", async () => {
    vi.mocked(commitPlatformAdminOnboarding).mockResolvedValue({
      club,
      hostOnboarding: {
        kind: "INVITATION_CREATED",
        email: "host@example.com",
        userId: null,
        invitationId: "invite-1",
        acceptUrl: "https://readmates.example/invite/example",
        emailDelivery: { status: "SENT" },
      },
      domain: activeDomain,
    });
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.summary(), summary);
    client.setQueryData(platformAdminKeys.clubs(), { items: [] });
    const { result } = renderHook(() => useCommitPlatformAdminOnboardingMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        club: { name: "읽는사이", slug: "reading-sai", tagline: "함께 읽는 모임", about: "공개 소개" },
        firstHost: { email: "host@example.com", name: "Host User" },
      });
    });

    expect(client.getQueryData<{ items: PlatformAdminClub[] }>(platformAdminKeys.clubs())?.items[0]).toEqual(club);
    expect(client.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary())?.domains?.[0]).toEqual(activeDomain);
  });

  it("replaces a club after update", async () => {
    const updated = { ...club, publicVisibility: "PUBLIC" as const };
    vi.mocked(updatePlatformAdminClub).mockResolvedValue(updated);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.clubs(), { items: [club] });
    const { result } = renderHook(() => useUpdatePlatformAdminClubMutation(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ clubId: "club-1", request: { publicVisibility: "PUBLIC" } });
    });

    expect(client.getQueryData<{ items: PlatformAdminClub[] }>(platformAdminKeys.clubs())?.items[0].publicVisibility).toBe("PUBLIC");
  });

  it("adds and removes support grants in the selected club cache", async () => {
    vi.mocked(createSupportAccessGrant).mockResolvedValue(grant);
    vi.mocked(revokeSupportAccessGrant).mockResolvedValue(undefined);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminKeys.supportGrants("club-1"), []);
    const createHook = renderHook(() => useCreateSupportAccessGrantMutation("club-1"), { wrapper: Wrapper });
    const revokeHook = renderHook(() => useRevokeSupportAccessGrantMutation("club-1"), { wrapper: Wrapper });

    await act(async () => {
      await createHook.result.current.mutateAsync({
        clubId: "club-1",
        granteeUserId: "support-1",
        scope: "HOST_SUPPORT_READ",
        reason: "Support review",
        expiresAt: "2099-01-01T00:00:00Z",
      });
    });

    expect(client.getQueryData<SupportAccessGrantResponse[]>(platformAdminKeys.supportGrants("club-1"))).toEqual([grant]);

    await act(async () => {
      await revokeHook.result.current.mutateAsync("grant-1");
    });

    expect(client.getQueryData<SupportAccessGrantResponse[]>(platformAdminKeys.supportGrants("club-1"))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run query tests to verify they fail**

Run:

```bash
pnpm --dir front test -- platform-admin-queries
```

Expected: FAIL because `platform-admin-queries.ts` does not exist.

- [ ] **Step 3: Implement platform-admin query module**

Create `front/features/platform-admin/queries/platform-admin-queries.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  createSupportAccessGrant,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  listSupportAccessGrantsByClub,
  revokeSupportAccessGrant,
  updatePlatformAdminClub,
} from "@/features/platform-admin/api/platform-admin-api";
import type {
  CreateSupportAccessGrantRequest,
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminDomainResponse,
  PlatformAdminOnboardingRequest,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
  UpdatePlatformAdminClubRequest,
} from "@/features/platform-admin/api/platform-admin-contracts";

export const platformAdminKeys = {
  all: ["platform-admin"] as const,
  summary: () => [...platformAdminKeys.all, "summary"] as const,
  clubs: () => [...platformAdminKeys.all, "clubs"] as const,
  supportGrantsRoot: () => [...platformAdminKeys.all, "support-grants"] as const,
  supportGrants: (clubId: string | null) => [...platformAdminKeys.supportGrantsRoot(), clubId] as const,
} as const;

export function platformAdminSummaryQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.summary(),
    queryFn: fetchPlatformAdminSummary,
  });
}

export function platformAdminClubsQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.clubs(),
    queryFn: fetchPlatformAdminClubs,
  });
}

export function platformAdminSupportGrantsQuery(clubId: string | null) {
  return queryOptions({
    queryKey: platformAdminKeys.supportGrants(clubId),
    queryFn: () => (clubId ? listSupportAccessGrantsByClub(clubId) : Promise.resolve([])),
  });
}

function replaceClub(clubs: PlatformAdminClubListResponse | undefined, club: PlatformAdminClub): PlatformAdminClubListResponse {
  const current = clubs?.items ?? [];
  if (!current.some((candidate) => candidate.clubId === club.clubId)) {
    return { items: [club, ...current] };
  }
  return {
    items: current.map((candidate) => (candidate.clubId === club.clubId ? club : candidate)),
  };
}

function replaceDomain(domains: PlatformAdminDomainResponse[] | undefined, domain: PlatformAdminDomainResponse) {
  const current = domains ?? [];
  if (!current.some((candidate) => candidate.id === domain.id)) {
    return [domain, ...current];
  }
  return current.map((candidate) => (candidate.id === domain.id ? domain : candidate));
}

function recomputeActionRequiredCount(summary: PlatformAdminSummaryResponse, domain: PlatformAdminDomainResponse) {
  const currentDomain = (summary.domains ?? summary.domainsRequiringAction ?? [])
    .find((candidate) => candidate.id === domain.id);
  if (!currentDomain) {
    return domain.status === "ACTION_REQUIRED" ? summary.domainActionRequiredCount + 1 : summary.domainActionRequiredCount;
  }
  if (currentDomain.status === "ACTION_REQUIRED" && domain.status !== "ACTION_REQUIRED") {
    return Math.max(0, summary.domainActionRequiredCount - 1);
  }
  if (currentDomain.status !== "ACTION_REQUIRED" && domain.status === "ACTION_REQUIRED") {
    return summary.domainActionRequiredCount + 1;
  }
  return summary.domainActionRequiredCount;
}

function summaryWithUpdatedDomain(
  summary: PlatformAdminSummaryResponse | undefined,
  domain: PlatformAdminDomainResponse,
): PlatformAdminSummaryResponse | undefined {
  if (!summary) return summary;
  const domains = replaceDomain(summary.domains ?? summary.domainsRequiringAction ?? [], domain);
  return {
    ...summary,
    domainActionRequiredCount: recomputeActionRequiredCount(summary, domain),
    domains,
    domainsRequiringAction: replaceDomain(summary.domainsRequiringAction ?? [], domain)
      .filter((candidate) => candidate.status === "ACTION_REQUIRED"),
  };
}

function prependSupportGrant(
  grants: SupportAccessGrantResponse[] | undefined,
  grant: SupportAccessGrantResponse,
): SupportAccessGrantResponse[] {
  const current = grants ?? [];
  if (current.some((candidate) => candidate.id === grant.id)) {
    return current.map((candidate) => (candidate.id === grant.id ? grant : candidate));
  }
  return [grant, ...current];
}

export function useCheckPlatformAdminDomainProvisioningMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (domainId: string) => checkPlatformAdminDomainProvisioning(domainId),
    onSuccess: (domain) => {
      client.setQueryData(platformAdminKeys.summary(), (current: PlatformAdminSummaryResponse | undefined) =>
        summaryWithUpdatedDomain(current, domain),
      );
    },
  });
}

export function useCommitPlatformAdminOnboardingMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: PlatformAdminOnboardingRequest) => commitPlatformAdminOnboarding(request),
    onSuccess: (result) => {
      client.setQueryData(platformAdminKeys.clubs(), (current: PlatformAdminClubListResponse | undefined) =>
        replaceClub(current, result.club),
      );
      if (result.domain) {
        client.setQueryData(platformAdminKeys.summary(), (current: PlatformAdminSummaryResponse | undefined) =>
          summaryWithUpdatedDomain(current, result.domain),
        );
      }
      void client.invalidateQueries({ queryKey: platformAdminKeys.summary() });
      void client.invalidateQueries({ queryKey: platformAdminKeys.clubs() });
    },
  });
}

export function useUpdatePlatformAdminClubMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ clubId, request }: { clubId: string; request: UpdatePlatformAdminClubRequest }) =>
      updatePlatformAdminClub(clubId, request),
    onSuccess: (club) => {
      client.setQueryData(platformAdminKeys.clubs(), (current: PlatformAdminClubListResponse | undefined) =>
        replaceClub(current, club),
      );
    },
  });
}

export function useCreateSupportAccessGrantMutation(clubId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateSupportAccessGrantRequest) => createSupportAccessGrant(request),
    onSuccess: (grant) => {
      client.setQueryData(platformAdminKeys.supportGrants(clubId), (current: SupportAccessGrantResponse[] | undefined) =>
        prependSupportGrant(current, grant),
      );
    },
  });
}

export function useRevokeSupportAccessGrantMutation(clubId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => revokeSupportAccessGrant(grantId),
    onSuccess: (_result, grantId) => {
      client.setQueryData(platformAdminKeys.supportGrants(clubId), (current: SupportAccessGrantResponse[] | undefined) =>
        (current ?? []).filter((grant) => grant.id !== grantId),
      );
    },
  });
}
```

- [ ] **Step 4: Add platform-admin loader factory**

Modify `front/features/platform-admin/route/platform-admin-data.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { requirePlatformAdminLoaderAuth } from "@/shared/auth/platform-admin-loader";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";
import { fetchPlatformAdminClubs, fetchPlatformAdminSummary } from "@/features/platform-admin/api/platform-admin-api";
```

Replace the loader body with a factory plus compatibility loader:

```ts
export type PlatformAdminRouteData = {
  summary: PlatformAdminSummaryResponse;
  clubs: PlatformAdminClubListResponse;
};

export function platformAdminLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<PlatformAdminRouteData> => {
    await requirePlatformAdminLoaderAuth(args);

    const [summary, clubs] = await Promise.all([
      client.fetchQuery(platformAdminSummaryQuery()),
      client.fetchQuery(platformAdminClubsQuery()),
    ]);

    return { summary, clubs };
  };
}

export async function platformAdminLoader(args?: LoaderFunctionArgs): Promise<PlatformAdminRouteData> {
  await requirePlatformAdminLoaderAuth(args);

  const [summary, clubs] = await Promise.all([
    fetchPlatformAdminSummary(),
    fetchPlatformAdminClubs(),
  ]);

  return { summary, clubs };
}
```

- [ ] **Step 5: Run platform-admin query tests**

Run:

```bash
pnpm --dir front test -- platform-admin-queries
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add front/features/platform-admin/queries/platform-admin-queries.ts \
  front/features/platform-admin/queries/platform-admin-queries.test.tsx \
  front/features/platform-admin/route/platform-admin-data.ts
git commit -m "feat(front): add platform admin query hooks"
```

---

### Task 5: Platform-Admin Route Migration

**Files:**
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`
- Modify: `front/src/app/routes/auth.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/tests/unit/platform-admin.test.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`

- [ ] **Step 1: Update auth route wiring test expectations**

Search for direct `authRoutes()` calls and update each call site to pass a test QueryClient:

```tsx
import { QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },
    mutations: { retry: false },
  },
});

const routeObjects = authRoutes(queryClient);
```

Run this search before editing:

```bash
rg -n "authRoutes\\(" front/tests front/src
```

Expected after edits: direct test calls pass a QueryClient, while `front/src/app/router.tsx` passes the app QueryClient.

- [ ] **Step 2: Pass QueryClient into auth routes**

Modify `front/src/app/routes/auth.tsx`:

```tsx
import type { QueryClient } from "@tanstack/react-query";
import type { RouteObject } from "react-router-dom";
import { RouteErrorBoundary } from "@/src/app/route-error";
import { RequireAuth, RequirePlatformAdmin } from "@/src/app/route-guards";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";

export function authRoutes(queryClient: QueryClient): RouteObject[] {
```

Inside `/admin` lazy import, import the loader factory and use it:

```tsx
const [{ PlatformAdminRoute }, { platformAdminLoaderFactory }] = await Promise.all([
  import("@/features/platform-admin/route/platform-admin-route"),
  import("@/features/platform-admin/route/platform-admin-data"),
]);
```

```tsx
return { Component: PlatformAdminRouteElement, loader: platformAdminLoaderFactory(queryClient) };
```

Modify `front/src/app/router.tsx`:

```ts
export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    publicRoutes(),
    ...authRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...hostRoutes(queryClient),
  ];
}
```

- [ ] **Step 3: Replace platform-admin route-local server data with Query**

Modify `front/features/platform-admin/route/platform-admin-route.tsx`.

Imports should include Query and new hooks:

```tsx
import { useMemo, useState } from "react";
import { useLoaderData } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { PlatformAdminRouteData } from "@/features/platform-admin/route/platform-admin-data";
import { PlatformAdminDashboard } from "@/features/platform-admin/ui/platform-admin-dashboard";
import {
  previewPlatformAdminOnboarding,
} from "@/features/platform-admin/api/platform-admin-api";
import type {
  CreateSupportAccessGrantRequest,
} from "@/features/platform-admin/api/platform-admin-contracts";
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
  platformAdminSupportGrantsQuery,
  useCheckPlatformAdminDomainProvisioningMutation,
  useCommitPlatformAdminOnboardingMutation,
  useCreateSupportAccessGrantMutation,
  useRevokeSupportAccessGrantMutation,
  useUpdatePlatformAdminClubMutation,
} from "@/features/platform-admin/queries/platform-admin-queries";
import {
  buildPlatformAdminWorkbench,
  type PlatformAdminWorkbenchInput,
} from "@/features/platform-admin/model/platform-admin-workbench-model";
import type { CreateSupportAccessGrantFields } from "@/features/platform-admin/ui/support-access-grants-panel";
```

Inside `PlatformAdminRoute`, replace `summary`, `clubs`, and `activeGrants` state with queries:

```tsx
const data = useLoaderData() as PlatformAdminRouteData;
const [checkingDomainIds, setCheckingDomainIds] = useState<ReadonlySet<string>>(new Set());
const [checkErrorByDomainId, setCheckErrorByDomainId] = useState<Record<string, string>>({});
const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
const [supportGrantMutationError, setSupportGrantMutationError] = useState<string | null>(null);

const summaryQuery = useQuery(platformAdminSummaryQuery());
const clubsQuery = useQuery(platformAdminClubsQuery());
const summary = summaryQuery.data ?? data.summary;
const clubs = clubsQuery.data ?? data.clubs;
```

Keep workbench computation:

```tsx
const workbench = useMemo(() => {
  const input: PlatformAdminWorkbenchInput = {
    role: summary.platformRole,
    activeClubCount: summary.activeClubCount,
    domainActionRequiredCount: summary.domainActionRequiredCount,
    selectedClubId,
    clubs: clubs.items,
    domains: summary.domains ?? summary.domainsRequiringAction ?? [],
  };
  return buildPlatformAdminWorkbench(input);
}, [clubs.items, selectedClubId, summary]);

const effectiveSelectedClubId = workbench.selectedClub?.clubId ?? null;
const supportGrantsQuery = useQuery(platformAdminSupportGrantsQuery(effectiveSelectedClubId));
```

Create mutation hooks:

```tsx
const domainCheckMutation = useCheckPlatformAdminDomainProvisioningMutation();
const onboardingMutation = useCommitPlatformAdminOnboardingMutation();
const updateClubMutation = useUpdatePlatformAdminClubMutation();
const createGrantMutation = useCreateSupportAccessGrantMutation(effectiveSelectedClubId);
const revokeGrantMutation = useRevokeSupportAccessGrantMutation(effectiveSelectedClubId);
```

Replace `handleCreateGrant`:

```tsx
async function handleCreateGrant(fields: CreateSupportAccessGrantFields) {
  const clubId = workbench.selectedClub?.clubId;
  if (!clubId) {
    throw new Error("No selected club for support access grant");
  }
  setSupportGrantMutationError(null);
  const request: CreateSupportAccessGrantRequest = {
    clubId,
    granteeUserId: fields.granteeUserId,
    scope: fields.scope,
    reason: fields.reason,
    expiresAt: fields.expiresAt,
  };
  try {
    await createGrantMutation.mutateAsync(request);
  } catch (error) {
    setSupportGrantMutationError("지원 접근 권한을 만들지 못했습니다.");
    throw error;
  }
}
```

Replace `handleRevokeGrant`:

```tsx
async function handleRevokeGrant(grantId: string) {
  setSupportGrantMutationError(null);
  try {
    await revokeGrantMutation.mutateAsync(grantId);
  } catch (error) {
    setSupportGrantMutationError("지원 접근 권한을 회수하지 못했습니다.");
    throw error;
  }
}
```

Update `PlatformAdminDashboard` props:

```tsx
<PlatformAdminDashboard
  workbench={workbench}
  selectedClubId={effectiveSelectedClubId}
  onSelectClub={setSelectedClubId}
  checkingDomainIds={checkingDomainIds}
  domainCheckErrors={checkErrorByDomainId}
  onCheckDomain={async (domainId) => {
    setCheckingDomainIds((current) => withSetValue(current, domainId));
    setCheckErrorByDomainId((current) => withoutKey(current, domainId));
    try {
      await domainCheckMutation.mutateAsync(domainId);
    } catch {
      setCheckErrorByDomainId((current) => ({
        ...current,
        [domainId]: "상태 확인에 실패했습니다. 잠시 후 다시 실행하세요.",
      }));
    } finally {
      setCheckingDomainIds((current) => withoutSetValue(current, domainId));
    }
  }}
  onPreviewOnboarding={previewPlatformAdminOnboarding}
  onCommitOnboarding={async (request) => {
    const result = await onboardingMutation.mutateAsync(request);
    setSelectedClubId(result.club.clubId);
    return result;
  }}
  onUpdateClub={async (clubId, request) => updateClubMutation.mutateAsync({ clubId, request })}
  onSetVisibility={async (publicVisibility) => {
    const clubId = workbench.selectedClub?.clubId;
    if (!clubId) return;
    await updateClubMutation.mutateAsync({ clubId, request: { publicVisibility } });
  }}
  activeGrants={supportGrantsQuery.data ?? []}
  loadingSupportGrants={supportGrantsQuery.isFetching}
  supportGrantLoadError={
    supportGrantMutationError ??
    (supportGrantsQuery.isError ? "지원 접근 권한을 불러오지 못했습니다." : null)
  }
  onCreateGrant={handleCreateGrant}
  onRevokeGrant={handleRevokeGrant}
/>
```

Delete route-local helper functions that only updated `summary`, `clubs`, or `activeGrants`: `prependOrReplaceClub`, `replaceClub`, `summaryWithUpdatedDomain`, `replaceDomain`, `recomputeActionRequiredCount`, and `prependOrReplaceDomain`. Keep `withoutKey`, `withSetValue`, and `withoutSetValue`.

- [ ] **Step 4: Run platform-admin tests and fix wrappers**

Run:

```bash
pnpm --dir front test -- platform-admin spa-router
```

Expected: PASS after adjusting tests to the new auth route factory. Route-level `/admin` tests should use the app `routes` export so they run under the same QueryClient-aware route construction path as production.

- [ ] **Step 5: Verify route has no server data mirror state**

Run:

```bash
rg -n "useState\\(data\\.summary|useState\\(data\\.clubs|setSummary|setClubs|setActiveGrants|listSupportAccessGrantsByClub" front/features/platform-admin/route/platform-admin-route.tsx
```

Expected: no matches.

- [ ] **Step 6: Commit Task 5**

```bash
git add front/features/platform-admin/route/platform-admin-route.tsx \
  front/src/app/routes/auth.tsx \
  front/src/app/router.tsx \
  front/tests/unit/platform-admin.test.tsx \
  front/tests/unit/spa-router.test.tsx
git commit -m "feat(front): move platform admin state to query"
```

---

### Task 6: Documentation And Final Verification

**Files:**
- Modify: `docs/development/server-state-migration.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update server-state migration status**

Modify `docs/development/server-state-migration.md` so `완료` includes:

```md
- `current-session` — member current-session read path, RSVP/checkin/questions/review mutations, loader seeding, and query invalidation replacing the custom route refresh event
- `platform-admin` — summary, clubs, selected-club support grants, domain check, onboarding commit, club update, and support grant mutation cache ownership
```

Add a `공통 helper` bullet under `## 패턴`:

```md
- cursor pagination helper: `front/shared/query/cursor-pagination.ts`의 `normalizePageRequest`, `pageFromNormalizedPageRequest`, `appendCursor`, `pageRequests`, `combineCursorPages`를 사용해 query key page normalization과 appended page 조립을 공유합니다. Feature-specific nested page shape는 feature-local wrapper에서 조립합니다.
```

Change `후속 후보` to keep only future read-heavy routes:

```md
## 후속 후보 (우선순위)
1. `archive`
2. `feedback`
3. `public`
```

- [ ] **Step 2: Add CHANGELOG entry**

Add under `## Unreleased` in `CHANGELOG.md`:

```md
- Consolidate frontend server-state ownership: migrate `current-session` and `platform-admin` to TanStack Query loader seeding/mutation invalidation, remove the custom current-session route refresh event, and share cursor pagination helpers across migrated host/archive surfaces.
```

- [ ] **Step 3: Run targeted checks**

Run:

```bash
pnpm --dir front test -- current-session cursor-pagination host-notification host-session archive platform-admin
```

Expected: PASS.

- [ ] **Step 4: Run full frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS for all three commands.

- [ ] **Step 5: Run docs diff check**

Run:

```bash
git diff --check -- docs/development/server-state-migration.md CHANGELOG.md
```

Expected: no output.

- [ ] **Step 6: Confirm no route refresh event remains**

Run:

```bash
rg -n "READMATES_ROUTE_REFRESH_EVENT|readmates:route-refresh|requestCurrentSessionRouteRefresh" front
```

Expected: no matches.

- [ ] **Step 7: Confirm frontend boundary still passes**

Run:

```bash
pnpm --dir front test -- frontend-boundaries
```

Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```bash
git add docs/development/server-state-migration.md CHANGELOG.md
git commit -m "docs: record frontend server-state consolidation"
```

---

## Final Review Checklist

- [ ] `current-session` no longer defines or dispatches `READMATES_ROUTE_REFRESH_EVENT`.
- [ ] `front/src/app/router.tsx` passes one app QueryClient to auth, member, and host routes.
- [ ] `current-session`, `host`, and `platform-admin` query keys include the intended scope and do not rely on global browser path state.
- [ ] UI components remain prop/callback driven and do not import feature API modules.
- [ ] `front/shared/query/cursor-pagination.ts` imports only `front/shared` types.
- [ ] Failed mutations do not write partial data into Query cache.
- [ ] `docs/development/server-state-migration.md` matches the shipped migration status.
- [ ] The full frontend verification commands have passed or the skipped command and reason are documented before handoff.
