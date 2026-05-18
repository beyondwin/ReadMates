# Host Sessions TanStack Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the complete `host/sessions` frontend server-state surface to TanStack Query while preserving route-first UI boundaries.

**Architecture:** Add a focused `host-session-queries.ts` module for query keys, query option factories, invalidation helpers, and mutation hooks. Route modules seed and read Query cache, then adapt Query-backed mutations into the existing prop/callback contracts for `HostDashboard` and `HostSessionEditor`. Notification routes reuse the shared host session list query, while notification-specific ledgers remain under `hostNotificationKeys`.

**Tech Stack:** React Router 7 loaders, TanStack Query v5, Vite React, Vitest, Testing Library, TypeScript, ReadMates BFF API helpers.

---

## Required Guides

Before implementation, read:

- `docs/agents/front.md`
- `docs/agents/docs.md`

No backend or visual-design guide is required unless implementation discovers a necessary server contract or UI/copy change.

## File Structure

- Create `front/features/host/queries/host-session-queries.ts`
  - Owns host session query keys, query option factories, invalidation helpers, and mutation hooks.
  - Imports host API wrappers only from `front/features/host/api/host-api.ts`.
  - Does not import `host-notification-queries.ts`; notification invalidation is composed in route code to avoid an import cycle.
- Create `front/features/host/queries/host-session-queries.test.ts`
  - Covers query keys, pagination normalization, query functions, and invalidation helpers.
- Create `front/features/host/queries/host-session-queries.hooks.test.tsx`
  - Covers mutation hook invalidation and failed-response behavior.
- Modify `front/features/host/route/host-dashboard-data.ts`
  - Convert loader to `hostDashboardLoaderFactory(queryClient)`.
  - Seed current session, dashboard, session list, and notification summary.
  - Keep notification summary fallback.
  - Remove session-specific module-level actions from this file.
- Modify `front/features/host/route/host-dashboard-route.tsx`
  - Read seeded data with `useQuery`.
  - Build `HostDashboardActions` from Query hooks and `queryClient.fetchQuery`.
  - Remove `useRevalidator`.
- Modify `front/features/host/route/host-session-editor-data.ts`
  - Convert loader to `hostSessionEditorLoaderFactory(queryClient)`.
  - Seed detail and editor manual dispatches.
  - Keep direct API export for `previewHostSessionImport` only if route action assembly needs it.
- Modify `front/features/host/route/host-session-editor-route.tsx`
  - Read detail and manual dispatches with `useQuery`.
  - Build `HostSessionEditorActions` from Query hooks.
  - Compose `commitSessionImport` invalidation with `invalidateHostNotifications(queryClient, context)` in this route file.
- Modify `front/features/host/queries/host-notification-queries.ts`
  - Replace notification-owned host session list query with shared `hostSessionListQuery({ limit: 50 }, context)`.
- Modify `front/features/host/route/host-notifications-data.ts`
  - Seed the shared host session list query instead of a notification-specific session key.
- Modify `front/features/host/route/host-notifications-route.tsx`
  - Continue using `hostNotificationSessionsQuery(context)`, now backed by the shared key, or import `hostSessionListQuery({ limit: 50 }, context)` directly.
- Modify `front/src/app/routes/host.tsx`
  - Pass the shared `QueryClient` to dashboard and editor loader factories.
- Modify `front/features/host/index.ts`
  - Export `hostDashboardLoaderFactory`, `hostSessionEditorLoaderFactory`, `hostSessionEditorPreviewActions`, and route data types.
  - Stop exporting removed module-level session action objects.
- Modify `front/tests/unit/host-dashboard.test.tsx`
  - Use loader factories with test `QueryClient`.
  - Add cache seeding and route refresh regression coverage.
- Modify `front/tests/unit/host-session-editor.test.tsx`
  - Keep UI-only action-prop tests.
  - Keep the existing draft and lifecycle UI regressions passing after route migration.
- Create `front/tests/unit/host-session-editor-route.test.tsx`
  - Covers route-level Query reads and cross-surface notification invalidation after import commit.
- Modify `front/tests/unit/host-notifications.test.tsx`
  - Assert notification session selector uses the shared host session key.
- Modify `docs/development/server-state-migration.md`
  - Mark `host/sessions` complete.
- Modify `CHANGELOG.md`
  - Add an Unreleased entry for the migration.

---

### Task 1: Add Host Session Query Keys and Read Queries

**Files:**
- Create: `front/features/host/queries/host-session-queries.ts`
- Create: `front/features/host/queries/host-session-queries.test.ts`

- [ ] **Step 1: Write failing key and read-query tests**

Create `front/features/host/queries/host-session-queries.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/host/api/host-api", () => ({
  fetchHostCurrentSession: vi.fn(),
  fetchHostDashboard: vi.fn(),
  fetchHostSessions: vi.fn(),
  fetchHostSessionDetail: vi.fn(),
  fetchHostSessionDeletionPreview: vi.fn(),
  fetchManualNotificationDispatches: vi.fn(),
}));

import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostSessions,
  fetchHostSessionDetail,
  fetchHostSessionDeletionPreview,
  fetchManualNotificationDispatches,
} from "@/features/host/api/host-api";
import {
  hostCurrentSessionQuery,
  hostDashboardQuery,
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  hostSessionKeys,
  hostSessionListQuery,
  hostSessionManualDispatchesQuery,
  invalidateHostCurrentSession,
  invalidateHostSessionDashboard,
  invalidateHostSessionDetail,
  invalidateHostSessionLists,
  invalidateHostSessionManualDispatches,
  invalidateHostSessionSurface,
} from "./host-session-queries";

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) {
    throw new Error("Missing queryFn");
  }
  return query.queryFn({} as never);
}

describe("host session query keys", () => {
  it("scopes all host session keys by club slug", () => {
    expect(hostSessionKeys.list({ limit: 50 }, { clubSlug: "reading-sai" })).toEqual([
      "host",
      "sessions",
      "scope",
      "reading-sai",
      "list",
      { limit: 50, cursor: null },
    ]);
    expect(hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" })).toEqual([
      "host",
      "sessions",
      "scope",
      "reading-sai",
      "detail",
      "session-7",
    ]);
    expect(hostSessionKeys.current({ clubSlug: "reading-sai" })).toEqual([
      "host",
      "sessions",
      "scope",
      "reading-sai",
      "current",
    ]);
  });

  it("uses a null club scope for unscoped host routes", () => {
    expect(hostSessionKeys.scope()).toEqual(["host", "sessions", "scope", null]);
  });

  it("normalizes equivalent first page requests to the same key", () => {
    expect(hostSessionListQuery(undefined, { clubSlug: "reading-sai" }).queryKey).toEqual(
      hostSessionListQuery({}, { clubSlug: "reading-sai" }).queryKey,
    );
  });

  it("normalizes manual dispatch request filters", () => {
    expect(hostSessionManualDispatchesQuery(
      { sessionId: "session-7", page: { limit: 20 } },
      { clubSlug: "reading-sai" },
    ).queryKey).toEqual(
      hostSessionManualDispatchesQuery(
        { sessionId: "session-7", eventType: null, page: { limit: 20 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
    );
  });

  it("query functions call host API wrappers with context and normalized pages", async () => {
    vi.mocked(fetchHostCurrentSession).mockResolvedValue({ currentSession: null });
    vi.mocked(fetchHostDashboard).mockResolvedValue({
      rsvpPending: 0,
      checkinMissing: 0,
      publishPending: 0,
      feedbackPending: 0,
    });
    vi.mocked(fetchHostSessions).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({
      sessionId: "session-7",
      sessionNumber: 7,
      title: "7회차 모임",
      bookTitle: "테스트 책",
      bookAuthor: "테스트 저자",
      bookLink: null,
      bookImageUrl: null,
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      date: "2026-05-20",
      startTime: "20:00",
      endTime: "22:00",
      questionDeadlineAt: "2026-05-19T14:59:00Z",
      visibility: "HOST_ONLY",
      publication: null,
      state: "OPEN",
      attendees: [],
      feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
    });
    vi.mocked(fetchHostSessionDeletionPreview).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    vi.mocked(fetchManualNotificationDispatches).mockResolvedValue({ items: [], nextCursor: null });

    await runQuery(hostCurrentSessionQuery({ clubSlug: "reading-sai" }));
    await runQuery(hostDashboardQuery({ clubSlug: "reading-sai" }));
    await runQuery(hostSessionListQuery({ limit: 50 }, { clubSlug: "reading-sai" }));
    await runQuery(hostSessionDetailQuery("session-7", { clubSlug: "reading-sai" }));
    await runQuery(hostSessionDeletionPreviewQuery("session-7", { clubSlug: "reading-sai" }));
    await runQuery(hostSessionManualDispatchesQuery(
      { sessionId: "session-7", page: { limit: 20 } },
      { clubSlug: "reading-sai" },
    ));

    expect(fetchHostCurrentSession).toHaveBeenCalledWith({ clubSlug: "reading-sai" });
    expect(fetchHostDashboard).toHaveBeenCalledWith({ clubSlug: "reading-sai" });
    expect(fetchHostSessions).toHaveBeenCalledWith({ clubSlug: "reading-sai" }, { limit: 50 });
    expect(fetchHostSessionDetail).toHaveBeenCalledWith("session-7", { clubSlug: "reading-sai" });
    expect(fetchHostSessionDeletionPreview).toHaveBeenCalledWith("session-7", { clubSlug: "reading-sai" });
    expect(fetchManualNotificationDispatches).toHaveBeenCalledWith(
      { clubSlug: "reading-sai" },
      { sessionId: "session-7", page: { limit: 20 } },
    );
  });

  it("invalidates each host session surface with scoped keys", async () => {
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateHostSessionLists(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionDetail(client as never, "session-7", { clubSlug: "reading-sai" });
    await invalidateHostCurrentSession(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionDashboard(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionManualDispatches(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionSurface(client as never, { clubSlug: "reading-sai" });

    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.scope({ clubSlug: "reading-sai" }),
    });
  });
});
```

- [ ] **Step 2: Run tests to verify the new module is missing**

Run:

```bash
pnpm --dir front test -- host-session-queries.test.ts
```

Expected: FAIL with an import error for `./host-session-queries`.

- [ ] **Step 3: Add the read-query module**

Create `front/features/host/queries/host-session-queries.ts` with this initial content:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostSessionDeletionPreview,
  fetchHostSessionDetail,
  fetchHostSessions,
  fetchManualNotificationDispatches,
} from "@/features/host/api/host-api";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostSessionDetailResponse,
  HostSessionListPage,
  ManualNotificationDispatchListResponse,
  HostNotificationEventType,
} from "@/features/host/api/host-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";

type NormalizedPageRequest = {
  limit: number | null;
  cursor: string | null;
};

export type HostSessionManualDispatchesQueryRequest = {
  sessionId?: string | null;
  eventType?: HostNotificationEventType | null;
  page?: PageRequest;
};

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

function normalizePage(page?: PageRequest): NormalizedPageRequest {
  return {
    limit: page?.limit ?? null,
    cursor: page?.cursor ?? null,
  };
}

function pageFromNormalized(page: NormalizedPageRequest): PageRequest | undefined {
  if (page.limit === null && page.cursor === null) {
    return undefined;
  }

  return {
    ...(page.limit !== null ? { limit: page.limit } : {}),
    ...(page.cursor !== null ? { cursor: page.cursor } : {}),
  };
}

function optional(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function normalizeManualDispatchesRequest(request?: HostSessionManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePage(request?.page),
  };
}

export const hostSessionKeys = {
  all: ["host", "sessions"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.all, "scope", scopeKey(context)] as const,
  lists: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "list"] as const,
  list: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.lists(context), normalizePage(page)] as const,
  detail: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "detail", sessionId] as const,
  current: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "current"] as const,
  dashboard: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "dashboard"] as const,
  deletionPreview: (sessionId: string, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "deletionPreview", sessionId] as const,
  manualDispatchesRoot: (context?: ReadmatesApiContext) =>
    [...hostSessionKeys.scope(context), "manualDispatches"] as const,
  manualDispatches: (request?: HostSessionManualDispatchesQueryRequest, context?: ReadmatesApiContext) =>
    [...hostSessionKeys.manualDispatchesRoot(context), normalizeManualDispatchesRequest(request)] as const,
} as const;

export function hostCurrentSessionQuery(context?: ReadmatesApiContext) {
  return queryOptions<CurrentSessionResponse>({
    queryKey: hostSessionKeys.current(context),
    queryFn: () => fetchHostCurrentSession(context),
  });
}

export function hostDashboardQuery(context?: ReadmatesApiContext) {
  return queryOptions<HostDashboardResponse>({
    queryKey: hostSessionKeys.dashboard(context),
    queryFn: () => fetchHostDashboard(context),
  });
}

export function hostSessionListQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  const normalized = normalizePage(page);
  return queryOptions<HostSessionListPage>({
    queryKey: hostSessionKeys.list(page, context),
    queryFn: () => fetchHostSessions(context, pageFromNormalized(normalized)),
  });
}

export function hostSessionDetailQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<HostSessionDetailResponse>({
    queryKey: hostSessionKeys.detail(sessionId, context),
    queryFn: () => fetchHostSessionDetail(sessionId, context),
  });
}

export function hostSessionDeletionPreviewQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostSessionKeys.deletionPreview(sessionId, context),
    queryFn: () => fetchHostSessionDeletionPreview(sessionId, context),
  });
}

export function hostSessionManualDispatchesQuery(
  request?: HostSessionManualDispatchesQueryRequest,
  context?: ReadmatesApiContext,
) {
  const normalized = normalizeManualDispatchesRequest(request);
  return queryOptions<ManualNotificationDispatchListResponse>({
    queryKey: hostSessionKeys.manualDispatches(request, context),
    queryFn: () => fetchManualNotificationDispatches(context, {
      sessionId: optional(normalized.sessionId),
      eventType: normalized.eventType ?? undefined,
      page: pageFromNormalized(normalized.page),
    }),
  });
}

export function invalidateHostSessionLists(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.lists(context) });
}

export function invalidateHostSessionDetail(client: QueryClient, sessionId: string, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
}

export function invalidateHostCurrentSession(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.current(context) });
}

export function invalidateHostSessionDashboard(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.dashboard(context) });
}

export function invalidateHostSessionManualDispatches(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.manualDispatchesRoot(context) });
}

export function invalidateHostSessionSurface(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostSessionKeys.scope(context) });
}
```

- [ ] **Step 4: Run tests to verify read queries pass**

Run:

```bash
pnpm --dir front test -- host-session-queries.test.ts
```

Expected: PASS for the new query key and read-query tests.

- [ ] **Step 5: Commit Task 1**

```bash
git add front/features/host/queries/host-session-queries.ts front/features/host/queries/host-session-queries.test.ts
git commit -m "feat(front): add host session query keys"
```

---

### Task 2: Add Host Session Mutation Hooks

**Files:**
- Modify: `front/features/host/queries/host-session-queries.ts`
- Create: `front/features/host/queries/host-session-queries.hooks.test.tsx`

- [ ] **Step 1: Write failing mutation hook tests**

Create `front/features/host/queries/host-session-queries.hooks.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSessionRequest, SessionImportRequest } from "@/features/host/api/host-contracts";

vi.mock("@/features/host/api/host-api", () => ({
  closeHostSession: vi.fn(),
  commitHostSessionImport: vi.fn(),
  createHostSession: vi.fn(),
  deleteHostSession: vi.fn(),
  openHostSession: vi.fn(),
  publishHostSession: vi.fn(),
  saveHostSessionAttendance: vi.fn(),
  saveHostSessionPublication: vi.fn(),
  saveHostSessionVisibility: vi.fn(),
  updateHostSession: vi.fn(),
}));

import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  openHostSession,
  publishHostSession,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionVisibility,
  updateHostSession,
} from "@/features/host/api/host-api";
import {
  hostSessionKeys,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
  usePublishHostSessionMutation,
  useSaveHostSessionPublicationMutation,
  useSaveHostSessionVisibilityMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
} from "./host-session-queries";

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

const sessionRequest: HostSessionRequest = {
  title: "8회차 모임",
  bookTitle: "다음 책",
  bookAuthor: "테스트 저자",
  date: "2026-06-20",
};

const importRequest: SessionImportRequest = {
  format: "readmates-session-import:v1",
  session: {
    number: 7,
    bookTitle: "테스트 책",
    meetingDate: "2026-05-20",
  },
  publication: {
    summary: "세션 요약",
  },
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "session-7.md",
    markdown: "# 세션 기록",
  },
  recordVisibility: "MEMBER",
};

beforeEach(() => {
  vi.mocked(createHostSession).mockReset();
  vi.mocked(updateHostSession).mockReset();
  vi.mocked(deleteHostSession).mockReset();
  vi.mocked(openHostSession).mockReset();
  vi.mocked(closeHostSession).mockReset();
  vi.mocked(publishHostSession).mockReset();
  vi.mocked(saveHostSessionVisibility).mockReset();
  vi.mocked(saveHostSessionPublication).mockReset();
  vi.mocked(saveHostSessionAttendance).mockReset();
  vi.mocked(commitHostSessionImport).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("host session mutation hooks", () => {
  it("invalidates lists and dashboard after a successful create response", async () => {
    vi.mocked(createHostSession).mockResolvedValue(new Response(JSON.stringify({ sessionId: "session-8" }), { status: 201 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createHostSession).toHaveBeenCalledWith(sessionRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
  });

  it("does not invalidate lists when create returns a non-ok response", async () => {
    vi.mocked(createHostSession).mockResolvedValue(new Response("bad request", { status: 400 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates detail, lists, dashboard, and current session after update", async () => {
    vi.mocked(updateHostSession).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: sessionRequest });
    });

    expect(updateHostSession).toHaveBeenCalledWith("session-7", sessionRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
  });

  it("removes deleted detail cache and invalidates dependent surfaces after delete", async () => {
    vi.mocked(deleteHostSession).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }), { sessionId: "session-7" });
    const removeSpy = vi.spyOn(client, "removeQueries");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(deleteHostSession).toHaveBeenCalledWith("session-7");
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }) });
  });

  it.each([
    ["open", useOpenHostSessionMutation, openHostSession],
    ["close", useCloseHostSessionMutation, closeHostSession],
    ["publish", usePublishHostSessionMutation, publishHostSession],
  ] as const)("invalidates session surfaces after %s", async (_name, hook, apiFn) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(apiFn).toHaveBeenCalledWith("session-7");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
  });

  it("invalidates detail, lists, and dashboard after visibility save", async () => {
    vi.mocked(saveHostSessionVisibility).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveHostSessionVisibilityMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: { visibility: "MEMBER" } });
    });

    expect(saveHostSessionVisibility).toHaveBeenCalledWith("session-7", { visibility: "MEMBER" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
  });

  it("invalidates manual dispatches after publication save", async () => {
    vi.mocked(saveHostSessionPublication).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveHostSessionPublicationMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        request: { publicSummary: "요약", visibility: "MEMBER" },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }) });
  });

  it("invalidates detail and current session after attendance update", async () => {
    vi.mocked(saveHostSessionAttendance).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateHostSessionAttendanceMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
      });
    });

    expect(saveHostSessionAttendance).toHaveBeenCalledWith("session-7", [
      { membershipId: "member-1", attendanceStatus: "ATTENDED" },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
  });

  it("invalidates the full host session surface after import commit", async () => {
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      publication: { summary: "세션 요약" },
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: {
        uploaded: true,
        fileName: "session-7.md",
        title: "세션 기록",
        uploadedAt: "2026-05-18T00:00:00Z",
      },
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCommitHostSessionImportMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: importRequest });
    });

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", importRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }) });
  });
});
```

- [ ] **Step 2: Run tests to verify hooks are missing**

Run:

```bash
pnpm --dir front test -- host-session-queries.hooks.test.tsx
```

Expected: FAIL with missing exported mutation hooks.

- [ ] **Step 3: Add mutation hooks and response-ok invalidation guards**

Append these imports to `front/features/host/queries/host-session-queries.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  openHostSession,
  publishHostSession,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionVisibility,
  updateHostSession,
} from "@/features/host/api/host-api";
import type {
  HostAttendanceUpdate,
  HostSessionPublicationRequest,
  HostSessionRequest,
  HostSessionVisibilityRequest,
  SessionImportRequest,
} from "@/features/host/api/host-contracts";
```

Then append these helpers and hooks below the existing invalidation helpers:

```ts
function invalidateOk(response: Response, invalidate: () => Promise<unknown>) {
  return response.ok ? invalidate() : Promise.resolve();
}

async function invalidateSessionMutationSurfaces(
  client: QueryClient,
  sessionId: string,
  context?: ReadmatesApiContext,
  options?: { manualDispatches?: boolean },
) {
  await Promise.all([
    invalidateHostSessionDetail(client, sessionId, context),
    invalidateHostSessionLists(client, context),
    invalidateHostSessionDashboard(client, context),
    invalidateHostCurrentSession(client, context),
    ...(options?.manualDispatches ? [invalidateHostSessionManualDispatches(client, context)] : []),
  ]);
}

export function useCreateHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: HostSessionRequest) => createHostSession(request),
    onSuccess: (response) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
        ]),
      ),
  });
}

export function useUpdateHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: HostSessionRequest }) =>
      updateHostSession(sessionId, request),
    onSuccess: (response, variables) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, variables.sessionId, context)),
  });
}

export function useDeleteHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, async () => {
        client.removeQueries({ queryKey: hostSessionKeys.detail(sessionId, context) });
        await Promise.all([
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
          invalidateHostCurrentSession(client, context),
          invalidateHostSessionManualDispatches(client, context),
        ]);
      }),
  });
}

export function useOpenHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => openHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context)),
  });
}

export function useCloseHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => closeHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function usePublishHostSessionMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => publishHostSession(sessionId),
    onSuccess: (response, sessionId) =>
      invalidateOk(response, () => invalidateSessionMutationSurfaces(client, sessionId, context, { manualDispatches: true })),
  });
}

export function useSaveHostSessionVisibilityMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: HostSessionVisibilityRequest }) =>
      saveHostSessionVisibility(sessionId, request),
    onSuccess: (response, variables) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionDetail(client, variables.sessionId, context),
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
        ]),
      ),
  });
}

export function useSaveHostSessionPublicationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: HostSessionPublicationRequest }) =>
      saveHostSessionPublication(sessionId, request),
    onSuccess: (response, variables) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionDetail(client, variables.sessionId, context),
          invalidateHostSessionLists(client, context),
          invalidateHostSessionDashboard(client, context),
          invalidateHostSessionManualDispatches(client, context),
        ]),
      ),
  });
}

export function useUpdateHostSessionAttendanceMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, attendance }: { sessionId: string; attendance: HostAttendanceUpdate[] }) =>
      saveHostSessionAttendance(sessionId, attendance),
    onSuccess: (response, variables) =>
      invalidateOk(response, () =>
        Promise.all([
          invalidateHostSessionDetail(client, variables.sessionId, context),
          invalidateHostCurrentSession(client, context),
        ]),
      ),
  });
}

export function useCommitHostSessionImportMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, request }: { sessionId: string; request: SessionImportRequest }) =>
      commitHostSessionImport(sessionId, request),
    onSuccess: (_response, variables) =>
      Promise.all([
        invalidateHostSessionDetail(client, variables.sessionId, context),
        invalidateHostSessionLists(client, context),
        invalidateHostSessionDashboard(client, context),
        invalidateHostCurrentSession(client, context),
        invalidateHostSessionManualDispatches(client, context),
      ]),
  });
}
```

If TypeScript reports duplicate imports from `@tanstack/react-query` or `host-api`, merge the import lists into a single import per module.

- [ ] **Step 4: Run mutation hook tests**

Run:

```bash
pnpm --dir front test -- host-session-queries.hooks.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run all host session query tests**

Run:

```bash
pnpm --dir front test -- host-session-queries
```

Expected: PASS for `host-session-queries.test.ts` and `host-session-queries.hooks.test.tsx`.

- [ ] **Step 6: Commit Task 2**

```bash
git add front/features/host/queries/host-session-queries.ts front/features/host/queries/host-session-queries.hooks.test.tsx
git commit -m "feat(front): add host session mutation hooks"
```

---

### Task 3: Migrate Host Dashboard Loader and Route

**Files:**
- Modify: `front/features/host/route/host-dashboard-data.ts`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/features/host/index.ts`
- Modify: `front/tests/unit/host-dashboard.test.tsx`

- [ ] **Step 1: Update dashboard loader tests to use a QueryClient-backed factory**

In `front/tests/unit/host-dashboard.test.tsx`, change the import from `@/features/host`:

```ts
import {
  hostDashboardLoaderFactory,
  hostInvitationsLoaderFactory,
  hostMembersLoaderFactory,
  hostSessionEditorLoaderFactory,
} from "@/features/host";
```

Add this helper near `expectLoaderRedirect`:

```ts
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function hostDashboardLoaderForTest(args?: LoaderFunctionArgs) {
  return hostDashboardLoaderFactory(createTestQueryClient())(args);
}
```

Replace `hostSessionEditorLoaderForTest` with:

```ts
function hostSessionEditorLoaderForTest() {
  return hostSessionEditorLoaderFactory(createTestQueryClient())({
    params: { sessionId: "session-7" },
    request: new Request("https://readmates.test/app/host/sessions/session-7/edit"),
  } as unknown as Parameters<ReturnType<typeof hostSessionEditorLoaderFactory>>[0]);
}
```

Replace loader case entries:

```ts
const hostLoaderCases: Array<[string, () => Promise<unknown>, string]> = [
  ["dashboard", () => hostDashboardLoaderForTest(), "/login"],
  ["members", () => hostMembersLoaderFactory(new QueryClient())(), "/login"],
  ["invitations", () => hostInvitationsLoaderFactory(new QueryClient())(), "/login"],
  ["session editor", hostSessionEditorLoaderForTest, "/login?returnTo=%2Fapp%2Fhost%2Fsessions%2Fsession-7%2Fedit"],
];

const clubScopedHostDashboardLoader = hostDashboardLoaderForTest;
```

Replace direct `hostDashboardLoader(...)` calls in this file with `hostDashboardLoaderForTest(...)`.

Add a loader cache assertion after the existing "loads host session list for the dashboard" test:

```ts
  it("seeds host dashboard query data into the shared query client", async () => {
    const client = createTestQueryClient();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/sessions/current?clubSlug=reading-sai") return Promise.resolve(jsonResponse(current));
      if (url === "/api/bff/api/host/dashboard?clubSlug=reading-sai") return Promise.resolve(jsonResponse(dashboard));
      if (url === "/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: hostSessions, nextCursor: null }));
      }
      if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(notificationSummary));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await hostDashboardLoaderFactory(client)({
      params: { clubSlug: "reading-sai" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host"),
    } as LoaderFunctionArgs);

    const { hostCurrentSessionQuery, hostDashboardQuery, hostSessionListQuery } = await import(
      "@/features/host/queries/host-session-queries"
    );
    const { hostNotificationSummaryQuery } = await import("@/features/host/queries/host-notification-queries");

    expect(client.getQueryData(hostCurrentSessionQuery({ clubSlug: "reading-sai" }).queryKey)).toEqual(current);
    expect(client.getQueryData(hostDashboardQuery({ clubSlug: "reading-sai" }).queryKey)).toEqual(dashboard);
    expect(client.getQueryData(hostSessionListQuery({ limit: 50 }, { clubSlug: "reading-sai" }).queryKey)).toEqual({
      items: hostSessions,
      nextCursor: null,
    });
    expect(client.getQueryData(hostNotificationSummaryQuery({ clubSlug: "reading-sai" }).queryKey)).toEqual(notificationSummary);
  });
```

- [ ] **Step 2: Run dashboard tests to verify the old loader shape fails**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx
```

Expected: FAIL with missing `hostDashboardLoaderFactory` and `hostSessionEditorLoaderFactory` exports.

- [ ] **Step 3: Convert dashboard data loader to a factory**

Replace `front/features/host/route/host-dashboard-data.ts` with this structure:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { fetchHostNotificationSummary, submitHostMemberLifecycle } from "@/features/host/api/host-api";
import type { HostDashboardActions } from "@/features/host/route/host-dashboard-actions";
import { hostNotificationSummaryQuery } from "@/features/host/queries/host-notification-queries";
import {
  hostCurrentSessionQuery,
  hostDashboardQuery,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import { isReadmatesApiError } from "@/shared/api/errors";
import type {
  CurrentSessionResponse,
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListPage,
} from "@/features/host/api/host-contracts";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

const HOST_SESSIONS_PAGE_LIMIT = 50;

const EMPTY_HOST_NOTIFICATION_SUMMARY: HostNotificationSummary = {
  pending: 0,
  failed: 0,
  dead: 0,
  sentLast24h: 0,
  latestFailures: [],
};

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
  hostSessions: HostSessionListPage;
  notifications: HostNotificationSummary;
};

export function hostDashboardLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostDashboardRouteData> => {
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };

    const [current, data, hostSessions, notifications] = await Promise.all([
      client.fetchQuery(hostCurrentSessionQuery(context)),
      client.fetchQuery(hostDashboardQuery(context)),
      client.fetchQuery(hostSessionListQuery({ limit: HOST_SESSIONS_PAGE_LIMIT }, context)),
      fetchHostNotificationSummary(context).catch(notificationSummaryFallback),
    ]);

    client.setQueryData(hostNotificationSummaryQuery(context).queryKey, notifications);

    return {
      current,
      data,
      hostSessions,
      notifications,
    };
  };
}

function notificationSummaryFallback(error: unknown): HostNotificationSummary {
  if (
    isReadmatesApiError(error) &&
    [404, 502, 503, 504].includes(error.status)
  ) {
    return EMPTY_HOST_NOTIFICATION_SUMMARY;
  }

  throw error;
}

export const hostDashboardActions = {
  updateCurrentSessionParticipation: async (membershipId, action) => {
    const response = await submitHostMemberLifecycle(
      membershipId,
      action === "add" ? "/current-session/add" : "/current-session/remove",
    );

    if (!response.ok) {
      throw new Error("Current session member action failed");
    }
  },
} satisfies Pick<HostDashboardActions, "updateCurrentSessionParticipation">;
```

If the URL order in tests differs, update the test expectation to the actual output of `readmatesApiPath`; keep the assertion scoped to both `limit=50` and `clubSlug=reading-sai`.

- [ ] **Step 4: Convert dashboard route to Query reads and Query-backed actions**

In `front/features/host/route/host-dashboard-route.tsx`, replace the current imports and route body with this pattern:

```tsx
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostDashboard, { type HostDashboardLinkComponent } from "@/features/host/ui/host-dashboard";
import { ClubAiDefaultsSection } from "@/features/host/club/ui/ClubAiDefaultsSection";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostDashboardActions } from "@/features/host/route/host-dashboard-actions";
import { hostNotificationSummaryQuery } from "@/features/host/queries/host-notification-queries";
import {
  hostCurrentSessionQuery,
  hostDashboardQuery,
  hostSessionListQuery,
  useOpenHostSessionMutation,
  useSaveHostSessionVisibilityMutation,
} from "@/features/host/queries/host-session-queries";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { hostDashboardActions, type HostDashboardRouteData } from "./host-dashboard-data";

const HOST_SESSIONS_PAGE_LIMIT = 50;

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

export function HostDashboardRoute({
  auth,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostDashboardLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const currentQuery = useQuery(hostCurrentSessionQuery(context));
  const dashboardQuery = useQuery(hostDashboardQuery(context));
  const sessionsQuery = useQuery(hostSessionListQuery({ limit: HOST_SESSIONS_PAGE_LIMIT }, context));
  const notificationsQuery = useQuery(hostNotificationSummaryQuery(context));
  const visibilityMutation = useSaveHostSessionVisibilityMutation(context);
  const openMutation = useOpenHostSessionMutation(context);

  const actions = useMemo<HostDashboardActions>(() => ({
    updateCurrentSessionParticipation: hostDashboardActions.updateCurrentSessionParticipation,
    updateSessionVisibility: async (sessionId, visibility) => {
      const response = await visibilityMutation.mutateAsync({ sessionId, request: { visibility } });
      if (!response.ok) {
        throw new Error("Host session visibility update failed");
      }
    },
    openSession: async (sessionId) => {
      const response = await openMutation.mutateAsync(sessionId);
      if (!response.ok) {
        throw new Error("Host session open failed");
      }
    },
    loadHostSessions: (page) => queryClient.fetchQuery(hostSessionListQuery(page, context)),
  }), [context, openMutation, queryClient, visibilityMutation]);

  return (
    <>
      <HostDashboard
        auth={auth}
        current={currentQuery.data ?? loaderData.current}
        data={dashboardQuery.data ?? loaderData.data}
        hostSessions={sessionsQuery.data ?? loaderData.hostSessions}
        notifications={notificationsQuery.data ?? loaderData.notifications}
        actions={actions}
        LinkComponent={LinkComponent}
        hostDashboardReturnTarget={hostDashboardReturnTarget}
        readmatesReturnState={readmatesReturnState}
      />
      {clubSlug ? (
        <section className="container" style={{ padding: "0 0 48px" }}>
          <div className="rm-document-panel" style={{ padding: "22px" }}>
            <ClubAiDefaultsSection clubSlug={clubSlug} />
          </div>
        </section>
      ) : null}
    </>
  );
}
```

If TypeScript requires parameter annotations in the `actions` object, import `HostDashboardActions` and annotate `const actions: HostDashboardActions = useMemo(...)`.

- [ ] **Step 5: Wire the dashboard loader factory in router and exports**

In `front/src/app/routes/host.tsx`, change the dashboard lazy import:

```tsx
const [{ HostDashboardRouteElement }, { hostDashboardLoaderFactory }] = await Promise.all([
  import("@/src/app/host-route-elements"),
  import("@/features/host/route/host-dashboard-data"),
]);
return { Component: HostDashboardRouteElement, loader: hostDashboardLoaderFactory(queryClient) };
```

In `front/features/host/index.ts`, export:

```ts
export {
  hostDashboardActions,
  hostDashboardLoaderFactory,
  type HostDashboardRouteData,
} from "@/features/host/route/host-dashboard-data";
```

Remove `hostDashboardLoader` from the export list.

- [ ] **Step 6: Run focused dashboard tests**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add front/features/host/route/host-dashboard-data.ts front/features/host/route/host-dashboard-route.tsx front/src/app/routes/host.tsx front/features/host/index.ts front/tests/unit/host-dashboard.test.tsx
git commit -m "feat(front): move host dashboard sessions to query"
```

---

### Task 4: Migrate Host Session Editor Loader and Route

**Files:**
- Modify: `front/features/host/route/host-session-editor-data.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/features/host/index.ts`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`

- [ ] **Step 1: Add editor loader cache-seeding tests**

In `front/tests/unit/host-dashboard.test.tsx`, update fetch mocks used by `hostSessionEditorLoaderForTest` so session detail and manual dispatches both resolve. Then add:

```ts
  it("seeds host session editor detail and manual dispatches into the shared query client", async () => {
    const client = createTestQueryClient();
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") return Promise.resolve(authResponse(hostAuth));
      if (url === "/api/bff/api/host/sessions/session-7?clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse(hostSessionDetailContractFixture));
      }
      if (url === "/api/bff/api/host/notifications/manual/dispatches?sessionId=session-7&limit=20&clubSlug=reading-sai") {
        return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await hostSessionEditorLoaderFactory(client)({
      params: { clubSlug: "reading-sai", sessionId: "session-7" },
      request: new Request("https://readmates.test/clubs/reading-sai/app/host/sessions/session-7/edit"),
    } as LoaderFunctionArgs);

    const { hostSessionDetailQuery, hostSessionManualDispatchesQuery } = await import(
      "@/features/host/queries/host-session-queries"
    );
    expect(client.getQueryData(hostSessionDetailQuery("session-7", { clubSlug: "reading-sai" }).queryKey)).toEqual(
      hostSessionDetailContractFixture,
    );
    expect(client.getQueryData(
      hostSessionManualDispatchesQuery(
        { sessionId: "session-7", page: { limit: 20 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
    )).toEqual({ items: [], nextCursor: null });
  });
```

At the top of the file, import the fixture:

```ts
import { hostSessionDetailContractFixture } from "./api-contract-fixtures";
```

If the manual dispatch URL parameter order differs, assert the recorded URL contains all of these substrings instead: `/api/host/notifications/manual/dispatches`, `sessionId=session-7`, `limit=20`, and `clubSlug=reading-sai`.

- [ ] **Step 2: Run the test to verify editor loader factory is not implemented**

Run:

```bash
pnpm --dir front test -- host-dashboard.test.tsx
```

Expected: FAIL on editor loader factory or missing seeded query data.

- [ ] **Step 3: Convert editor data loader to a factory**

Replace `front/features/host/route/host-session-editor-data.ts` with:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { previewHostSessionImport } from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import {
  hostSessionDetailQuery,
  hostSessionManualDispatchesQuery,
} from "@/features/host/queries/host-session-queries";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;

export type HostSessionEditorRouteData = {
  sessionId: string;
};

export function hostSessionEditorLoaderFactory(client: QueryClient) {
  return async (args: LoaderFunctionArgs): Promise<HostSessionEditorRouteData> => {
    const { params } = args;
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };

    if (!params.sessionId) {
      throw new Error("Missing host session id");
    }

    await Promise.all([
      client.fetchQuery(hostSessionDetailQuery(params.sessionId, context)),
      client.fetchQuery(hostSessionManualDispatchesQuery(
        { sessionId: params.sessionId, page: { limit: EDITOR_MANUAL_DISPATCH_PAGE_LIMIT } },
        context,
      )),
    ]);

    return { sessionId: params.sessionId };
  };
}

export const hostSessionEditorPreviewActions = {
  previewSessionImport: previewHostSessionImport,
} satisfies Pick<HostSessionEditorActions, "previewSessionImport">;
```

- [ ] **Step 4: Convert editor route to Query reads and Query-backed actions**

In `front/features/host/route/host-session-editor-route.tsx`, replace the module with this structure:

```tsx
import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import HostSessionEditor, { type HostSessionEditorLinkComponent } from "@/features/host/ui/host-session-editor";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import { invalidateHostNotifications } from "@/features/host/queries/host-notification-queries";
import {
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  hostSessionManualDispatchesQuery,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  usePublishHostSessionMutation,
  useSaveHostSessionPublicationMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionEditorPreviewActions,
  type HostSessionEditorRouteData,
} from "./host-session-editor-data";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;

type HostSessionEditorRouteProps = {
  returnTarget?: ReadmatesReturnTarget;
  LinkComponent?: HostSessionEditorLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
};

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

function useHostSessionEditorActions(context: ReadmatesApiContext): HostSessionEditorActions {
  const queryClient = useQueryClient();
  const createMutation = useCreateHostSessionMutation(context);
  const updateMutation = useUpdateHostSessionMutation(context);
  const deleteMutation = useDeleteHostSessionMutation(context);
  const closeMutation = useCloseHostSessionMutation(context);
  const publishMutation = usePublishHostSessionMutation(context);
  const publicationMutation = useSaveHostSessionPublicationMutation(context);
  const attendanceMutation = useUpdateHostSessionAttendanceMutation(context);
  const importCommitMutation = useCommitHostSessionImportMutation(context);

  return useMemo<HostSessionEditorActions>(() => ({
    loadDeletionPreview: (sessionId) =>
      queryClient.fetchQuery(hostSessionDeletionPreviewQuery(sessionId, context)),
    deleteSession: (sessionId) => deleteMutation.mutateAsync(sessionId),
    closeSession: (sessionId) => closeMutation.mutateAsync(sessionId),
    publishSession: (sessionId) => publishMutation.mutateAsync(sessionId),
    saveSession: (sessionId, request) =>
      sessionId === null
        ? createMutation.mutateAsync(request)
        : updateMutation.mutateAsync({ sessionId, request }),
    savePublication: (sessionId, request) =>
      publicationMutation.mutateAsync({ sessionId, request }),
    updateAttendance: (sessionId, attendance) =>
      attendanceMutation.mutateAsync({ sessionId, attendance }),
    previewSessionImport: hostSessionEditorPreviewActions.previewSessionImport,
    commitSessionImport: async (sessionId, request) => {
      const result = await importCommitMutation.mutateAsync({ sessionId, request });
      await invalidateHostNotifications(queryClient, context);
      return result;
    },
  }), [
    attendanceMutation,
    closeMutation,
    context,
    createMutation,
    deleteMutation,
    importCommitMutation,
    publicationMutation,
    publishMutation,
    queryClient,
    updateMutation,
  ]);
}

export function NewHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: HostSessionEditorRouteProps) {
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const actions = useHostSessionEditorActions(context);
  return (
    <HostSessionEditor
      returnTarget={returnTarget}
      actions={actions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}

export function EditHostSessionRoute({
  returnTarget,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: HostSessionEditorRouteProps) {
  const loaderData = useLoaderData() as HostSessionEditorRouteData;
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? loaderData.sessionId;
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const actions = useHostSessionEditorActions(context);
  const sessionQuery = useQuery(hostSessionDetailQuery(sessionId, context));
  const dispatchesQuery = useQuery(hostSessionManualDispatchesQuery(
    { sessionId, page: { limit: EDITOR_MANUAL_DISPATCH_PAGE_LIMIT } },
    context,
  ));

  if (!sessionQuery.data) {
    return null;
  }

  return (
    <HostSessionEditor
      session={sessionQuery.data}
      notificationDispatches={dispatchesQuery.data?.items ?? []}
      returnTarget={returnTarget}
      actions={actions}
      clubSlug={clubSlug}
      LinkComponent={LinkComponent}
      hostDashboardReturnTarget={hostDashboardReturnTarget}
      readmatesReturnState={readmatesReturnState}
    />
  );
}
```

If returning `null` during a missing seeded detail creates a lint or test concern, replace it with the existing route loading component from `front/src/pages/readmates-page.tsx`.

- [ ] **Step 5: Wire editor loader factory in router and exports**

In `front/src/app/routes/host.tsx`, change the editor lazy route:

```tsx
const [{ EditHostSessionRouteElement }, { hostSessionEditorLoaderFactory }] = await Promise.all([
  import("@/src/app/host-route-elements"),
  import("@/features/host/route/host-session-editor-data"),
]);
return { Component: EditHostSessionRouteElement, loader: hostSessionEditorLoaderFactory(queryClient) };
```

In `front/features/host/index.ts`, export:

```ts
export {
  hostSessionEditorLoaderFactory,
  hostSessionEditorPreviewActions,
  type HostSessionEditorRouteData,
} from "@/features/host/route/host-session-editor-data";
```

Remove `hostSessionEditorActions` and `hostSessionEditorLoader` from the export list.

- [ ] **Step 6: Add route-level mutation invalidation regression for import commit**

Create `front/tests/unit/host-session-editor-route.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EditHostSessionRoute } from "@/features/host/route/host-session-editor-route";
import { hostNotificationKeys } from "@/features/host/queries/host-notification-queries";
import {
  hostSessionDetailQuery,
  hostSessionManualDispatchesQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionDetailContractFixture } from "./api-contract-fixtures";

vi.mock("@/features/host/api/host-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/host/api/host-api")>();
  return {
    ...actual,
    commitHostSessionImport: vi.fn(),
  };
});

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useLoaderData: () => ({ sessionId: "session-7" }),
    useParams: () => ({ clubSlug: "reading-sai", sessionId: "session-7" }),
  };
});

vi.mock("@/features/host/ui/host-session-editor", () => ({
  default: ({ actions }: { actions: { commitSessionImport: (sessionId: string, request: never) => Promise<unknown> } }) => (
    <button
      type="button"
      onClick={() =>
        actions.commitSessionImport("session-7", {
          format: "readmates-session-import:v1",
          session: { number: 7, bookTitle: "테스트 책", meetingDate: "2026-05-20" },
          publication: { summary: "세션 요약" },
          highlights: [],
          oneLineReviews: [],
          feedbackDocument: { fileName: "session-7.md", markdown: "# 세션 기록" },
          recordVisibility: "MEMBER",
        } as never)
      }
    >
      commit import
    </button>
  ),
}));

import { commitHostSessionImport } from "@/features/host/api/host-api";

describe("EditHostSessionRoute query actions", () => {
  beforeEach(() => {
    vi.mocked(commitHostSessionImport).mockReset();
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      publication: { summary: "세션 요약" },
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: {
        uploaded: true,
        fileName: "session-7.md",
        title: "세션 기록",
        uploadedAt: "2026-05-18T00:00:00Z",
      },
    });
  });

  it("keeps editor rendering from query seeded data and invalidates notifications after import commit", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData(
      hostSessionDetailQuery("session-7", { clubSlug: "reading-sai" }).queryKey,
      hostSessionDetailContractFixture,
    );
    client.setQueryData(
      hostSessionManualDispatchesQuery(
        { sessionId: "session-7", page: { limit: 20 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
      { items: [], nextCursor: null },
    );
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <EditHostSessionRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "commit import" }));

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", expect.objectContaining({
      format: "readmates-session-import:v1",
    }));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.scope({ clubSlug: "reading-sai" }),
    });
  });
});
```

- [ ] **Step 7: Run editor-focused tests**

Run:

```bash
pnpm --dir front test -- host-session-editor.test.tsx host-dashboard.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add front/features/host/route/host-session-editor-data.ts front/features/host/route/host-session-editor-route.tsx front/src/app/routes/host.tsx front/features/host/index.ts front/tests/unit/host-dashboard.test.tsx front/tests/unit/host-session-editor.test.tsx front/tests/unit/host-session-editor-route.test.tsx
git commit -m "feat(front): move host session editor state to query"
```

---

### Task 5: Share Host Session List With Notifications

**Files:**
- Modify: `front/features/host/queries/host-notification-queries.ts`
- Modify: `front/features/host/route/host-notifications-data.ts`
- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/features/host/queries/host-notification-queries.test.ts`
- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Write failing notification query test for shared session key**

In `front/features/host/queries/host-notification-queries.test.ts`, add imports:

```ts
import { hostSessionListQuery } from "./host-session-queries";
import { hostNotificationSessionsQuery } from "./host-notification-queries";
```

Add this test:

```ts
  it("uses the shared host session list query for notification session selectors", () => {
    expect(hostNotificationSessionsQuery({ clubSlug: "reading-sai" }).queryKey).toEqual(
      hostSessionListQuery({ limit: 50 }, { clubSlug: "reading-sai" }).queryKey,
    );
  });
```

- [ ] **Step 2: Run the notification query test to verify it fails**

Run:

```bash
pnpm --dir front test -- host-notification-queries.test.ts
```

Expected: FAIL because `hostNotificationSessionsQuery` still returns a notification-owned key.

- [ ] **Step 3: Wrap notification session query with shared host session list query**

In `front/features/host/queries/host-notification-queries.ts`:

1. Add:

```ts
import { hostSessionListQuery } from "@/features/host/queries/host-session-queries";
```

2. Remove `fetchHostSessions` from the host API import list.

3. Replace `hostNotificationSessionsQuery` with:

```ts
const HOST_NOTIFICATION_SESSION_SELECTOR_LIMIT = 50;

export function hostNotificationSessionsQuery(context?: ReadmatesApiContext) {
  return hostSessionListQuery({ limit: HOST_NOTIFICATION_SESSION_SELECTOR_LIMIT }, context);
}
```

4. Remove `hostSessions` from `hostNotificationKeys` if no other code references it. If TypeScript or tests still reference it, keep the key but ensure no production query uses it.

- [ ] **Step 4: Update notification loader seeding**

In `front/features/host/route/host-notifications-data.ts`, keep the import `hostNotificationSessionsQuery` and change the direct host sessions fetch to Query cache usage:

```ts
const hostSessions = await client.fetchQuery(hostNotificationSessionsQuery(context));
```

Then remove `fetchHostSessions` from the loader's direct `Promise.all` if needed. The loader sequence should still fetch sessions before selecting the initial manual session id.

Use this structure:

```ts
const [summary, events, deliveries, audit, hostSessions, manualDispatches] = await Promise.all([
  fetchHostNotificationSummary(context),
  fetchHostNotificationEvents(context, ledgerPage),
  fetchHostNotificationDeliveries(context, ledgerPage),
  fetchHostNotificationTestMailAudit(context, ledgerPage),
  client.fetchQuery(hostNotificationSessionsQuery(context)),
  fetchManualNotificationDispatches(context, { page: dispatchPage }),
]);
```

Remove the later `client.setQueryData(hostNotificationSessionsQuery(context).queryKey, hostSessions)` call because `fetchQuery` already seeds the shared key.

- [ ] **Step 5: Keep notification route unchanged unless imports require cleanup**

`front/features/host/route/host-notifications-route.tsx` can keep:

```ts
const sessionsQuery = useQuery(hostNotificationSessionsQuery(context));
```

This now reads from the shared session list key.

- [ ] **Step 6: Run notification tests**

Run:

```bash
pnpm --dir front test -- host-notification-queries.test.ts host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add front/features/host/queries/host-notification-queries.ts front/features/host/route/host-notifications-data.ts front/features/host/route/host-notifications-route.tsx front/features/host/queries/host-notification-queries.test.ts front/tests/unit/host-notifications.test.tsx
git commit -m "feat(front): share host session query with notifications"
```

If `front/features/host/route/host-notifications-route.tsx` has no diff, omit it from `git add`.

---

### Task 6: Documentation, Changelog, and Final Verification

**Files:**
- Modify: `docs/development/server-state-migration.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update server-state migration status**

Edit `docs/development/server-state-migration.md` so the relevant sections read:

```md
## 완료
- `host/invitations` — list query + create/revoke mutation + loader hand-off
- `host/members` — list query + lifecycle/profile/viewer mutation refresh + loader hand-off
- `host/notifications` — summary, event/delivery/audit ledgers, manual options, preview/confirm, and manual dispatch ledger query ownership + loader hand-off
- `host/sessions` — dashboard current/session list, editor detail/manual dispatch reads, session mutations, loader seeding, and notification session-selector sharing

## 패턴
- query: `features/<feature>/queries/<area>-queries.ts` 에 `queryOptions` + `useXxxMutation` export
- query key: `[feature, area, op, params]` 형태 const tuple. Club-scoped host routes include `clubSlug` in the key scope.
- mutation: `onSuccess` 에서 affected list/detail/current/dashboard roots를 invalidate하고, 삭제처럼 canonical entity가 사라지는 경우 detail cache를 remove
- 컴포넌트는 actions props 인터페이스를 유지 — 테스트는 wrapper + mock actions 로 동일하게 작성

## 후속 후보 (우선순위)
1. `current-session` (member current session actions and route refresh event)
2. `platform-admin` (summary/clubs/support grants/domain checks/onboarding)
3. `archive`, `feedback`, `public` — 읽기 중심, loader 와 결합도 높음
```

- [ ] **Step 2: Add CHANGELOG entry**

In `CHANGELOG.md` under `## Unreleased` and `### Engineering Proof Portfolio`, add:

```md
- Migrate `host/sessions` server state to TanStack Query: dashboard current/session list, editor detail/manual dispatch reads, create/update/delete/open/close/publish/publication/attendance/import-commit mutation invalidation, and shared session selector cache for host notifications.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --dir front test -- host-session-queries host-notification-queries.test.ts host-dashboard.test.tsx host-session-editor.test.tsx host-notifications.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 5: Run full frontend test suite**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 6: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 7: Run docs whitespace check**

Run:

```bash
git diff --check -- CHANGELOG.md docs/development/server-state-migration.md
```

Expected: no output and exit code 0.

- [ ] **Step 8: Commit Task 6**

```bash
git add CHANGELOG.md docs/development/server-state-migration.md
git commit -m "docs: record host sessions query migration"
```

---

## Self-Review Notes

- Spec coverage: Tasks 1 and 2 implement the shared query/mutation module. Tasks 3 and 4 migrate dashboard and editor loader/route ownership. Task 5 shares the session list with notifications. Task 6 updates status docs and changelog. Error/loading behavior is preserved by route fallbacks to loader data and existing UI action error handling.
- Import-cycle guard: `host-session-queries.ts` does not import `host-notification-queries.ts`. `commitSessionImport` notification invalidation is composed in `host-session-editor-route.tsx`, where importing both modules is safe.
- Local-state guard: the plan does not move editor draft, AI, import preview, or confirmation state into Query.
- Validation scope: focused query/route tests run first; full frontend test and build run before final completion.
