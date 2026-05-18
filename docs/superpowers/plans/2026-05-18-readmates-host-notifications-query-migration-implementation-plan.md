# ReadMates Host Notifications Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the host notifications route's server state from route-local copies and `useRevalidator` refreshes to TanStack Query cache ownership.

**Architecture:** Add a feature-owned query module under `front/features/host/queries`, convert the notifications loader to a `QueryClient` seeding factory, and keep `HostNotificationsRoute` as the orchestration layer that reads Query state and passes props/callbacks to UI. UI components remain prop-driven and keep only user input state such as selected template, selected members, resend confirmation, and preview visibility.

**Tech Stack:** React 19, React Router 7, TanStack Query v5, Vite, TypeScript, Vitest, Testing Library.

---

## Scope And Existing Context

This plan implements the approved design in `docs/superpowers/specs/2026-05-18-readmates-host-notifications-query-migration-design.md`.

Existing files to read before starting:

- `docs/agents/front.md`
- `docs/development/server-state-migration.md`
- `front/features/host/route/host-notifications-data.ts`
- `front/features/host/route/host-notifications-route.tsx`
- `front/features/host/ui/host-notifications-page.tsx`
- `front/features/host/ui/notifications/manual-notification-workbench.tsx`
- `front/features/host/queries/host-invitation-queries.ts`
- `front/features/host/queries/host-members-queries.ts`
- `front/tests/unit/host-notifications.test.tsx`

No backend files should change.

## File Structure

- Create `front/features/host/queries/host-notification-queries.ts`
  - Query keys, query options, mutation hooks, and invalidation helpers for host notifications.
- Create `front/features/host/queries/host-notification-queries.test.ts`
  - Pure tests for key normalization and invalidation key coverage.
- Modify `front/features/host/route/host-notifications-data.ts`
  - Replace `hostNotificationsLoader` with `hostNotificationsLoaderFactory(queryClient)`.
  - Seed Query cache and return only route-only initial manual selection.
  - Remove `hostNotificationsActions` after route no longer uses it.
- Modify `front/features/host/route/host-notifications-route.tsx`
  - Read server state through Query.
  - Track only opened cursor identifiers for paginated ledgers.
  - Use Query mutations and invalidation instead of `useRevalidator`.
- Modify `front/features/host/ui/host-notifications-page.tsx`
  - Remove local server-state copy for manual options.
  - Accept route-provided manual pending state.
  - Keep local preview, selection, dialog, and message state.
- Modify `front/features/host/ui/notifications/manual-notification-workbench.tsx`
  - Keep user input state unchanged.
  - Continue to receive options/preview/callbacks through props.
- Modify `front/src/app/routes/host.tsx`
  - Wire `hostNotificationsLoaderFactory(queryClient)`.
- Modify `front/features/host/index.ts`
  - Export `hostNotificationsLoaderFactory` instead of `hostNotificationsLoader` and stop exporting removed actions.
- Modify `front/tests/unit/host-notifications.test.tsx`
  - Update loader tests for query seeding.
  - Add route/query regression tests for preview persistence, resend confirmation, and dispatch ledger refresh.
- Modify `CHANGELOG.md`
  - Add Unreleased frontend architecture note after implementation passes.

## Constants

Use these page sizes everywhere in this migration:

```ts
const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;
```

## Task 1: Add Host Notification Query Module

**Files:**

- Create: `front/features/host/queries/host-notification-queries.test.ts`
- Create: `front/features/host/queries/host-notification-queries.ts`

- [ ] **Step 1: Write failing query key tests**

Create `front/features/host/queries/host-notification-queries.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  hostNotificationKeys,
  hostNotificationEventsQuery,
  hostNotificationManualOptionsQuery,
  invalidateHostNotificationOverview,
  invalidateManualNotificationState,
} from "./host-notification-queries";

describe("host notification query keys", () => {
  it("scopes keys by club slug when one is provided", () => {
    expect(hostNotificationKeys.summary({ clubSlug: "reading-sai" })).toEqual([
      "host",
      "notifications",
      "scope",
      "reading-sai",
      "summary",
    ]);
  });

  it("normalizes equivalent first page requests to the same key", () => {
    expect(hostNotificationEventsQuery(undefined, { clubSlug: "reading-sai" }).queryKey).toEqual(
      hostNotificationEventsQuery({}, { clubSlug: "reading-sai" }).queryKey,
    );
  });

  it("normalizes blank manual member search to the same key as no search", () => {
    expect(hostNotificationManualOptionsQuery(
      { sessionId: "session-1", search: "   ", page: { limit: 50 } },
      { clubSlug: "reading-sai" },
    ).queryKey).toEqual(
      hostNotificationManualOptionsQuery(
        { sessionId: "session-1", page: { limit: 50 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
    );
  });

  it("invalidates overview and manual roots separately", async () => {
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateHostNotificationOverview(client as never, { clubSlug: "reading-sai" });
    await invalidateManualNotificationState(client as never, { clubSlug: "reading-sai" });

    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.overview({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.manual({ clubSlug: "reading-sai" }),
    });
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm --dir front test -- host-notification-queries
```

Expected: FAIL because `front/features/host/queries/host-notification-queries.ts` does not exist.

- [ ] **Step 3: Add the query module**

Create `front/features/host/queries/host-notification-queries.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  confirmManualNotification,
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchHostSessions,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  previewManualNotification,
  processHostNotifications,
  restoreHostNotification,
  retryHostNotification,
  sendHostNotificationTestMail,
} from "@/features/host/api/host-api";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  HostNotificationEventType,
  HostNotificationSummary,
  HostSessionListPage,
  ManualNotificationConfirmRequest,
  ManualNotificationConfirmResponse,
  ManualNotificationDispatchListResponse,
  ManualNotificationOptionsResponse,
  ManualNotificationPreviewRequest,
  ManualNotificationPreviewResponse,
  NotificationTestMailAuditPage,
  SendNotificationTestMailRequest,
} from "@/features/host/api/host-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";

type NormalizedPageRequest = {
  limit: number | null;
  cursor: string | null;
};

export type ManualOptionsQueryRequest = {
  sessionId?: string | null;
  search?: string | null;
  page?: PageRequest;
};

export type ManualDispatchesQueryRequest = {
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

function normalizeSearch(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeManualOptionsRequest(request?: ManualOptionsQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    search: normalizeSearch(request?.search),
    page: normalizePage(request?.page),
  };
}

function normalizeManualDispatchesRequest(request?: ManualDispatchesQueryRequest) {
  return {
    sessionId: request?.sessionId ?? null,
    eventType: request?.eventType ?? null,
    page: normalizePage(request?.page),
  };
}

export const hostNotificationKeys = {
  all: ["host", "notifications"] as const,
  scope: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.all, "scope", scopeKey(context)] as const,
  overview: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "overview"] as const,
  manual: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "manual"] as const,
  summary: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "summary"] as const,
  eventsRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "events"] as const,
  events: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.eventsRoot(context), normalizePage(page)] as const,
  deliveriesRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "deliveries"] as const,
  deliveries: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.deliveriesRoot(context), normalizePage(page)] as const,
  auditRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.overview(context), "audit"] as const,
  audit: (page?: PageRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.auditRoot(context), normalizePage(page)] as const,
  hostSessions: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.scope(context), "hostSessions"] as const,
  manualOptionsRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manual(context), "options"] as const,
  manualOptions: (request?: ManualOptionsQueryRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manualOptionsRoot(context), normalizeManualOptionsRequest(request)] as const,
  manualDispatchesRoot: (context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manual(context), "dispatches"] as const,
  manualDispatches: (request?: ManualDispatchesQueryRequest, context?: ReadmatesApiContext) =>
    [...hostNotificationKeys.manualDispatchesRoot(context), normalizeManualDispatchesRequest(request)] as const,
} as const;

export function hostNotificationSummaryQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.summary(context),
    queryFn: () => fetchHostNotificationSummary(context),
  });
}

export function hostNotificationEventsQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.events(page, context),
    queryFn: () => fetchHostNotificationEvents(context, pageFromNormalized(normalizePage(page))),
  });
}

export function hostNotificationDeliveriesQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.deliveries(page, context),
    queryFn: () => fetchHostNotificationDeliveries(context, pageFromNormalized(normalizePage(page))),
  });
}

export function hostNotificationAuditQuery(page?: PageRequest, context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.audit(page, context),
    queryFn: () => fetchHostNotificationTestMailAudit(context, pageFromNormalized(normalizePage(page))),
  });
}

export function hostNotificationSessionsQuery(context?: ReadmatesApiContext) {
  return queryOptions({
    queryKey: hostNotificationKeys.hostSessions(context),
    queryFn: () => fetchHostSessions(context),
  });
}

export function hostNotificationManualOptionsQuery(
  request?: ManualOptionsQueryRequest,
  context?: ReadmatesApiContext,
) {
  const normalized = normalizeManualOptionsRequest(request);
  return queryOptions({
    queryKey: hostNotificationKeys.manualOptions(request, context),
    queryFn: () => fetchManualNotificationOptions(context, {
      sessionId: optional(normalized.sessionId),
      search: optional(normalized.search),
      page: pageFromNormalized(normalized.page),
    }),
  });
}

export function hostNotificationManualDispatchesQuery(
  request?: ManualDispatchesQueryRequest,
  context?: ReadmatesApiContext,
) {
  const normalized = normalizeManualDispatchesRequest(request);
  return queryOptions({
    queryKey: hostNotificationKeys.manualDispatches(request, context),
    queryFn: () => fetchManualNotificationDispatches(context, {
      sessionId: optional(normalized.sessionId),
      eventType: normalized.eventType ?? undefined,
      page: pageFromNormalized(normalized.page),
    }),
  });
}

export function invalidateHostNotificationOverview(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.overview(context) });
}

export function invalidateManualNotificationState(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.manual(context) });
}

export function invalidateHostNotifications(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: hostNotificationKeys.scope(context) });
}

async function processHostNotificationsOrThrow(): Promise<void> {
  const response = await processHostNotifications();
  if (!response.ok) {
    throw new Error("Notification process failed");
  }
}

export function useProcessHostNotificationsMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: processHostNotificationsOrThrow,
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function useRetryHostNotificationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryHostNotification(id),
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function useRestoreHostNotificationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreHostNotification(id),
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function useSendHostNotificationTestMailMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: SendNotificationTestMailRequest) => sendHostNotificationTestMail(request),
    onSuccess: () => invalidateHostNotificationOverview(client, context),
  });
}

export function usePreviewManualNotificationMutation() {
  return useMutation<ManualNotificationPreviewResponse, Error, ManualNotificationPreviewRequest>({
    mutationFn: (request) => previewManualNotification(request),
  });
}

export function useConfirmManualNotificationMutation(context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation<ManualNotificationConfirmResponse, Error, ManualNotificationConfirmRequest>({
    mutationFn: (request) => confirmManualNotification(request),
    onSuccess: async () => {
      await Promise.all([
        invalidateHostNotificationOverview(client, context),
        invalidateManualNotificationState(client, context),
      ]);
    },
  });
}

export type HostNotificationQueryData = {
  summary: HostNotificationSummary;
  events: HostNotificationEventListResponse;
  deliveries: HostNotificationDeliveryListResponse;
  audit: NotificationTestMailAuditPage;
  hostSessions: HostSessionListPage;
  manualOptions: ManualNotificationOptionsResponse;
  manualDispatches: ManualNotificationDispatchListResponse;
};
```

- [ ] **Step 4: Run the new test**

Run:

```bash
pnpm --dir front test -- host-notification-queries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/host/queries/host-notification-queries.ts \
  front/features/host/queries/host-notification-queries.test.ts
git commit -m "feat(front): add host notification query keys"
```

## Task 2: Convert Notifications Loader To Query Seeding

**Files:**

- Modify: `front/features/host/route/host-notifications-data.ts`
- Modify: `front/src/app/routes/host.tsx`
- Modify: `front/features/host/index.ts`
- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Update loader tests to use a QueryClient**

In `front/tests/unit/host-notifications.test.tsx`, change the loader import and add QueryClient imports:

```ts
import { QueryClient } from "@tanstack/react-query";
import { hostNotificationsLoaderFactory } from "@/features/host/route/host-notifications-data";
import {
  hostNotificationEventsQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationSummaryQuery,
} from "@/features/host/queries/host-notification-queries";
```

Add this helper near `jsonResponse`:

```ts
function testQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}
```

Change existing calls from `hostNotificationsLoader(args)` to:

```ts
const client = testQueryClient();
const loader = hostNotificationsLoaderFactory(client);
await loader(args);
```

Extend the first loader test with cache assertions:

```ts
const context = { clubSlug: "reading-sai" };
expect(client.getQueryData(hostNotificationSummaryQuery(context).queryKey)).toEqual(summary);
expect(client.getQueryData(hostNotificationEventsQuery({ limit: 50 }, context).queryKey)).toEqual({
  items: [],
  nextCursor: null,
});
expect(client.getQueryData(hostNotificationManualOptionsQuery(
  { sessionId: "session-open", page: { limit: 50 } },
  context,
).queryKey)).toMatchObject({
  session: { sessionId: "session-open" },
});
```

- [ ] **Step 2: Run loader tests to verify they fail**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: FAIL because `hostNotificationsLoaderFactory` does not exist and the route still exports `hostNotificationsLoader`.

- [ ] **Step 3: Replace loader data implementation**

In `front/features/host/route/host-notifications-data.ts`, keep imports for API functions needed by the loader and add query imports. Replace the route data and loader with:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import {
  fetchHostNotificationDeliveries,
  fetchHostNotificationEvents,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchHostSessions,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
} from "@/features/host/api/host-api";
import type {
  HostNotificationEventType,
  HostSessionListPage,
} from "@/features/host/api/host-contracts";
import {
  hostNotificationAuditQuery,
  hostNotificationDeliveriesQuery,
  hostNotificationEventsQuery,
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationSessionsQuery,
  hostNotificationSummaryQuery,
} from "@/features/host/queries/host-notification-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;

export type HostNotificationsRouteData = {
  initialManualSelection: {
    sessionId: string | null;
    eventType: HostNotificationEventType | null;
  };
};

function selectInitialManualSessionId(requestedSessionId: string | null, hostSessions: HostSessionListPage) {
  if (requestedSessionId && hostSessions.items.some((session) => session.sessionId === requestedSessionId)) {
    return requestedSessionId;
  }

  return hostSessions.items.find((session) => session.state === "OPEN")?.sessionId
    ?? hostSessions.items[0]?.sessionId
    ?? null;
}

export function hostNotificationsLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostNotificationsRouteData> => {
    await requireHostLoaderAuth(args);

    const context = { clubSlug: clubSlugFromLoaderArgs(args) };
    const url = args?.request ? new URL(args.request.url) : null;
    const sessionId = url?.searchParams.get("sessionId") ?? null;
    const eventType = (url?.searchParams.get("eventType") as HostNotificationEventType | null) ?? null;
    const ledgerPage = { limit: HOST_NOTIFICATION_LEDGER_PAGE_LIMIT };
    const dispatchPage = { limit: MANUAL_DISPATCH_PAGE_LIMIT };

    const [summary, events, deliveries, audit, hostSessions, manualDispatches] = await Promise.all([
      fetchHostNotificationSummary(context),
      fetchHostNotificationEvents(context, ledgerPage),
      fetchHostNotificationDeliveries(context, ledgerPage),
      fetchHostNotificationTestMailAudit(context, ledgerPage),
      fetchHostSessions(context),
      fetchManualNotificationDispatches(context, { page: dispatchPage }),
    ]);

    const selectedSessionId = selectInitialManualSessionId(sessionId, hostSessions);
    const manualOptionsRequest = {
      sessionId: selectedSessionId ?? undefined,
      page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
    };
    const manualOptions = await fetchManualNotificationOptions(context, manualOptionsRequest);

    client.setQueryData(hostNotificationSummaryQuery(context).queryKey, summary);
    client.setQueryData(hostNotificationEventsQuery(ledgerPage, context).queryKey, events);
    client.setQueryData(hostNotificationDeliveriesQuery(ledgerPage, context).queryKey, deliveries);
    client.setQueryData(hostNotificationAuditQuery(ledgerPage, context).queryKey, audit);
    client.setQueryData(hostNotificationSessionsQuery(context).queryKey, hostSessions);
    client.setQueryData(hostNotificationManualDispatchesQuery({ page: dispatchPage }, context).queryKey, manualDispatches);
    client.setQueryData(hostNotificationManualOptionsQuery(manualOptionsRequest, context).queryKey, manualOptions);

    return {
      initialManualSelection: { sessionId: selectedSessionId, eventType },
    };
  };
}
```

- [ ] **Step 4: Wire app routes to the loader factory**

In `front/src/app/routes/host.tsx`, change the notifications lazy import:

```ts
const [{ HostNotificationsRouteElement }, { hostNotificationsLoaderFactory }] = await Promise.all([
  import("@/src/app/host-route-elements"),
  import("@/features/host/route/host-notifications-data"),
]);
return {
  Component: HostNotificationsRouteElement,
  loader: hostNotificationsLoaderFactory(queryClient),
};
```

- [ ] **Step 5: Update feature exports**

In `front/features/host/index.ts`, replace the notifications data export block with:

```ts
export {
  hostNotificationsLoaderFactory,
  type HostNotificationsRouteData,
} from "@/features/host/route/host-notifications-data";
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: PASS for loader tests after all imports are updated.

- [ ] **Step 7: Commit**

```bash
git add front/features/host/route/host-notifications-data.ts \
  front/src/app/routes/host.tsx \
  front/features/host/index.ts \
  front/tests/unit/host-notifications.test.tsx
git commit -m "feat(front): seed host notifications query cache"
```

## Task 3: Refactor Route To Read Query State

**Files:**

- Modify: `front/features/host/route/host-notifications-route.tsx`
- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add a route render regression test**

In `front/tests/unit/host-notifications.test.tsx`, add imports:

```ts
import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HostNotificationsRoute } from "@/features/host/route/host-notifications-route";
import {
  hostNotificationAuditQuery,
  hostNotificationDeliveriesQuery,
  hostNotificationEventsQuery,
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationSessionsQuery,
  hostNotificationSummaryQuery,
} from "@/features/host/queries/host-notification-queries";
```

Add this helper:

```ts
function seedNotificationsRoute(client: QueryClient) {
  const context = { clubSlug: "reading-sai" };
  client.setQueryData(hostNotificationSummaryQuery(context).queryKey, summary);
  client.setQueryData(hostNotificationEventsQuery({ limit: 50 }, context).queryKey, {
    items: [pendingEvent],
    nextCursor: null,
  });
  client.setQueryData(hostNotificationDeliveriesQuery({ limit: 50 }, context).queryKey, {
    items: [deadDelivery],
    nextCursor: null,
  });
  client.setQueryData(hostNotificationAuditQuery({ limit: 50 }, context).queryKey, {
    items: audit,
    nextCursor: null,
  });
  client.setQueryData(hostNotificationSessionsQuery(context).queryKey, {
    items: [hostSessionCurrent, hostSessionDraft],
    nextCursor: null,
  });
  client.setQueryData(hostNotificationManualOptionsQuery(
    { sessionId: "session-1", page: { limit: 50 } },
    context,
  ).queryKey, manualOptionsFixture);
  client.setQueryData(hostNotificationManualDispatchesQuery(
    { page: { limit: 20 } },
    context,
  ).queryKey, {
    items: [manualDispatch],
    nextCursor: null,
  });
}

function renderNotificationsRoute(client = testQueryClient()) {
  seedNotificationsRoute(client);
  const router = createMemoryRouter([
    {
      path: "/clubs/:clubSlug/app/host/notifications",
      element: <HostNotificationsRoute />,
      loader: () => ({
        initialManualSelection: { sessionId: "session-1", eventType: null },
      }),
    },
  ], {
    initialEntries: ["/clubs/reading-sai/app/host/notifications"],
  });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return { client, router };
}
```

Add the regression test:

```ts
it("renders host notifications route from query seeded data", async () => {
  renderNotificationsRoute();

  expect(await screen.findByRole("heading", { name: "알림 발송 장부" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "새 알림 발송" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "최근 수동 발송" })).toBeInTheDocument();
  expect(screen.getAllByText("앱+이메일").length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run focused tests to verify route regression fails**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: FAIL because `HostNotificationsRoute` still expects full loader server data and uses `hostNotificationsActions`.

- [ ] **Step 3: Replace route state with Query state**

In `front/features/host/route/host-notifications-route.tsx`, replace the implementation with this structure:

```ts
import { useMemo, useState } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { HostNotificationsPage } from "@/features/host/ui/host-notifications-page";
import type {
  HostNotificationDeliveryListResponse,
  HostNotificationEventListResponse,
  ManualNotificationOptionsResponse,
  NotificationTestMailAuditPage,
} from "@/features/host/api/host-contracts";
import {
  hostNotificationAuditQuery,
  hostNotificationDeliveriesQuery,
  hostNotificationEventsQuery,
  hostNotificationManualDispatchesQuery,
  hostNotificationManualOptionsQuery,
  hostNotificationSessionsQuery,
  hostNotificationSummaryQuery,
  useConfirmManualNotificationMutation,
  usePreviewManualNotificationMutation,
  useProcessHostNotificationsMutation,
  useRestoreHostNotificationMutation,
  useRetryHostNotificationMutation,
  useSendHostNotificationTestMailMutation,
  type ManualOptionsQueryRequest,
} from "@/features/host/queries/host-notification-queries";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import type { HostNotificationsRouteData } from "./host-notifications-data";

const HOST_NOTIFICATION_LEDGER_PAGE_LIMIT = 50;
const MANUAL_DISPATCH_PAGE_LIMIT = 20;
const MANUAL_MEMBER_PAGE_LIMIT = 50;

type PagedResponse<T> = {
  items: T[];
  nextCursor: string | null;
};

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext | undefined {
  return clubSlug ? { clubSlug } : undefined;
}

function firstPage(limit: number): PageRequest {
  return { limit };
}

function pageRequests(limit: number, cursors: string[]): PageRequest[] {
  return [firstPage(limit), ...cursors.map((cursor) => ({ limit, cursor }))];
}

function appendCursor(cursors: string[], cursor: string | null | undefined): string[] {
  if (!cursor || cursors.includes(cursor)) {
    return cursors;
  }
  return [...cursors, cursor];
}

function combinePages<T>(pages: Array<PagedResponse<T> | undefined>): PagedResponse<T> {
  const lastPage = [...pages].reverse().find(Boolean);
  return {
    items: pages.flatMap((page) => page?.items ?? []),
    nextCursor: lastPage?.nextCursor ?? null,
  };
}

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

export function HostNotificationsRoute() {
  const data = useLoaderData() as HostNotificationsRouteData;
  const params = useParams();
  const context = useMemo(() => contextFromClubSlug(params.clubSlug), [params.clubSlug]);
  const queryClient = useQueryClient();
  const [eventCursors, setEventCursors] = useState<string[]>([]);
  const [deliveryCursors, setDeliveryCursors] = useState<string[]>([]);
  const [auditCursors, setAuditCursors] = useState<string[]>([]);
  const [manualDispatchCursors, setManualDispatchCursors] = useState<string[]>([]);
  const [manualMemberCursors, setManualMemberCursors] = useState<string[]>([]);
  const [manualOptionsRequest, setManualOptionsRequest] = useState<ManualOptionsQueryRequest>(() => ({
    sessionId: data.initialManualSelection.sessionId,
    page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
  }));

  const summaryQuery = useQuery(hostNotificationSummaryQuery(context));
  const sessionsQuery = useQuery(hostNotificationSessionsQuery(context));

  const eventPageRequests = pageRequests(HOST_NOTIFICATION_LEDGER_PAGE_LIMIT, eventCursors);
  const deliveryPageRequests = pageRequests(HOST_NOTIFICATION_LEDGER_PAGE_LIMIT, deliveryCursors);
  const auditPageRequests = pageRequests(HOST_NOTIFICATION_LEDGER_PAGE_LIMIT, auditCursors);
  const dispatchPageRequests = pageRequests(MANUAL_DISPATCH_PAGE_LIMIT, manualDispatchCursors);
  const manualOptionPageRequests = pageRequests(MANUAL_MEMBER_PAGE_LIMIT, manualMemberCursors);

  const eventQueries = useQueries({
    queries: eventPageRequests.map((page) => hostNotificationEventsQuery(page, context)),
  });
  const deliveryQueries = useQueries({
    queries: deliveryPageRequests.map((page) => hostNotificationDeliveriesQuery(page, context)),
  });
  const auditQueries = useQueries({
    queries: auditPageRequests.map((page) => hostNotificationAuditQuery(page, context)),
  });
  const manualDispatchQueries = useQueries({
    queries: dispatchPageRequests.map((page) => hostNotificationManualDispatchesQuery({ page }, context)),
  });
  const manualOptionsQueries = useQueries({
    queries: manualOptionPageRequests.map((page) =>
      hostNotificationManualOptionsQuery({ ...manualOptionsRequest, page }, context),
    ),
  });

  const events = combinePages<HostNotificationEventListResponse["items"][number]>(eventQueries.map((query) => query.data));
  const deliveries = combinePages<HostNotificationDeliveryListResponse["items"][number]>(deliveryQueries.map((query) => query.data));
  const audit = combinePages<NotificationTestMailAuditPage["items"][number]>(auditQueries.map((query) => query.data));
  const manualDispatches = combinePages(manualDispatchQueries.map((query) => query.data));
  const manualOptions = combineManualOptions(manualOptionsQueries.map((query) => query.data));

  const resetLedgerPages = () => {
    setEventCursors([]);
    setDeliveryCursors([]);
    setAuditCursors([]);
    setManualDispatchCursors([]);
  };

  const processMutation = useProcessHostNotificationsMutation(context);
  const retryMutation = useRetryHostNotificationMutation(context);
  const restoreMutation = useRestoreHostNotificationMutation(context);
  const testMailMutation = useSendHostNotificationTestMailMutation(context);
  const previewManualMutation = usePreviewManualNotificationMutation();
  const confirmManualMutation = useConfirmManualNotificationMutation(context);
  const isAnyQueryFetching =
    summaryQuery.isFetching ||
    sessionsQuery.isFetching ||
    eventQueries.some((query) => query.isFetching) ||
    deliveryQueries.some((query) => query.isFetching) ||
    auditQueries.some((query) => query.isFetching) ||
    manualDispatchQueries.some((query) => query.isFetching) ||
    manualOptionsQueries.some((query) => query.isFetching);
  const manualPending = previewManualMutation.isPending || confirmManualMutation.isPending;

  const loadManualOptions = async (sessionId?: string, search?: string) => {
    const request = {
      sessionId: sessionId ?? null,
      search: search ?? null,
      page: { limit: MANUAL_MEMBER_PAGE_LIMIT },
    };
    const options = await queryClient.fetchQuery(hostNotificationManualOptionsQuery(request, context));
    setManualOptionsRequest(request);
    setManualMemberCursors([]);
    return options;
  };

  const loadMoreManualMembers = async (sessionId?: string, search?: string, cursor?: string) => {
    if (!cursor) {
      return manualOptions;
    }
    const request = {
      sessionId: sessionId ?? null,
      search: search ?? null,
      page: { limit: MANUAL_MEMBER_PAGE_LIMIT, cursor },
    };
    await queryClient.fetchQuery(hostNotificationManualOptionsQuery(request, context));
    setManualOptionsRequest((current) => ({
      ...current,
      sessionId: sessionId ?? current.sessionId ?? null,
      search: search ?? current.search ?? null,
    }));
    setManualMemberCursors((current) => appendCursor(current, cursor));
    return combineManualOptions([
      ...manualOptionsQueries.map((query) => query.data),
      queryClient.getQueryData(hostNotificationManualOptionsQuery(request, context).queryKey),
    ]);
  };

  return (
    <HostNotificationsPage
      summary={summaryQuery.data ?? { pending: 0, failed: 0, dead: 0, sentLast24h: 0, latestFailures: [] }}
      events={events.items}
      deliveries={deliveries.items}
      audit={audit.items}
      hostSessions={sessionsQuery.data?.items ?? []}
      manualOptions={manualOptions}
      manualDispatches={manualDispatches.items}
      initialManualSelection={data.initialManualSelection}
      hasMoreEvents={Boolean(events.nextCursor)}
      hasMoreDeliveries={Boolean(deliveries.nextCursor)}
      hasMoreAudit={Boolean(audit.nextCursor)}
      hasMoreManualDispatches={Boolean(manualDispatches.nextCursor)}
      isLoadingMoreEvents={eventQueries.some((query) => query.isFetching)}
      isLoadingMoreDeliveries={deliveryQueries.some((query) => query.isFetching)}
      isLoadingMoreAudit={auditQueries.some((query) => query.isFetching)}
      isLoadingMoreManualDispatches={manualDispatchQueries.some((query) => query.isFetching)}
      isRefreshing={isAnyQueryFetching}
      manualPending={manualPending}
      onLoadMoreEvents={async () => setEventCursors((current) => appendCursor(current, events.nextCursor))}
      onLoadMoreDeliveries={async () => setDeliveryCursors((current) => appendCursor(current, deliveries.nextCursor))}
      onLoadMoreAudit={async () => setAuditCursors((current) => appendCursor(current, audit.nextCursor))}
      onLoadMoreManualDispatches={async () => setManualDispatchCursors((current) => appendCursor(current, manualDispatches.nextCursor))}
      onProcess={async () => {
        await processMutation.mutateAsync();
        resetLedgerPages();
      }}
      onRetry={async (id) => {
        await retryMutation.mutateAsync(id);
        resetLedgerPages();
      }}
      onRestore={async (id) => {
        await restoreMutation.mutateAsync(id);
        resetLedgerPages();
      }}
      onSendTestMail={async (request) => {
        await testMailMutation.mutateAsync(request);
        resetLedgerPages();
      }}
      onPreviewManual={(request) => previewManualMutation.mutateAsync(request)}
      onConfirmManual={async (request) => {
        await confirmManualMutation.mutateAsync(request);
        resetLedgerPages();
      }}
      onLoadManualOptions={loadManualOptions}
      onLoadMoreManualMembers={loadMoreManualMembers}
    />
  );
}
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: Some `HostNotificationsPage` tests may fail because the page still copies manual options into local state. Fix that in Task 4.

- [ ] **Step 5: Commit the route refactor after Task 4 passes**

Do not commit yet if tests fail. Continue to Task 4, then commit both route and page changes together.

## Task 4: Remove UI-Owned Manual Options Server State

**Files:**

- Modify: `front/features/host/ui/host-notifications-page.tsx`
- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Update page tests for callback-driven options**

In `front/tests/unit/host-notifications.test.tsx`, change the direct page test `"reloads manual options when the host changes the selected session"` so it only verifies the callback call:

```ts
it("asks the route to reload manual options when the host changes the selected session", async () => {
  const user = userEvent.setup();
  const onLoadManualOptions = vi.fn().mockResolvedValue(manualOptionsFixture);

  renderPage({ onLoadManualOptions });

  await user.selectOptions(screen.getByLabelText("세션 선택"), "session-draft");

  expect(onLoadManualOptions).toHaveBeenCalledWith("session-draft", undefined);
});
```

Keep the existing route-level test from Task 3 as the regression that proves query state can render the page.

- [ ] **Step 2: Run focused tests to verify the old page behavior expectation is gone**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: FAIL until `HostNotificationsPage` accepts `manualPending` and stops copying `manualOptions`.

- [ ] **Step 3: Update page props and remove manual options copy**

In `front/features/host/ui/host-notifications-page.tsx`, update props:

```ts
  manualPending?: boolean;
```

Destructure it:

```ts
  manualPending = false,
```

Remove the `manualOptionsState` state block and the `if (manualOptionsState.source !== manualOptions)` block.

Replace:

```ts
const visibleManualOptions = manualOptionsState.source === manualOptions ? manualOptionsState.value : manualOptions;
const visibleManualDispatches = manualDispatches ?? visibleManualOptions.recentDispatches;
```

with:

```ts
const visibleManualOptions = manualOptions;
const visibleManualDispatches = manualDispatches ?? manualOptions.recentDispatches;
```

Replace:

```ts
const [manualBusy, setManualBusy] = useState(false);
```

with:

```ts
const manualBusy = manualPending;
```

In `handleManualPreview`, remove `setManualBusy(true)` and `setManualBusy(false)` but keep `setManualError(null)` and `setManualPreview(null)`:

```ts
const handleManualPreview = async (request: ManualNotificationPreviewRequest) => {
  if (isBusy) {
    return;
  }

  setManualError(null);
  setManualPreview(null);
  try {
    const preview = await onPreviewManual(request);
    setManualPreview(preview);
  } catch {
    setManualError("미리보기를 만들지 못했습니다. 세션과 대상 조건을 확인해 주세요.");
  }
};
```

In `handleManualConfirm`, remove `setManualBusy(true)` and `setManualBusy(false)`:

```ts
const handleManualConfirm = async (request: ManualNotificationConfirmRequest) => {
  if (isBusy) {
    return;
  }

  setManualError(null);
  try {
    await onConfirmManual(request);
    setManualPreview(null);
    setMessage({ kind: "status", text: "수동 알림 발송을 요청했습니다." });
  } catch {
    setManualError("발송을 요청하지 못했습니다. 미리보기 만료 또는 중복 발송 여부를 확인해 주세요.");
  }
};
```

In `handleManualSessionChange`, `handleLoadManualOptions`, and `handleLoadMoreManualMembers`, stop writing returned server state into page state. Keep error handling:

```ts
const handleManualSessionChange = async (sessionId: string) => {
  if (!onLoadManualOptions) return visibleManualOptions;
  setManualError(null);
  setManualPreview(null);
  try {
    return await onLoadManualOptions(sessionId, undefined);
  } catch (error) {
    setManualError("세션 정보를 불러오지 못했습니다.");
    throw error;
  }
};

const handleLoadManualOptions = async (sessionId?: string, search?: string) => {
  if (!onLoadManualOptions) return visibleManualOptions;
  return onLoadManualOptions(sessionId, search);
};

const handleLoadMoreManualMembers = async (sessionId?: string, search?: string, cursor?: string) => {
  if (!onLoadMoreManualMembers || !cursor) return visibleManualOptions;
  return onLoadMoreManualMembers(sessionId, search, cursor);
};
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: PASS for page and route tests.

- [ ] **Step 5: Commit route and page migration**

```bash
git add front/features/host/route/host-notifications-route.tsx \
  front/features/host/ui/host-notifications-page.tsx \
  front/tests/unit/host-notifications.test.tsx
git commit -m "feat(front): move host notification route state to query"
```

## Task 5: Add Manual Flow Regression Tests

**Files:**

- Modify: `front/tests/unit/host-notifications.test.tsx`

- [ ] **Step 1: Add preview persistence test**

Append this test to the `HostNotificationsPage` describe block:

```ts
it("keeps manual preview visible while parent query props refresh", async () => {
  const user = userEvent.setup();
  const preview: ManualNotificationPreviewResponse = {
    previewId: "preview-keep",
    expiresAt: "2026-05-13T09:10:00Z",
    template: {
      eventType: "SESSION_REMINDER_DUE",
      label: "모임 전날 리마인더",
      subject: "모임 전날 리마인더",
      bodyPreview: "모임 전 준비를 확인해 주세요.",
    },
    audience: {
      baseGroup: "ALL_ACTIVE_MEMBERS",
      baseCount: 3,
      excludedCount: 0,
      includedCount: 0,
      finalTargetCount: 3,
    },
    channels: {
      requested: "BOTH",
      inAppEligibleCount: 3,
      emailEligibleCount: 2,
      emailSkippedByPreferenceCount: 1,
      emailMissingCount: 0,
    },
    duplicates: {
      requiresResendConfirmation: false,
      recentDispatches: [],
    },
    warnings: [],
  };
  const onPreviewManual = vi.fn<[ManualNotificationPreviewRequest], Promise<ManualNotificationPreviewResponse>>()
    .mockResolvedValue(preview);
  const { rerender } = render(
    <HostNotificationsPage
      summary={summary}
      events={[pendingEvent]}
      deliveries={[deadDelivery]}
      audit={[]}
      hostSessions={[hostSessionCurrent, hostSessionDraft]}
      manualOptions={manualOptionsFixture}
      manualDispatches={[]}
      initialManualSelection={{ sessionId: "session-1", eventType: null }}
      onProcess={vi.fn()}
      onRetry={vi.fn()}
      onRestore={vi.fn()}
      onSendTestMail={vi.fn()}
      onPreviewManual={onPreviewManual}
      onConfirmManual={vi.fn()}
      onLoadManualOptions={vi.fn().mockResolvedValue(manualOptionsFixture)}
      onLoadMoreManualMembers={vi.fn().mockResolvedValue(manualOptionsFixture)}
    />,
  );

  await user.click(screen.getByRole("button", { name: "미리보기" }));
  expect(await screen.findByRole("heading", { name: "발송 전 확인" })).toBeInTheDocument();

  rerender(
    <HostNotificationsPage
      summary={{ ...summary, sentLast24h: summary.sentLast24h + 1 }}
      events={[{ ...pendingEvent, attemptCount: 2 }]}
      deliveries={[deadDelivery]}
      audit={[]}
      hostSessions={[hostSessionCurrent, hostSessionDraft]}
      manualOptions={{ ...manualOptionsFixture }}
      manualDispatches={[manualDispatch]}
      initialManualSelection={{ sessionId: "session-1", eventType: null }}
      onProcess={vi.fn()}
      onRetry={vi.fn()}
      onRestore={vi.fn()}
      onSendTestMail={vi.fn()}
      onPreviewManual={onPreviewManual}
      onConfirmManual={vi.fn()}
      onLoadManualOptions={vi.fn().mockResolvedValue(manualOptionsFixture)}
      onLoadMoreManualMembers={vi.fn().mockResolvedValue(manualOptionsFixture)}
    />,
  );

  expect(screen.getByRole("heading", { name: "발송 전 확인" })).toBeInTheDocument();
  expect(screen.getByText("모임 전 준비를 확인해 주세요.")).toBeInTheDocument();
});
```

- [ ] **Step 2: Add dispatch ledger refresh route test**

Append this route-level test:

```ts
it("refreshes manual dispatch ledger after confirm mutation invalidates query state", async () => {
  const client = testQueryClient();
  seedNotificationsRoute(client);
  client.setQueryData(hostNotificationManualDispatchesQuery(
    { page: { limit: 20 } },
    { clubSlug: "reading-sai" },
  ).queryKey, {
    items: [],
    nextCursor: null,
  });
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === "/api/bff/api/host/notifications/manual?clubSlug=reading-sai" && init?.method === "POST") {
      return Promise.resolve(jsonResponse({
        manualDispatchId: "dispatch-2",
        eventId: "event-manual-2",
        status: "PUBLISHED",
        createdAt: "2026-05-18T00:00:00Z",
        selection: {
          sessionId: "session-1",
          eventType: "SESSION_REMINDER_DUE",
          audience: "ALL_ACTIVE_MEMBERS",
          requestedChannels: "BOTH",
          targetCount: 3,
        },
      }));
    }
    if (url === "/api/bff/api/host/notifications/summary?clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse(summary));
    }
    if (url === "/api/bff/api/host/notifications/events?limit=50&clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ items: [pendingEvent], nextCursor: null }));
    }
    if (url === "/api/bff/api/host/notifications/deliveries?limit=50&clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ items: [deadDelivery], nextCursor: null }));
    }
    if (url === "/api/bff/api/host/notifications/manual/options?sessionId=session-1&limit=50&clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse(manualOptionsFixture));
    }
    if (url === "/api/bff/api/host/notifications/manual/dispatches?limit=20&clubSlug=reading-sai") {
      return Promise.resolve(jsonResponse({ items: [manualDispatch], nextCursor: null }));
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  }));

  renderNotificationsRoute(client);
  expect(await screen.findByRole("heading", { name: "새 알림 발송" })).toBeInTheDocument();

  await client.invalidateQueries({
    queryKey: hostNotificationManualDispatchesQuery(
      { page: { limit: 20 } },
      { clubSlug: "reading-sai" },
    ).queryKey,
  });

  expect(await screen.findByText("Example Book")).toBeInTheDocument();
});
```

If the explicit fetch URLs differ because `readmatesApiPath` orders `clubSlug` differently, adjust only the string order to match the actual helper output observed in the failure. Keep the endpoint and assertions identical.

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add front/tests/unit/host-notifications.test.tsx
git commit -m "test(front): cover host notification query migration"
```

## Task 6: Update Migration Tracking Docs

**Files:**

- Modify: `docs/development/server-state-migration.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update migration tracking**

In `docs/development/server-state-migration.md`, move `host/notifications` from follow-up to completed:

```md
## 완료
- `host/invitations` — list query + create/revoke mutation + loader hand-off
- `host/members` — list query + lifecycle/profile/viewer mutation refresh + loader hand-off
- `host/notifications` — summary, event/delivery/audit ledgers, manual options, preview/confirm, and manual dispatch ledger query ownership + loader hand-off
```

Update the follow-up list:

```md
## 후속 후보 (우선순위)
1. `host/sessions`
2. `current-session` (actions 4개)
3. `archive`, `feedback`, `public` — 읽기 중심, loader 와 결합도 높음
```

- [ ] **Step 2: Update CHANGELOG**

Under `CHANGELOG.md` `## Unreleased` `### Engineering Proof Portfolio`, add:

```md
- Migrate `host/notifications` server state to TanStack Query: loader seeding, query-owned event/delivery/audit/manual ledgers, mutation invalidation for process/retry/restore/test-mail/confirm, and local-only manual preview/selection state.
```

- [ ] **Step 3: Run docs whitespace check**

Run:

```bash
git diff --check -- docs/development/server-state-migration.md CHANGELOG.md
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/development/server-state-migration.md CHANGELOG.md
git commit -m "docs: record host notifications query migration"
```

## Task 7: Full Frontend Verification

**Files:**

- Verify only; no planned edits.

- [ ] **Step 1: Run focused notification tests**

Run:

```bash
pnpm --dir front test -- host-notifications
```

Expected: PASS.

- [ ] **Step 2: Run query module tests**

Run:

```bash
pnpm --dir front test -- host-notification-queries
```

Expected: PASS.

- [ ] **Step 3: Run frontend lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD~4..HEAD
```

Expected:

- Only host notification frontend files, migration tracking docs, and query tests changed by this implementation.
- No server files changed.
- Pre-existing unrelated files such as `scripts/README.md`, `scripts/build-public-release-candidate.sh`, or `scripts/pre-push-check.sh` are not staged or committed by this plan unless the user separately requested them.

## Rollback Plan

Each task commits independently. If a later task fails, revert the smallest commit:

```bash
git revert <commit-sha>
```

If the route migration commit must be reverted, also revert the docs commit because `docs/development/server-state-migration.md` and `CHANGELOG.md` should not claim `host/notifications` is completed.

## Self-Review Notes

Spec coverage:

- Query ownership for summary/events/deliveries/audit/hostSessions/manualOptions/manualDispatches: Tasks 1-4.
- Loader seeding factory: Task 2.
- Route orchestration and removal of `useRevalidator`: Task 3.
- UI remains prop/callback driven and user input state stays local: Task 4.
- Manual preview persistence and resend confirmation coverage: Task 5.
- Tracking docs and changelog: Task 6.
- Required checks: Task 7.

Type consistency:

- Query module names use `hostNotification*` singular prefix.
- Route loader export is `hostNotificationsLoaderFactory`.
- Route data type remains `HostNotificationsRouteData`.
- Manual request types are `ManualOptionsQueryRequest` and `ManualDispatchesQueryRequest`.

Placeholder scan:

- No placeholder or deferred-work instructions are intentionally present.
