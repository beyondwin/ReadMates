# ReadMates vNext AI Ops + Query Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining frontend Query foundation, remove the AI commit full reload, and add role-scoped AI operations surfaces for hosts and platform admins.

**Architecture:** Frontend server state moves into feature-owned TanStack Query modules while route modules keep loader seeding and UI prop assembly. Server AI Ops stays inside the `aigen` feature and follows `adapter.in.web -> application.port.in -> application.service -> application.port.out -> adapter.out.persistence/redis`. MySQL audit remains durable evidence; Redis metadata indexes provide TTL-bound live job recovery.

**Tech Stack:** React/Vite, React Router 7, TanStack Query v5, Cloudflare Pages Functions BFF, Kotlin/Spring Boot, MySQL/Flyway, Redis, Vitest, JUnit/ArchUnit.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-05-18-readmates-vnext-ai-ops-query-foundation-design.md`
- Architecture: `docs/development/architecture.md`
- Frontend server-state status: `docs/development/server-state-migration.md`
- Frontend guide: `docs/agents/front.md`
- Server guide: `docs/agents/server.md`
- Design guide: `docs/agents/design.md`
- Docs guide: `docs/agents/docs.md`

## Scope Check

This is a large but sequential vNext plan. The approved design intentionally binds Query foundation to AI Ops because the admin/host job surfaces should not add another route-local state island. The plan is split into eight independently committable tasks so each task leaves working, testable software.

## File Map

### Frontend Query Foundation

- Create: `front/features/archive/queries/archive-queries.ts`
- Create: `front/features/archive/queries/archive-queries.test.ts`
- Modify: `front/features/archive/route/archive-list-data.ts`
- Modify: `front/features/archive/route/archive-list-route.tsx`
- Modify: `front/features/archive/route/member-session-detail-data.ts`
- Modify: `front/features/archive/route/member-session-detail-route.tsx`
- Modify: `front/src/app/routes/member.tsx`

- Create: `front/features/feedback/queries/feedback-queries.ts`
- Create: `front/features/feedback/queries/feedback-queries.test.ts`
- Modify: `front/features/feedback/route/feedback-document-data.ts`
- Modify: `front/features/feedback/route/feedback-document-route.tsx`
- Modify: `front/src/app/routes/member.tsx`

- Create: `front/features/public/queries/public-queries.ts`
- Create: `front/features/public/queries/public-queries.test.ts`
- Modify: `front/features/public/route/public-route-data.ts`
- Modify: `front/features/public/route/public-club-route.tsx`
- Modify: `front/features/public/route/public-session-route.tsx`
- Modify: `front/src/app/routes/public.tsx`
- Modify: `front/src/app/router.tsx`

### Host AI Recovery

- Modify: `front/features/host/aigen/api/aigen-contracts.ts`
- Modify: `front/features/host/aigen/api/aigen-api.ts`
- Create: `front/features/host/aigen/queries/aigen-job-queries.ts`
- Create: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.ts`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Create: `front/features/host/aigen/ui/AiRecoveryStrip.tsx`
- Create: `front/features/host/aigen/ui/AiRecoveryStrip.test.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/queries/host-session-queries.ts`

### Platform Admin AI Ops Frontend

- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Create: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
- Create: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`

### Server AI Ops

- Add: `server/src/main/resources/db/mysql/migration/V34__ai_generation_ops_audit_and_indexes.sql`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepositoryTest.kt`
- Create: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

### Verification And Docs

- Modify: `docs/development/server-state-migration.md`
- Modify: `CHANGELOG.md`
- Add or modify E2E files under `front/tests/e2e/`

---

## Task 1: Archive Query Foundation

**Files:**
- Create: `front/features/archive/queries/archive-queries.ts`
- Create: `front/features/archive/queries/archive-queries.test.ts`
- Modify: `front/features/archive/route/archive-list-data.ts`
- Modify: `front/features/archive/route/archive-list-route.tsx`
- Modify: `front/features/archive/route/member-session-detail-data.ts`
- Modify: `front/features/archive/route/member-session-detail-route.tsx`
- Modify: `front/src/app/routes/member.tsx`

- [ ] **Step 1: Write failing tests for archive query keys and page merging**

Create `front/features/archive/queries/archive-queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  archiveKeys,
  archiveListQuery,
  combineArchiveListPages,
  memberArchiveSessionQuery,
} from "./archive-queries";

describe("archive query helpers", () => {
  it("scopes list keys by club and normalizes omitted page fields", () => {
    expect(archiveKeys.list({ clubSlug: "bookclub" }, undefined)).toEqual([
      "archive",
      "scope",
      "bookclub",
      "list",
      { limit: null, cursor: null },
    ]);
    expect(archiveListQuery({ clubSlug: "bookclub" }).queryKey).toEqual(
      archiveKeys.list({ clubSlug: "bookclub" }, undefined),
    );
  });

  it("scopes archive detail keys by session id and club", () => {
    expect(memberArchiveSessionQuery("session-1", { clubSlug: "bookclub" }).queryKey).toEqual([
      "archive",
      "scope",
      "bookclub",
      "detail",
      "session-1",
    ]);
  });

  it("combines cursor pages per archive surface", () => {
    const current = {
      sessions: { items: [{ sessionId: "s1" }], nextCursor: "s2" },
      questions: { items: [{ id: "q1" }], nextCursor: null },
      reviews: { items: [{ id: "r1" }], nextCursor: null },
      reports: { items: [{ sessionId: "f1" }], nextCursor: null },
    };
    const next = {
      sessions: { items: [{ sessionId: "s2" }], nextCursor: null },
      questions: { items: [], nextCursor: null },
      reviews: { items: [], nextCursor: null },
      reports: { items: [], nextCursor: null },
    };

    expect(combineArchiveListPages([current, next]).sessions.items.map((item) => item.sessionId)).toEqual([
      "s1",
      "s2",
    ]);
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run front/features/archive/queries/archive-queries.test.ts
```

Expected: FAIL because `front/features/archive/queries/archive-queries.ts` does not exist.

- [ ] **Step 3: Create archive query module**

Create `front/features/archive/queries/archive-queries.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import {
  fetchArchiveSessions,
  fetchMemberArchiveSession,
  fetchMyArchiveQuestions,
  fetchMyArchiveReviews,
  fetchMyFeedbackDocuments,
} from "@/features/archive/api/archive-api";
import type {
  ArchiveSessionPage,
  FeedbackDocumentListPage,
  MemberArchiveSessionDetailResponse,
  MyArchiveQuestionPage,
  MyArchiveReviewPage,
} from "@/features/archive/api/archive-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import type { PageRequest } from "@/shared/model/paging";
import {
  combineCursorPages,
  normalizePageRequest,
  pageFromNormalizedPageRequest,
} from "@/shared/query/cursor-pagination";

export const ARCHIVE_FIRST_PAGE_LIMIT = 30;
export const ARCHIVE_NEXT_PAGE_LIMIT = 30;

export type ArchiveListQueryData = {
  sessions: ArchiveSessionPage;
  questions: MyArchiveQuestionPage;
  reviews: MyArchiveReviewPage;
  reports: FeedbackDocumentListPage;
};

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

function emptyPage<T>() {
  return { items: [] as T[], nextCursor: null };
}

export function emptyArchiveListQueryData(): ArchiveListQueryData {
  return {
    sessions: emptyPage(),
    questions: emptyPage(),
    reviews: emptyPage(),
    reports: emptyPage(),
  };
}

export const archiveKeys = {
  all: ["archive"] as const,
  scope: (context?: ReadmatesApiContext) => [...archiveKeys.all, "scope", scopeKey(context)] as const,
  listRoot: (context?: ReadmatesApiContext) => [...archiveKeys.scope(context), "list"] as const,
  list: (context?: ReadmatesApiContext, page?: PageRequest) =>
    [...archiveKeys.listRoot(context), normalizePageRequest(page)] as const,
  detail: (sessionId: string, context?: ReadmatesApiContext) =>
    [...archiveKeys.scope(context), "detail", sessionId] as const,
} as const;

export async function fetchArchiveListQueryData(
  context?: ReadmatesApiContext,
  page: PageRequest = { limit: ARCHIVE_FIRST_PAGE_LIMIT },
): Promise<ArchiveListQueryData> {
  const [sessions, questions, reviews, reports] = await Promise.all([
    fetchArchiveSessions(context, page),
    fetchMyArchiveQuestions(context, page),
    fetchMyArchiveReviews(context, page),
    fetchMyFeedbackDocuments(context, page),
  ]);
  return { sessions, questions, reviews, reports };
}

export function archiveListQuery(context?: ReadmatesApiContext, page?: PageRequest) {
  const normalized = normalizePageRequest(page);
  return queryOptions<ArchiveListQueryData>({
    queryKey: archiveKeys.list(context, page),
    queryFn: () => fetchArchiveListQueryData(context, pageFromNormalizedPageRequest(normalized) ?? { limit: ARCHIVE_FIRST_PAGE_LIMIT }),
  });
}

export function memberArchiveSessionQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<MemberArchiveSessionDetailResponse | null>({
    queryKey: archiveKeys.detail(sessionId, context),
    queryFn: () => fetchMemberArchiveSession(sessionId, context),
  });
}

export function combineArchiveListPages(pages: ArchiveListQueryData[]): ArchiveListQueryData {
  return {
    sessions: combineCursorPages(pages.map((page) => page.sessions)),
    questions: combineCursorPages(pages.map((page) => page.questions)),
    reviews: combineCursorPages(pages.map((page) => page.reviews)),
    reports: combineCursorPages(pages.map((page) => page.reports)),
  };
}

export function invalidateArchiveQueries(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: archiveKeys.scope(context) });
}
```

- [ ] **Step 4: Run test and verify it passes**

Run:

```bash
pnpm --dir front exec vitest run front/features/archive/queries/archive-queries.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update archive loaders to seed Query cache**

Modify `front/features/archive/route/archive-list-data.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import {
  archiveListQuery,
  emptyArchiveListQueryData,
  type ArchiveListQueryData,
} from "@/features/archive/queries/archive-queries";

export type ArchiveListRouteData = ArchiveListQueryData;

function contextFromArgs(args?: LoaderFunctionArgs) {
  return { clubSlug: clubSlugFromLoaderArgs(args) };
}

export function archiveListLoaderFactory(queryClient: QueryClient) {
  return async function archiveListLoader(args?: LoaderFunctionArgs): Promise<ArchiveListRouteData> {
    const access = await loadArchiveMemberAuth(args);
    const context = contextFromArgs(args);
    if (!access.allowed) {
      return emptyArchiveListQueryData();
    }
    return queryClient.ensureQueryData(archiveListQuery(context));
  };
}
```

Modify `front/features/archive/route/member-session-detail-data.ts` to export a factory:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { memberArchiveSessionQuery } from "@/features/archive/queries/archive-queries";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type MemberSessionDetailRouteData = {
  sessionId: string | null;
};

export function memberSessionDetailLoaderFactory(queryClient: QueryClient) {
  return async function memberSessionDetailLoader(args: LoaderFunctionArgs): Promise<MemberSessionDetailRouteData> {
    const access = await loadMemberAppAuth(args);
    const sessionId = args.params.sessionId ?? null;
    if (!access.allowed || !sessionId) {
      return { sessionId };
    }
    await queryClient.ensureQueryData(memberArchiveSessionQuery(sessionId, { clubSlug: clubSlugFromLoaderArgs(args) }));
    return { sessionId };
  };
}
```

- [ ] **Step 6: Update archive routes to read Query cache**

Modify `front/features/archive/route/archive-list-route.tsx` so it uses `useQuery(archiveListQuery(...))` and `queryClient.fetchQuery(...)` for load-more:

```tsx
import { useCallback } from "react";
import { useLocation, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { archiveViewFromSearchParam, type ArchiveView } from "@/features/archive/model/archive-model";
import ArchivePage from "@/features/archive/ui/archive-page";
import {
  ARCHIVE_NEXT_PAGE_LIMIT,
  archiveListQuery,
  combineArchiveListPages,
} from "@/features/archive/queries/archive-queries";

export function ArchiveListRoute({ reviewAuthorName = null }: { reviewAuthorName?: string | null }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const { clubSlug } = useParams();
  const context = { clubSlug };
  const archiveQuery = useQuery(archiveListQuery(context));
  const pages = archiveQuery.data;
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = archiveViewFromSearchParam(searchParams.get("view"));

  const handleViewChange = useCallback(
    (view: ArchiveView) => setSearchParams({ view }, { replace: true }),
    [setSearchParams],
  );

  const loadNext = useCallback(
    async (surface: "sessions" | "questions" | "reviews" | "reports") => {
      if (!pages) return;
      const cursor = pages[surface].nextCursor;
      if (!cursor) return;
      const nextPage = await queryClient.fetchQuery(
        archiveListQuery(context, { limit: ARCHIVE_NEXT_PAGE_LIMIT, cursor }),
      );
      queryClient.setQueryData(archiveListQuery(context).queryKey, combineArchiveListPages([pages, nextPage]));
    },
    [context, pages, queryClient],
  );

  if (!pages) return null;

  return (
    <ArchivePage
      {...pages}
      initialView={initialView}
      onViewChange={handleViewChange}
      routePathname={location.pathname}
      routeSearch={location.search}
      reviewAuthorName={reviewAuthorName}
      onLoadMoreSessions={() => loadNext("sessions")}
      onLoadMoreQuestions={() => loadNext("questions")}
      onLoadMoreReviews={() => loadNext("reviews")}
      onLoadMoreReports={() => loadNext("reports")}
    />
  );
}
```

Modify `front/features/archive/route/member-session-detail-route.tsx` to use `useQuery(memberArchiveSessionQuery(sessionId, context))` and keep existing unavailable UI behavior unchanged.

- [ ] **Step 7: Wire member routes to loader factories**

Modify `front/src/app/routes/member.tsx`:

```tsx
const [{ default: ArchiveRoutePage }, { archiveListLoaderFactory }] = await Promise.all([
  import("@/src/pages/archive"),
  import("@/features/archive/route/archive-list-data"),
]);
return { Component: ArchiveRoutePage, loader: archiveListLoaderFactory(queryClient) };
```

For member session detail, replace `memberSessionDetailLoader` with `memberSessionDetailLoaderFactory(queryClient)`.

- [ ] **Step 8: Run archive route tests**

Run:

```bash
pnpm --dir front exec vitest run front/features/archive/queries/archive-queries.test.ts front/tests/unit/archive-list-route.test.tsx front/tests/unit/member-session-detail.test.tsx
```

Expected: PASS. If a named legacy test file does not exist, run `pnpm --dir front test -- --runInBand` and record the missing targeted file in the task notes.

- [ ] **Step 9: Commit archive Query foundation**

Run:

```bash
git add front/features/archive front/src/app/routes/member.tsx
git commit -m "refactor(front): move archive reads to query"
```

Expected: commit succeeds.

---

## Task 2: Feedback And Public Query Foundation

**Files:**
- Create: `front/features/feedback/queries/feedback-queries.ts`
- Create: `front/features/feedback/queries/feedback-queries.test.ts`
- Modify: `front/features/feedback/route/feedback-document-data.ts`
- Modify: `front/features/feedback/route/feedback-document-route.tsx`
- Create: `front/features/public/queries/public-queries.ts`
- Create: `front/features/public/queries/public-queries.test.ts`
- Modify: `front/features/public/route/public-route-data.ts`
- Modify: `front/features/public/route/public-club-route.tsx`
- Modify: `front/features/public/route/public-session-route.tsx`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/src/app/routes/public.tsx`
- Modify: `front/src/app/router.tsx`

- [ ] **Step 1: Write feedback query tests**

Create `front/features/feedback/queries/feedback-queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feedbackDocumentQuery, feedbackKeys } from "./feedback-queries";

describe("feedback query helpers", () => {
  it("scopes feedback document by session and club", () => {
    expect(feedbackDocumentQuery("session-1", { clubSlug: "bookclub" }).queryKey).toEqual([
      "feedback",
      "scope",
      "bookclub",
      "document",
      "session-1",
    ]);
  });

  it("has a root that can be invalidated after AI commit", () => {
    expect(feedbackKeys.scope({ clubSlug: "bookclub" })).toEqual(["feedback", "scope", "bookclub"]);
  });
});
```

- [ ] **Step 2: Write public query tests**

Create `front/features/public/queries/public-queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { publicClubQuery, publicKeys, publicSessionQuery } from "./public-queries";

describe("public query helpers", () => {
  it("scopes public club data by club slug", () => {
    expect(publicClubQuery("bookclub").queryKey).toEqual(["public", "club", "bookclub"]);
  });

  it("scopes public session data by club slug and session id", () => {
    expect(publicSessionQuery("bookclub", "session-1").queryKey).toEqual([
      "public",
      "club",
      "bookclub",
      "session",
      "session-1",
    ]);
  });

  it("exposes a club root for invalidation", () => {
    expect(publicKeys.club("bookclub")).toEqual(["public", "club", "bookclub"]);
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
pnpm --dir front exec vitest run front/features/feedback/queries/feedback-queries.test.ts front/features/public/queries/public-queries.test.ts
```

Expected: FAIL because the new query modules do not exist.

- [ ] **Step 4: Create feedback query module**

Create `front/features/feedback/queries/feedback-queries.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { fetchFeedbackDocument, type FeedbackLoadResult } from "@/features/feedback/api/feedback-api";
import type { ReadmatesApiContext } from "@/shared/api/client";

function scopeKey(context?: ReadmatesApiContext): string | null {
  return context?.clubSlug ?? null;
}

export const feedbackKeys = {
  all: ["feedback"] as const,
  scope: (context?: ReadmatesApiContext) => [...feedbackKeys.all, "scope", scopeKey(context)] as const,
  document: (sessionId: string, context?: ReadmatesApiContext) =>
    [...feedbackKeys.scope(context), "document", sessionId] as const,
} as const;

export function feedbackDocumentQuery(sessionId: string, context?: ReadmatesApiContext) {
  return queryOptions<FeedbackLoadResult>({
    queryKey: feedbackKeys.document(sessionId, context),
    queryFn: () => fetchFeedbackDocument(sessionId, context),
  });
}

export function invalidateFeedbackQueries(client: QueryClient, context?: ReadmatesApiContext) {
  return client.invalidateQueries({ queryKey: feedbackKeys.scope(context) });
}
```

- [ ] **Step 5: Create public query module**

Create `front/features/public/queries/public-queries.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { fetchPublicClub, fetchPublicSession } from "@/features/public/api/public-api";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";

const PUBLIC_STALE_TIME_MS = 60 * 1000;

export const publicKeys = {
  all: ["public"] as const,
  club: (clubSlug: string) => [...publicKeys.all, "club", clubSlug] as const,
  session: (clubSlug: string, sessionId: string) =>
    [...publicKeys.club(clubSlug), "session", sessionId] as const,
} as const;

export function publicClubQuery(clubSlug: string) {
  return queryOptions<PublicClubResponse>({
    queryKey: publicKeys.club(clubSlug),
    queryFn: () => fetchPublicClub(clubSlug),
    staleTime: PUBLIC_STALE_TIME_MS,
  });
}

export function publicSessionQuery(clubSlug: string, sessionId: string) {
  return queryOptions<PublicSessionDetailResponse | null>({
    queryKey: publicKeys.session(clubSlug, sessionId),
    queryFn: () => fetchPublicSession(clubSlug, sessionId),
    staleTime: PUBLIC_STALE_TIME_MS,
  });
}

export function invalidatePublicClubQueries(client: QueryClient, clubSlug: string | null | undefined) {
  if (!clubSlug) return Promise.resolve();
  return client.invalidateQueries({ queryKey: publicKeys.club(clubSlug) });
}
```

- [ ] **Step 6: Run tests and verify they pass**

Run:

```bash
pnpm --dir front exec vitest run front/features/feedback/queries/feedback-queries.test.ts front/features/public/queries/public-queries.test.ts
```

Expected: PASS.

- [ ] **Step 7: Update feedback route loader and route**

Modify `front/features/feedback/route/feedback-document-data.ts`:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { feedbackDocumentQuery } from "@/features/feedback/queries/feedback-queries";
import { clubSlugFromLoaderArgs, loadMemberAppAuth } from "@/shared/auth/member-app-loader";

export type FeedbackDocumentRouteData = {
  sessionId: string | null;
  status: "ready" | "unavailable";
};

export function feedbackDocumentLoaderFactory(queryClient: QueryClient) {
  return async function feedbackDocumentLoader(args: LoaderFunctionArgs): Promise<FeedbackDocumentRouteData> {
    const access = await loadMemberAppAuth(args);
    const sessionId = args.params.sessionId ?? null;
    if (!access.allowed || !sessionId) {
      return { sessionId, status: "unavailable" };
    }
    const result = await queryClient.ensureQueryData(
      feedbackDocumentQuery(sessionId, { clubSlug: clubSlugFromLoaderArgs(args) }),
    );
    return { sessionId, status: result.status };
  };
}
```

Modify `front/features/feedback/route/feedback-document-route.tsx` to read:

```tsx
const data = useLoaderData() as FeedbackDocumentRouteData;
const { clubSlug } = useParams();
const resultQuery = useQuery(
  data.sessionId
    ? feedbackDocumentQuery(data.sessionId, { clubSlug })
    : queryOptions({ queryKey: ["feedback", "missing-session"], queryFn: async () => ({ status: "unavailable", reason: "missing" as const }) }),
);
const result = resultQuery.data ?? { status: "unavailable", reason: "missing" as const };
```

Keep the existing `FeedbackDocumentPage` / `FeedbackDocumentUnavailablePage` render branch unchanged.

- [ ] **Step 8: Update public route loader factories**

Modify `front/features/public/route/public-route-data.ts` to export factories:

```ts
import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { publicClubQuery, publicSessionQuery } from "@/features/public/queries/public-queries";
import type { PublicClubResponse, PublicSessionDetailResponse } from "@/features/public/api/public-contracts";
import { BASELINE_PUBLIC_CLUB_SLUG } from "@/features/public/model/public-url-policy";

export type PublicClubRouteData = PublicClubResponse & {
  clubSlug: string;
  publicBasePath: string;
};
export type PublicSessionRouteData = {
  clubSlug: string;
  publicBasePath: string;
  sessionId: string | null;
  session: PublicSessionDetailResponse | null;
};

function publicRouteContext(params: LoaderFunctionArgs["params"]) {
  const clubSlug = params.clubSlug ?? BASELINE_PUBLIC_CLUB_SLUG;
  const publicBasePath = params.clubSlug ? `/clubs/${encodeURIComponent(clubSlug)}` : "";
  return { clubSlug, publicBasePath };
}

export function publicClubLoaderFactory(queryClient: QueryClient) {
  return async function publicClubLoader({ params }: LoaderFunctionArgs): Promise<PublicClubRouteData> {
    const context = publicRouteContext(params);
    const club = await queryClient.ensureQueryData(publicClubQuery(context.clubSlug));
    return { ...club, ...context };
  };
}

export function publicSessionLoaderFactory(queryClient: QueryClient) {
  return async function publicSessionLoader({ params }: LoaderFunctionArgs): Promise<PublicSessionRouteData> {
    const context = publicRouteContext(params);
    const sessionId = params.sessionId ?? null;
    if (!sessionId) return { ...context, sessionId, session: null };
    const session = await queryClient.ensureQueryData(publicSessionQuery(context.clubSlug, sessionId));
    return { ...context, sessionId, session };
  };
}
```

- [ ] **Step 9: Wire public and member routes to query-aware loaders**

Modify `front/src/app/routes/public.tsx` to accept `queryClient: QueryClient` and use `publicClubLoaderFactory(queryClient)` / `publicSessionLoaderFactory(queryClient)`. Modify `front/src/app/router.tsx`:

```ts
export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    publicRoutes(queryClient),
    ...authRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...hostRoutes(queryClient),
  ];
}
```

Modify `front/src/app/routes/member.tsx` feedback routes to use `feedbackDocumentLoaderFactory(queryClient)`.

- [ ] **Step 10: Run frontend focused tests**

Run:

```bash
pnpm --dir front exec vitest run front/features/feedback/queries/feedback-queries.test.ts front/features/public/queries/public-queries.test.ts front/tests/unit/spa-router.test.tsx
```

Expected: PASS.

- [ ] **Step 11: Commit feedback and public Query foundation**

Run:

```bash
git add front/features/feedback front/features/public front/src/app/routes/member.tsx front/src/app/routes/public.tsx front/src/app/router.tsx
git commit -m "refactor(front): move feedback and public reads to query"
```

Expected: commit succeeds.

---

## Task 3: Cross-Surface Invalidation And AI Full Reload Removal

**Files:**
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Test: existing `front/tests/unit/host-session-editor.test.tsx`
- Test: existing `front/features/host/aigen/ui/AiGenerateTab.test.tsx`

- [ ] **Step 1: Write a failing assertion that AI commit does not reload**

Add this test to `front/tests/unit/host-session-editor.test.tsx`:

```tsx
it("notifies parent after AI commit instead of reloading the window", async () => {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { ...window.location, reload },
    writable: true,
  });
  const onAigenCommitted = vi.fn();
  renderHostSessionEditor({ session: hostSessionDetailFixture(), onAigenCommitted });

  await screen.findByText("AI로 생성");
  await userEvent.click(screen.getByRole("button", { name: "AI로 생성" }));

  act(() => {
    lastAiGenerateTabProps.onCommitted();
  });

  expect(onAigenCommitted).toHaveBeenCalledWith(hostSessionDetailFixture().sessionId);
  expect(reload).not.toHaveBeenCalled();
});
```

Use the existing host-session-editor test helpers. If the file names the fixture differently, keep the same assertion shape: `onAigenCommitted` called, `window.location.reload` not called.

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
pnpm --dir front exec vitest run front/tests/unit/host-session-editor.test.tsx
```

Expected: FAIL because the editor still calls `window.location.reload()`.

- [ ] **Step 3: Add cross-surface invalidation helper**

Modify `front/features/host/queries/host-session-queries.ts`:

```ts
import { invalidateArchiveQueries } from "@/features/archive/queries/archive-queries";
import { invalidateFeedbackQueries } from "@/features/feedback/queries/feedback-queries";
import { invalidatePublicClubQueries } from "@/features/public/queries/public-queries";
```

Add:

```ts
export async function invalidateSessionRecordSurfaces(
  client: QueryClient,
  sessionId: string,
  context?: ReadmatesApiContext,
) {
  await Promise.all([
    invalidateHostSessionDetail(client, sessionId, context),
    invalidateHostSessionLists(client, context),
    invalidateHostSessionDashboard(client, context),
    invalidateHostCurrentSession(client, context),
    invalidateHostSessionManualDispatches(client, context),
    invalidateArchiveQueries(client, context),
    invalidateFeedbackQueries(client, context),
    invalidatePublicClubQueries(client, context?.clubSlug),
  ]);
}
```

Change `useCommitHostSessionImportMutation` to call `invalidateSessionRecordSurfaces`.

- [ ] **Step 4: Replace reload callback with parent callback**

Modify `front/features/host/ui/host-session-editor.tsx` props:

```ts
onAigenCommitted?: (sessionId: string) => void | Promise<void>;
```

Change the handler:

```ts
const handleAigenCommitted = useCallback(() => {
  if (sessionIdForAigen) {
    void onAigenCommitted?.(sessionIdForAigen);
  }
}, [onAigenCommitted, sessionIdForAigen]);
```

Remove the `window.location.reload()` block.

- [ ] **Step 5: Wire route invalidation into host editor**

Modify `front/features/host/route/host-session-editor-route.tsx`:

```ts
import { invalidateSessionRecordSurfaces } from "@/features/host/queries/host-session-queries";
```

Pass this prop in `EditHostSessionRoute`:

```tsx
onAigenCommitted={(committedSessionId) =>
  invalidateSessionRecordSurfaces(queryClient, committedSessionId, context)
}
```

For `NewHostSessionRoute`, omit the prop because AI tab is unavailable before a session exists.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --dir front exec vitest run front/tests/unit/host-session-editor.test.tsx front/features/host/aigen/ui/AiGenerateTab.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit full reload removal**

Run:

```bash
git add front/features/host front/features/archive/queries front/features/feedback/queries front/features/public/queries
git commit -m "refactor(front): refresh AI commit with query invalidation"
```

Expected: commit succeeds.

---

## Task 4: Server AI Live Job Indexes And Host Recent Job Endpoint

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationJobStore.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStore.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestrator.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationWebDtos.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOrchestratorTest.kt`

- [ ] **Step 1: Add failing Redis tests for recent and active indexes**

Add tests to `server/src/test/kotlin/com/readmates/aigen/adapter/out/redis/RedisAiGenerationJobStoreTest.kt`:

```kotlin
@Test
fun `save indexes job by session and active set`() {
    val job = sampleJob(status = JobStatus.PENDING)

    store.save(job)

    assertEquals(job.jobId, store.loadRecentForSession(job.sessionId)?.jobId)
    assertTrue(store.loadActiveJobs().any { it.jobId == job.jobId })
}

@Test
fun `terminal transition removes job from active set but keeps session recent lookup`() {
    val job = sampleJob(status = JobStatus.RUNNING)
    store.save(job)

    val transitioned = store.transitionStatus(
        jobId = job.jobId,
        expected = setOf(JobStatus.RUNNING),
        next = JobStatus.CANCELLED,
        stage = null,
        progressPct = 0,
        error = null,
    )

    assertTrue(transitioned)
    assertFalse(store.loadActiveJobs().any { it.jobId == job.jobId })
    assertEquals(JobStatus.CANCELLED, store.loadRecentForSession(job.sessionId)?.status)
}
```

- [ ] **Step 2: Run Redis store tests and verify failure**

Run:

```bash
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest'
```

Expected: FAIL because `loadRecentForSession` and `loadActiveJobs` do not exist.

- [ ] **Step 3: Extend job model and store port**

Modify `JobRecord` in `AiGenerationJobStore.kt`:

```kotlin
val createdAt: Instant = expiresAt.minusSeconds(21_600),
val lastUpdatedAt: Instant = createdAt,
```

Add to `AiGenerationJobStore`:

```kotlin
fun loadRecentForSession(sessionId: UUID): JobRecord?

fun loadActiveJobs(): List<JobRecord>
```

Use `createdAt` and `lastUpdatedAt` default values only to keep existing tests compiling; the orchestrator will set explicit values at job creation.

- [ ] **Step 4: Implement Redis metadata indexes**

In `RedisAiGenerationJobStore`, add key helpers:

```kotlin
private fun sessionJobsKey(sessionId: UUID) = "aigen:session:$sessionId:jobs"

private fun activeJobsKey() = "aigen:jobs:active"

private fun clubActiveJobsKey(clubId: UUID) = "aigen:club:$clubId:jobs:active"
```

In `save(job)`, after writing the hash:

```kotlin
indexJob(job)
```

Add:

```kotlin
private fun indexJob(job: JobRecord) {
    val ttl = properties.job.redisTtl
    val score = job.lastUpdatedAt.toEpochMilli().toDouble()
    redisTemplate.opsForZSet().add(sessionJobsKey(job.sessionId), job.jobId.toString(), score)
    redisTemplate.expire(sessionJobsKey(job.sessionId), ttl)
    if (job.status in ACTIVE_INDEX_STATUSES) {
        redisTemplate.opsForZSet().add(activeJobsKey(), job.jobId.toString(), score)
        redisTemplate.opsForZSet().add(clubActiveJobsKey(job.clubId), job.jobId.toString(), score)
        redisTemplate.expire(activeJobsKey(), ttl)
        redisTemplate.expire(clubActiveJobsKey(job.clubId), ttl)
    }
}

private fun removeFromActiveIndexes(record: JobRecord) {
    redisTemplate.opsForZSet().remove(activeJobsKey(), record.jobId.toString())
    redisTemplate.opsForZSet().remove(clubActiveJobsKey(record.clubId), record.jobId.toString())
}
```

Add companion:

```kotlin
val ACTIVE_INDEX_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED, JobStatus.COMMITTING)
```

In `transitionStatus`, after successful transition, load the updated record and call `indexJob(updated)` for active status or `removeFromActiveIndexes(updated)` for terminal status.

Implement:

```kotlin
override fun loadRecentForSession(sessionId: UUID): JobRecord? =
    runCatching {
        val ids = redisTemplate.opsForZSet().reverseRange(sessionJobsKey(sessionId), 0, 10).orEmpty()
        ids.asSequence()
            .mapNotNull { runCatching { UUID.fromString(it) }.getOrNull() }
            .mapNotNull { load(it) }
            .firstOrNull()
    }.onFailure { recordFailure("loadRecentForSession") }.getOrNull()

override fun loadActiveJobs(): List<JobRecord> =
    runCatching {
        redisTemplate.opsForZSet()
            .reverseRange(activeJobsKey(), 0, 200)
            .orEmpty()
            .mapNotNull { runCatching { UUID.fromString(it) }.getOrNull() }
            .mapNotNull { load(it) }
    }.onFailure { recordFailure("loadActiveJobs") }.getOrDefault(emptyList())
```

- [ ] **Step 5: Add host recent use case**

Modify `AiGenerationUseCases.kt`:

```kotlin
interface GetRecentSessionGenerationJobUseCase {
    fun recent(sessionId: UUID): JobView?
}
```

Make `AiGenerationOrchestrator` implement it:

```kotlin
override fun recent(sessionId: UUID): JobView? =
    jobStore.loadRecentForSession(sessionId)
        ?.takeIf { it.sessionId == sessionId }
        ?.takeIf { it.status in RECOVERABLE_HOST_STATUSES }
        ?.let { toJobView(it) }
```

Extract the existing `get` mapping into `private fun toJobView(record: JobRecord): JobView`.

Add companion:

```kotlin
private val RECOVERABLE_HOST_STATUSES =
    setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED, JobStatus.COMMITTING, JobStatus.FAILED)
```

- [ ] **Step 6: Add endpoint and DTO**

In `AiGenerationController`, inject `GetRecentSessionGenerationJobUseCase` and add:

```kotlin
@GetMapping("/jobs/recent")
fun recentJob(
    @PathVariable sessionId: UUID,
    member: CurrentMember,
): JobStatusResponse? {
    ensureEnabled()
    auth.requireHostAccess(sessionId, member)
    return recent.recent(sessionId)?.toResponse()
}
```

Extract `JobView.toResponse()` inside `AiGenerationController.kt` or `AiGenerationWebDtos.kt` so `getJobStatus` and `recentJob` share the same mapping.

- [ ] **Step 7: Run server tests**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationOrchestratorTest'
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.adapter.in.web.AiGenerationControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.adapter.out.redis.RedisAiGenerationJobStoreTest'
```

Expected: PASS.

- [ ] **Step 8: Commit server host recovery foundation**

Run:

```bash
git add server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen
git commit -m "feat(aigen): index live jobs for host recovery"
```

Expected: commit succeeds.

---

## Task 5: Host AI Recovery UI And Query Hooks

**Files:**
- Modify: `front/features/host/aigen/api/aigen-contracts.ts`
- Modify: `front/features/host/aigen/api/aigen-api.ts`
- Create: `front/features/host/aigen/queries/aigen-job-queries.ts`
- Create: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- Create: `front/features/host/aigen/ui/AiRecoveryStrip.tsx`
- Create: `front/features/host/aigen/ui/AiRecoveryStrip.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/ui/session-editor/session-record-completion-panel.tsx`

- [ ] **Step 1: Add contracts and API wrapper tests**

Append to `front/features/host/aigen/api/aigen-contracts.ts`:

```ts
export type AiGenerationAvailableAction =
  | "POLL"
  | "CANCEL"
  | "COMMIT_RETRY"
  | "START_NEW";

export type AiRecentJobResponse = AiGenerationJobResponse & {
  createdAt: string;
  lastUpdatedAt: string;
  expiresAt: string;
  availableActions: AiGenerationAvailableAction[];
};
```

Add a test to `front/features/host/aigen/api/aigen-api.test.ts`:

```ts
it("fetches the recent session AI job", async () => {
  server.use(
    http.get("/api/bff/api/host/sessions/session-1/ai-generate/jobs/recent", () =>
      HttpResponse.json(null),
    ),
  );

  await expect(getRecentJob("session-1")).resolves.toBeNull();
});
```

- [ ] **Step 2: Add recent job API wrapper**

Modify `front/features/host/aigen/api/aigen-api.ts`:

```ts
import type { AiRecentJobResponse } from "./aigen-contracts";

export function getRecentJob(sessionId: string): Promise<AiRecentJobResponse | null> {
  return readmatesFetch<AiRecentJobResponse | null>(sessionsPath(sessionId, "/jobs/recent"));
}
```

- [ ] **Step 3: Create query hooks**

Create `front/features/host/aigen/queries/aigen-job-queries.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  cancelGeneration,
  commitGeneration,
  getJob,
  getRecentJob,
  regenerateItem,
  startGeneration,
} from "@/features/host/aigen/api/aigen-api";
import type {
  CommitGenerationRequest,
  RegenerateRequest,
  StartGenerationRequest,
} from "@/features/host/aigen/api/aigen-contracts";
import type { ReadmatesApiContext } from "@/shared/api/client";
import { invalidateSessionRecordSurfaces } from "@/features/host/queries/host-session-queries";

export const aiJobKeys = {
  all: ["host", "aigen", "jobs"] as const,
  session: (sessionId: string) => [...aiJobKeys.all, "session", sessionId] as const,
  recent: (sessionId: string) => [...aiJobKeys.session(sessionId), "recent"] as const,
  detail: (sessionId: string, jobId: string) => [...aiJobKeys.session(sessionId), "detail", jobId] as const,
} as const;

export function recentAiJobQuery(sessionId: string) {
  return queryOptions({
    queryKey: aiJobKeys.recent(sessionId),
    queryFn: () => getRecentJob(sessionId),
  });
}

export function aiJobDetailQuery(sessionId: string, jobId: string) {
  return queryOptions({
    queryKey: aiJobKeys.detail(sessionId, jobId),
    queryFn: () => getJob(sessionId, jobId),
  });
}

export function useStartAiJobMutation(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: StartGenerationRequest) => startGeneration(sessionId, request),
    onSuccess: () => client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId) }),
  });
}

export function useCancelAiJobMutation(sessionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => cancelGeneration(sessionId, jobId),
    onSuccess: () => client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId) }),
  });
}

export function useRegenerateAiItemMutation(sessionId: string, jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: RegenerateRequest) => regenerateItem(sessionId, jobId, request),
    onSuccess: () => client.invalidateQueries({ queryKey: aiJobKeys.detail(sessionId, jobId) }),
  });
}

export function useCommitAiJobMutation(sessionId: string, jobId: string, context?: ReadmatesApiContext) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: CommitGenerationRequest) => commitGeneration(sessionId, jobId, request),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: aiJobKeys.session(sessionId) }),
        invalidateSessionRecordSurfaces(client, sessionId, context),
      ]);
    },
  });
}
```

- [ ] **Step 4: Add recovery strip component**

Create `front/features/host/aigen/ui/AiRecoveryStrip.tsx`:

```tsx
import type { AiRecentJobResponse } from "@/features/host/aigen/api/aigen-contracts";

type AiRecoveryStripProps = {
  job: AiRecentJobResponse | null;
  loading?: boolean;
  onResumePolling: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onCommitRetry: (jobId: string) => void;
  onStartNew: () => void;
};

export function AiRecoveryStrip({
  job,
  loading = false,
  onResumePolling,
  onCancel,
  onCommitRetry,
  onStartNew,
}: AiRecoveryStripProps) {
  if (loading) {
    return <p className="small" role="status">AI 작업 상태를 확인하는 중입니다.</p>;
  }
  if (!job) return null;

  return (
    <div className="surface-quiet" style={{ padding: 14 }}>
      <div className="row-between" style={{ gap: 12 }}>
        <div>
          <span className="badge badge-dot">{job.status}</span>
          <p className="small" style={{ margin: "8px 0 0" }}>
            {job.stage ?? "대기"} · {job.model}
          </p>
          {job.error ? (
            <p className="tiny" role="status" style={{ color: "var(--danger)", margin: "6px 0 0" }}>
              {job.error.code}: {job.error.message}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {job.availableActions.includes("POLL") ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onResumePolling(job.jobId)}>
              Polling 재개
            </button>
          ) : null}
          {job.availableActions.includes("CANCEL") ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => onCancel(job.jobId)}>
              취소
            </button>
          ) : null}
          {job.availableActions.includes("COMMIT_RETRY") ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onCommitRetry(job.jobId)}>
              Commit 재시도
            </button>
          ) : null}
          {job.availableActions.includes("START_NEW") ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={onStartNew}>
              새로 시작
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add recovery strip tests**

Create `front/features/host/aigen/ui/AiRecoveryStrip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AiRecoveryStrip } from "./AiRecoveryStrip";

const job = {
  jobId: "job-1",
  status: "SUCCEEDED",
  stage: "READY",
  progressPct: 100,
  model: "gpt-model",
  result: null,
  error: null,
  tokens: null,
  costEstimateUsd: "0.0000",
  warnings: [],
  createdAt: "2026-05-18T00:00:00Z",
  lastUpdatedAt: "2026-05-18T00:01:00Z",
  expiresAt: "2026-05-18T06:00:00Z",
  availableActions: ["POLL", "CANCEL", "COMMIT_RETRY", "START_NEW"],
} as const;

describe("AiRecoveryStrip", () => {
  it("renders safe status and actions", async () => {
    const onCommitRetry = vi.fn();
    render(
      <AiRecoveryStrip
        job={job}
        onResumePolling={vi.fn()}
        onCancel={vi.fn()}
        onCommitRetry={onCommitRetry}
        onStartNew={vi.fn()}
      />,
    );

    expect(screen.getByText("SUCCEEDED")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Commit 재시도" }));
    expect(onCommitRetry).toHaveBeenCalledWith("job-1");
  });
});
```

- [ ] **Step 6: Integrate strip into AiGenerateTab**

Modify `AiGenerateTab` to use `recentAiJobQuery(sessionId)` on idle render. Add local state:

```ts
const recentJobQuery = useQuery(recentAiJobQuery(sessionId));
```

Render `AiRecoveryStrip` before `TranscriptUploadForm`:

```tsx
<AiRecoveryStrip
  job={recentJobQuery.data ?? null}
  loading={recentJobQuery.isFetching}
  onResumePolling={(jobId) => setStage({ tag: "active", jobId, cancelling: false })}
  onCancel={(jobId) => {
    setStage({ tag: "active", jobId, cancelling: true });
    void cancelMutation.mutateAsync(jobId);
  }}
  onCommitRetry={(jobId) => setStage({ tag: "active", jobId, cancelling: false })}
  onStartNew={handleRetry}
/>
```

Use `useStartAiJobMutation`, `useCancelAiJobMutation`, and `useCommitAiJobMutation` from the new query module. Keep draft adoption and preview editing logic unchanged.

- [ ] **Step 7: Run host AI tests**

Run:

```bash
pnpm --dir front exec vitest run front/features/host/aigen/ui/AiRecoveryStrip.test.tsx front/features/host/aigen/ui/AiGenerateTab.test.tsx front/features/host/aigen/api/aigen-api.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit host AI recovery UI**

Run:

```bash
git add front/features/host/aigen front/features/host/ui/session-editor/session-record-completion-panel.tsx
git commit -m "feat(front): add host AI job recovery"
```

Expected: commit succeeds.

---

## Task 6: Server Platform Admin AI Ops API

**Files:**
- Add: `server/src/main/resources/db/mysql/migration/V34__ai_generation_ops_audit_and_indexes.sql`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsController.kt`
- Create: `server/src/main/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsWebDtos.kt`
- Create tests listed in File Map
- Modify: `server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt`

- [ ] **Step 1: Add migration**

Create `server/src/main/resources/db/mysql/migration/V34__ai_generation_ops_audit_and_indexes.sql`:

```sql
CREATE TABLE ai_generation_admin_action_audit (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id           CHAR(36)     NOT NULL,
  club_id          CHAR(36)     NOT NULL,
  session_id       CHAR(36)     NOT NULL,
  admin_user_id    CHAR(36)     NOT NULL,
  admin_role       VARCHAR(32)  NOT NULL,
  action           VARCHAR(32)  NOT NULL,
  previous_status  VARCHAR(32)  NULL,
  next_status      VARCHAR(32)  NULL,
  result           VARCHAR(32)  NOT NULL,
  safe_error_code  VARCHAR(64)  NULL,
  created_at       DATETIME(6)  NOT NULL,
  INDEX idx_aigen_admin_action_job_created (job_id, created_at),
  INDEX idx_aigen_admin_action_admin_created (admin_user_id, created_at)
);

CREATE INDEX idx_aigen_audit_job_created
  ON ai_generation_audit_log (job_id, created_at);

CREATE INDEX idx_aigen_audit_status_created
  ON ai_generation_audit_log (status, created_at);

CREATE INDEX idx_aigen_audit_error_created
  ON ai_generation_audit_log (error_code, created_at);

CREATE INDEX idx_aigen_audit_model_created
  ON ai_generation_audit_log (provider, model, created_at);
```

- [ ] **Step 2: Create application models**

Create `server/src/main/kotlin/com/readmates/aigen/application/model/AiGenerationOpsModels.kt`:

```kotlin
package com.readmates.aigen.application.model

import com.readmates.club.domain.PlatformAdminRole
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class AiOpsSummary(
    val activeJobCount: Int,
    val failedLast24h: Long,
    val monthToDateCostEstimateUsd: BigDecimal,
    val failureCodes: List<AiOpsFailureCodeCount>,
    val providerCosts: List<AiOpsProviderCost>,
    val staleCandidateCount: Int,
)

data class AiOpsFailureCodeCount(val code: String, val count: Long)

data class AiOpsProviderCost(
    val provider: Provider,
    val model: String,
    val costEstimateUsd: BigDecimal,
)

data class AiOpsJobList(
    val items: List<AiOpsJobListItem>,
    val nextCursor: String?,
)

data class AiOpsJobListItem(
    val jobId: UUID,
    val clubId: UUID,
    val clubSlug: String?,
    val clubName: String?,
    val sessionId: UUID,
    val sessionNumber: Int?,
    val bookTitle: String?,
    val status: JobStatus,
    val stage: JobStage?,
    val provider: Provider,
    val model: String,
    val errorCode: String?,
    val safeErrorMessage: String?,
    val costEstimateUsd: BigDecimal,
    val createdAt: Instant,
    val lastUpdatedAt: Instant,
    val expiresAt: Instant?,
    val staleCandidate: Boolean,
    val availableActions: Set<AiOpsAction>,
)

enum class AiOpsAction { FORCE_CANCEL }

data class AiOpsJobFilters(
    val status: JobStatus?,
    val clubId: UUID?,
    val errorCode: String?,
    val cursor: String?,
)

data class AiOpsAdminActionResult(
    val jobId: UUID,
    val previousStatus: JobStatus,
    val nextStatus: JobStatus,
)

data class AiOpsAdminActor(
    val userId: UUID,
    val role: PlatformAdminRole,
)
```

- [ ] **Step 3: Create ports**

Create `server/src/main/kotlin/com/readmates/aigen/application/port/in/AiGenerationOpsUseCases.kt`:

```kotlin
package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface GetAiOpsSummaryUseCase {
    fun summary(admin: CurrentPlatformAdmin): AiOpsSummary
}

interface ListAiOpsJobsUseCase {
    fun list(admin: CurrentPlatformAdmin, filters: AiOpsJobFilters): AiOpsJobList
}

interface GetAiOpsJobUseCase {
    fun get(admin: CurrentPlatformAdmin, jobId: UUID): AiOpsJobListItem
}

interface ForceCancelAiOpsJobUseCase {
    fun forceCancel(admin: CurrentPlatformAdmin, jobId: UUID): AiOpsAdminActionResult
}
```

Create `server/src/main/kotlin/com/readmates/aigen/application/port/out/AiGenerationOpsAuditPorts.kt`:

```kotlin
package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.club.domain.PlatformAdminRole
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

interface AiGenerationAuditQueryPort {
    fun countFailuresSince(since: Instant): Long
    fun costSince(since: Instant): BigDecimal
    fun failureCodesSince(since: Instant): List<AiOpsFailureCodeCount>
    fun providerCostsSince(since: Instant): List<AiOpsProviderCost>
    fun listJobs(filters: AiOpsJobFilters): AiOpsJobList
}

interface AiGenerationAdminActionAuditPort {
    fun record(entry: AiGenerationAdminActionAuditEntry)
}

data class AiGenerationAdminActionAuditEntry(
    val jobId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val adminUserId: UUID,
    val adminRole: PlatformAdminRole,
    val action: String,
    val previousStatus: String?,
    val nextStatus: String?,
    val result: String,
    val safeErrorCode: String?,
    val createdAt: Instant,
)
```

- [ ] **Step 4: Implement service with action authorization**

Create `server/src/main/kotlin/com/readmates/aigen/application/service/AiGenerationOpsService.kt`:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditPort
import com.readmates.aigen.application.port.out.AiGenerationAuditQueryPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Service
class AiGenerationOpsService(
    private val auditQueryPort: AiGenerationAuditQueryPort,
    private val adminActionAuditPort: AiGenerationAdminActionAuditPort,
    private val jobStore: AiGenerationJobStore,
    private val clock: Clock,
) : GetAiOpsSummaryUseCase,
    ListAiOpsJobsUseCase,
    GetAiOpsJobUseCase,
    ForceCancelAiOpsJobUseCase {

    override fun summary(admin: CurrentPlatformAdmin): AiOpsSummary {
        val now = clock.instant()
        val activeJobs = jobStore.loadActiveJobs()
        return AiOpsSummary(
            activeJobCount = activeJobs.size,
            failedLast24h = auditQueryPort.countFailuresSince(now.minus(Duration.ofHours(24))),
            monthToDateCostEstimateUsd = auditQueryPort.costSince(now.minus(Duration.ofDays(31))),
            failureCodes = auditQueryPort.failureCodesSince(now.minus(Duration.ofDays(31))),
            providerCosts = auditQueryPort.providerCostsSince(now.minus(Duration.ofDays(31))),
            staleCandidateCount = activeJobs.count { it.status in STALE_CANDIDATE_STATUSES && it.lastUpdatedAt.isBefore(now.minus(Duration.ofMinutes(15))) },
        )
    }

    override fun list(admin: CurrentPlatformAdmin, filters: AiOpsJobFilters): AiOpsJobList =
        auditQueryPort.listJobs(filters)

    override fun get(admin: CurrentPlatformAdmin, jobId: UUID): AiOpsJobListItem =
        auditQueryPort.listJobs(AiOpsJobFilters(status = null, clubId = null, errorCode = null, cursor = jobId.toString()))
            .items
            .firstOrNull { it.jobId == jobId }
            ?: throw AiGenerationException.JobNotFound(jobId)

    override fun forceCancel(admin: CurrentPlatformAdmin, jobId: UUID): AiOpsAdminActionResult {
        if (admin.role !in ACTION_ROLES) {
            throw AccessDeniedException("Platform admin role ${admin.role} cannot force-cancel AI generation jobs")
        }
        val record = jobStore.load(jobId) ?: throw AiGenerationException.JobNotFound(jobId)
        if (record.status !in FORCE_CANCEL_STATUSES) {
            throw AiGenerationException.IllegalGenerationState(jobId, record.status.name, "admin force-cancel")
        }
        val cancelled = jobStore.transitionStatus(
            jobId = jobId,
            expected = FORCE_CANCEL_STATUSES,
            next = JobStatus.CANCELLED,
            stage = null,
            progressPct = 0,
            error = null,
        )
        if (!cancelled) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = jobId,
                currentStatus = jobStore.load(jobId)?.status?.name ?: "MISSING",
                attemptedAction = "admin force-cancel",
            )
        }
        jobStore.deleteTransientPayload(jobId)
        adminActionAuditPort.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = record.clubId,
                sessionId = record.sessionId,
                adminUserId = admin.userId,
                adminRole = admin.role,
                action = "FORCE_CANCEL",
                previousStatus = record.status.name,
                nextStatus = JobStatus.CANCELLED.name,
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = clock.instant(),
            ),
        )
        return AiOpsAdminActionResult(jobId, record.status, JobStatus.CANCELLED)
    }

    private companion object {
        val ACTION_ROLES = setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)
        val FORCE_CANCEL_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)
        val STALE_CANDIDATE_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.COMMITTING)
    }
}
```

- [ ] **Step 5: Implement JDBC query repository**

Create `server/src/main/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepository.kt` with methods from `AiGenerationAuditQueryPort` and `AiGenerationAdminActionAuditPort`. Use SQL aggregations over `ai_generation_audit_log`; join `clubs` and `sessions` for job list metadata. Map only safe fields.

Key list query SQL:

```sql
select
  a.job_id,
  a.club_id,
  c.slug as club_slug,
  c.name as club_name,
  a.session_id,
  s.number as session_number,
  s.book_title,
  a.status,
  null as stage,
  a.provider,
  a.model,
  a.error_code,
  a.error_message,
  a.cost_estimate_usd,
  a.created_at
from ai_generation_audit_log a
left join clubs c on c.id = a.club_id
left join sessions s on s.id = a.session_id
where (? is null or a.status = ?)
  and (? is null or a.club_id = ?)
  and (? is null or a.error_code = ?)
order by a.created_at desc, a.id desc
limit 51
```

- [ ] **Step 6: Add web DTOs and controller**

Create `AiGenerationOpsWebDtos.kt` with response classes mirroring the frontend contract. Create `AiGenerationOpsController.kt`:

```kotlin
@RestController
@RequestMapping("/api/admin/ai-generation")
class AiGenerationOpsController(
    private val summaryUseCase: GetAiOpsSummaryUseCase,
    private val listUseCase: ListAiOpsJobsUseCase,
    private val getUseCase: GetAiOpsJobUseCase,
    private val forceCancelUseCase: ForceCancelAiOpsJobUseCase,
) {
    @GetMapping("/summary")
    fun summary(admin: CurrentPlatformAdmin): AiOpsSummaryResponse =
        AiOpsSummaryResponse.from(summaryUseCase.summary(admin))

    @GetMapping("/jobs")
    fun jobs(
        admin: CurrentPlatformAdmin,
        @RequestParam status: JobStatus?,
        @RequestParam clubId: UUID?,
        @RequestParam errorCode: String?,
        @RequestParam cursor: String?,
    ): AiOpsJobListResponse =
        AiOpsJobListResponse.from(listUseCase.list(admin, AiOpsJobFilters(status, clubId, errorCode, cursor)))

    @GetMapping("/jobs/{jobId}")
    fun job(admin: CurrentPlatformAdmin, @PathVariable jobId: UUID): AiOpsJobResponse =
        AiOpsJobResponse.from(getUseCase.get(admin, jobId))

    @PostMapping("/jobs/{jobId}/force-cancel")
    fun forceCancel(admin: CurrentPlatformAdmin, @PathVariable jobId: UUID): AiOpsAdminActionResponse =
        AiOpsAdminActionResponse.from(forceCancelUseCase.forceCancel(admin, jobId))
}
```

- [ ] **Step 7: Add controller/service/repository tests**

Create `server/src/test/kotlin/com/readmates/aigen/application/service/AiGenerationOpsServiceTest.kt` with service-level authorization and force-cancel tests:

```kotlin
package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditPort
import com.readmates.aigen.application.port.out.AiGenerationAuditQueryPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class AiGenerationOpsServiceTest {
    private val jobStore = RecordingJobStore()
    private val actionAudit = RecordingActionAudit()
    private val service = AiGenerationOpsService(
        auditQueryPort = EmptyAuditQueryPort(),
        adminActionAuditPort = actionAudit,
        jobStore = jobStore,
        clock = Clock.fixed(Instant.parse("2026-05-18T00:00:00Z"), ZoneOffset.UTC),
    )

    @Test
    fun `support admin can read summary but cannot force cancel`() {
        val job = sampleJob(status = JobStatus.RUNNING)
        jobStore.record = job
        val support = CurrentPlatformAdmin(UUID.randomUUID(), "support", PlatformAdminRole.SUPPORT)

        assertEquals(1, service.summary(support).activeJobCount)
        assertThrows(AccessDeniedException::class.java) {
            service.forceCancel(support, job.jobId)
        }
    }

    @Test
    fun `operator can force cancel eligible live job`() {
        val job = sampleJob(status = JobStatus.RUNNING)
        jobStore.record = job
        val operator = CurrentPlatformAdmin(UUID.randomUUID(), "operator", PlatformAdminRole.OPERATOR)

        val result = service.forceCancel(operator, job.jobId)

        assertEquals(JobStatus.RUNNING, result.previousStatus)
        assertEquals(JobStatus.CANCELLED, result.nextStatus)
        assertEquals("FORCE_CANCEL", actionAudit.entries.single().action)
    }
}
```

Create `server/src/test/kotlin/com/readmates/aigen/adapter/in/web/AiGenerationOpsControllerTest.kt` with response-safety assertions:

```kotlin
@Test
fun `admin job list omits transcript result and instructions fields`() {
    val response = mockMvc.get("/api/admin/ai-generation/jobs").andExpect {
        status { isOk() }
    }.andReturn().response.contentAsString

    assertFalse(response.contains("transcript"))
    assertFalse(response.contains("instructions"))
    assertFalse(response.contains("feedbackDocumentMarkdown"))
}
```

Create `server/src/test/kotlin/com/readmates/aigen/adapter/out/persistence/JdbcAiGenerationOpsAuditRepositoryTest.kt` with the aggregate assertion:

```kotlin
@Test
fun `repository aggregates provider costs from audit rows`() {
    insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("0.1200"))
    insertAuditRow(provider = "OPENAI", model = "gpt-model", cost = BigDecimal("0.0800"))

    val costs = repository.providerCostsSince(Instant.parse("2026-05-01T00:00:00Z"))

    assertEquals(BigDecimal("0.2000"), costs.single().costEstimateUsd)
    assertEquals("gpt-model", costs.single().model)
}
```

- [ ] **Step 8: Extend architecture boundary**

Modify `ServerArchitectureBoundaryTest` migrated arrays to include:

```kotlin
"com.readmates.aigen.adapter.in.web..",
```

and:

```kotlin
"com.readmates.aigen.application..",
```

Run architecture test before committing.

- [ ] **Step 9: Run server verification**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.application.service.AiGenerationOpsServiceTest'
./server/gradlew -p server unitTest --tests 'com.readmates.aigen.adapter.in.web.AiGenerationOpsControllerTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.aigen.adapter.out.persistence.JdbcAiGenerationOpsAuditRepositoryTest'
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 10: Commit server AI Ops API**

Run:

```bash
git add server/src/main/resources/db/mysql/migration/V34__ai_generation_ops_audit_and_indexes.sql server/src/main/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/aigen server/src/test/kotlin/com/readmates/architecture/ServerArchitectureBoundaryTest.kt
git commit -m "feat(aigen): add platform admin AI ops API"
```

Expected: commit succeeds.

---

## Task 7: Platform Admin AI Ops Frontend

**Files:**
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Create: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.ts`
- Create: `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`
- Create: `front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx`
- Modify: `front/features/platform-admin/ui/platform-admin-dashboard.tsx`
- Modify: `front/features/platform-admin/route/platform-admin-route.tsx`

- [ ] **Step 1: Add frontend contracts**

Append to `platform-admin-contracts.ts`:

```ts
export type PlatformAdminAiOpsAction = "FORCE_CANCEL";

export type PlatformAdminAiOpsSummaryResponse = {
  activeJobCount: number;
  failedLast24h: number;
  monthToDateCostEstimateUsd: string;
  failureCodes: Array<{ code: string; count: number }>;
  providerCosts: Array<{ provider: string; model: string; costEstimateUsd: string }>;
  staleCandidateCount: number;
};

export type PlatformAdminAiOpsJob = {
  jobId: string;
  club: { clubId: string; slug: string | null; name: string | null };
  session: { sessionId: string; number: number | null; bookTitle: string | null };
  status: string;
  stage: string | null;
  provider: string;
  model: string;
  errorCode: string | null;
  safeErrorMessage: string | null;
  costEstimateUsd: string;
  createdAt: string;
  lastUpdatedAt: string;
  expiresAt: string | null;
  staleCandidate: boolean;
  availableActions: PlatformAdminAiOpsAction[];
};

export type PlatformAdminAiOpsJobListResponse = {
  items: PlatformAdminAiOpsJob[];
  nextCursor: string | null;
};

export type PlatformAdminAiOpsFilters = {
  status?: string;
  clubId?: string;
  errorCode?: string;
  cursor?: string;
};
```

- [ ] **Step 2: Add API wrappers**

Append to `platform-admin-api.ts`:

```ts
export function fetchPlatformAdminAiOpsSummary() {
  return readmatesFetch<PlatformAdminAiOpsSummaryResponse>(
    "/api/admin/ai-generation/summary",
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchPlatformAdminAiOpsJobs(filters: PlatformAdminAiOpsFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return readmatesFetch<PlatformAdminAiOpsJobListResponse>(
    `/api/admin/ai-generation/jobs${search ? `?${search}` : ""}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function forceCancelPlatformAdminAiJob(jobId: string) {
  return readmatesFetch<{ jobId: string; previousStatus: string; nextStatus: string }>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/force-cancel`,
    { method: "POST" },
    { clubSlug: undefined },
  );
}
```

- [ ] **Step 3: Create query module and tests**

Create `platform-admin-ai-ops-queries.ts`:

```ts
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchPlatformAdminAiOpsJobs,
  fetchPlatformAdminAiOpsSummary,
  forceCancelPlatformAdminAiJob,
} from "@/features/platform-admin/api/platform-admin-api";
import type { PlatformAdminAiOpsFilters } from "@/features/platform-admin/api/platform-admin-contracts";

function normalizeFilters(filters: PlatformAdminAiOpsFilters = {}) {
  return {
    status: filters.status ?? null,
    clubId: filters.clubId ?? null,
    errorCode: filters.errorCode ?? null,
    cursor: filters.cursor ?? null,
  };
}

export const platformAdminAiOpsKeys = {
  all: ["platform-admin", "ai-ops"] as const,
  summary: () => [...platformAdminAiOpsKeys.all, "summary"] as const,
  jobs: (filters?: PlatformAdminAiOpsFilters) =>
    [...platformAdminAiOpsKeys.all, "jobs", normalizeFilters(filters)] as const,
} as const;

export function platformAdminAiOpsSummaryQuery() {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.summary(),
    queryFn: fetchPlatformAdminAiOpsSummary,
  });
}

export function platformAdminAiOpsJobsQuery(filters?: PlatformAdminAiOpsFilters) {
  return queryOptions({
    queryKey: platformAdminAiOpsKeys.jobs(filters),
    queryFn: () => fetchPlatformAdminAiOpsJobs(filters),
  });
}

export function useForceCancelPlatformAdminAiJobMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => forceCancelPlatformAdminAiJob(jobId),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: platformAdminAiOpsKeys.summary() }),
        client.invalidateQueries({ queryKey: platformAdminAiOpsKeys.all }),
      ]),
  });
}
```

Create test asserting normalized key and invalidation after mutation.

- [ ] **Step 4: Create UI component**

Create `front/features/platform-admin/ui/platform-admin-ai-ops.tsx`:

```tsx
import type {
  PlatformAdminAiOpsJob,
  PlatformAdminAiOpsSummaryResponse,
  PlatformAdminRole,
} from "@/features/platform-admin/api/platform-admin-contracts";

type PlatformAdminAiOpsProps = {
  role: PlatformAdminRole;
  summary: PlatformAdminAiOpsSummaryResponse | null;
  jobs: PlatformAdminAiOpsJob[];
  loading?: boolean;
  error?: string | null;
  onForceCancel?: (jobId: string) => void;
};

export function PlatformAdminAiOps({
  role,
  summary,
  jobs,
  loading = false,
  error = null,
  onForceCancel,
}: PlatformAdminAiOpsProps) {
  const canAct = role === "OWNER" || role === "OPERATOR";
  return (
    <section className="platform-admin-ai-ops" aria-labelledby="platform-admin-ai-ops-title">
      <div className="row-between" style={{ gap: 12 }}>
        <div>
          <p className="eyebrow">AI Ops</p>
          <h2 id="platform-admin-ai-ops-title" className="h2">AI 운영</h2>
        </div>
        {loading ? <span className="badge">동기화 중</span> : null}
      </div>
      {error ? <p className="small" role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
      <div className="metric-grid">
        <Metric label="Active" value={String(summary?.activeJobCount ?? 0)} />
        <Metric label="Failed 24h" value={String(summary?.failedLast24h ?? 0)} />
        <Metric label="Cost MTD" value={`$${summary?.monthToDateCostEstimateUsd ?? "0.0000"}`} />
        <Metric label="Stale" value={String(summary?.staleCandidateCount ?? 0)} />
      </div>
      <div className="stack" style={{ "--stack": "8px" } as React.CSSProperties}>
        {jobs.map((job) => (
          <article key={job.jobId} className="surface-quiet" style={{ padding: 12 }}>
            <div className="row-between" style={{ gap: 12 }}>
              <div>
                <span className="badge badge-dot">{job.status}</span>
                <p className="small" style={{ margin: "6px 0 0" }}>
                  {job.club.name ?? job.club.slug ?? job.club.clubId} · {job.session.bookTitle ?? job.session.sessionId}
                </p>
                {job.errorCode ? (
                  <p className="tiny" style={{ color: "var(--danger)", margin: "4px 0 0" }}>
                    {job.errorCode}: {job.safeErrorMessage ?? "safe error"}
                  </p>
                ) : null}
              </div>
              {canAct && job.availableActions.includes("FORCE_CANCEL") ? (
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => onForceCancel?.(job.jobId)}>
                  Force cancel
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-quiet" style={{ padding: 12 }}>
      <p className="tiny" style={{ margin: 0 }}>{label}</p>
      <p className="h3" style={{ margin: "4px 0 0" }}>{value}</p>
    </div>
  );
}
```

- [ ] **Step 5: Integrate into PlatformAdminDashboard and route**

Add props to `PlatformAdminDashboard`:

```ts
aiOpsSummary?: PlatformAdminAiOpsSummaryResponse | null;
aiOpsJobs?: PlatformAdminAiOpsJob[];
aiOpsLoading?: boolean;
aiOpsError?: string | null;
onForceCancelAiJob?: (jobId: string) => void;
```

Render the AI Ops section below the existing `platform-admin-console`:

```tsx
<PlatformAdminAiOps
  role={workbench.metrics.platformRole}
  summary={aiOpsSummary}
  jobs={aiOpsJobs}
  loading={aiOpsLoading}
  error={aiOpsError}
  onForceCancel={onForceCancelAiJob}
/>
```

In `PlatformAdminRoute`, call:

```ts
const aiOpsSummaryQuery = useQuery(platformAdminAiOpsSummaryQuery());
const aiOpsJobsQuery = useQuery(platformAdminAiOpsJobsQuery());
const forceCancelAiJob = useForceCancelPlatformAdminAiJobMutation();
```

Pass data and handler into the dashboard.

- [ ] **Step 6: Run platform admin frontend tests**

Run:

```bash
pnpm --dir front exec vitest run front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx front/features/platform-admin/ui/platform-admin-ai-ops.test.tsx front/tests/unit/platform-admin.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit platform admin AI Ops frontend**

Run:

```bash
git add front/features/platform-admin
git commit -m "feat(front): add platform admin AI ops console"
```

Expected: commit succeeds.

---

## Task 8: E2E, Docs, Changelog, And Final Verification

**Files:**
- Modify or add: `front/tests/e2e/aigen-jsonupload-coexistence.spec.ts`
- Add: `front/tests/e2e/platform-admin-ai-ops.spec.ts`
- Modify: `docs/development/server-state-migration.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add host AI no-reload E2E assertion**

In `front/tests/e2e/aigen-jsonupload-coexistence.spec.ts`, add:

```ts
await page.evaluate(() => {
  window.__readmatesReloadCount = 0;
  const originalReload = window.location.reload.bind(window.location);
  Object.defineProperty(window.location, "reload", {
    configurable: true,
    value: () => {
      window.__readmatesReloadCount += 1;
      return originalReload();
    },
  });
});

await page.getByRole("button", { name: /기록 저장|Commit/ }).click();
await expect(page.getByText(/AI 기록 저장을 완료했습니다|저장 완료/)).toBeVisible();
await expect.poll(() => page.evaluate(() => window.__readmatesReloadCount ?? 0)).toBe(0);
```

Use existing fixture navigation and auth setup in that spec.

- [ ] **Step 2: Add platform admin AI Ops E2E smoke**

Create `front/tests/e2e/platform-admin-ai-ops.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { loginAsPlatformOwner, loginAsPlatformSupport } from "./support/auth";

test("platform support can read AI Ops but cannot force cancel", async ({ page }) => {
  await loginAsPlatformSupport(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "AI 운영" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Force cancel" })).toHaveCount(0);
});

test("platform owner sees AI Ops action affordance when job is actionable", async ({ page }) => {
  await loginAsPlatformOwner(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "AI 운영" })).toBeVisible();
});
```

If current E2E support helpers use different names, keep the two assertions: support read-only, owner can view the AI Ops section.

- [ ] **Step 3: Update server-state migration status**

Modify `docs/development/server-state-migration.md`:

```md
## 완료
- `archive` — list/detail reads, cursor pages, and session-record invalidation are Query-owned.
- `feedback` — feedback document reads and AI commit invalidation are Query-owned.
- `public` — club/session public reads use Query loader seeding with scoped invalidation.

## 후속 후보 (우선순위)
1. Design-system visual regression infrastructure
2. Further server read-model query budget work
```

Preserve existing completed bullets and append the new ones.

- [ ] **Step 4: Update CHANGELOG**

Under `## Unreleased`, add:

```md
### Highlights

- **AI 운영 콘솔 + 호스트 복구**: `/admin`에서 AI job 상태, 실패 코드, 비용 추정, stale 후보를 보는 AI Ops 표면을 추가하고, 호스트 세션 편집기에서 자기 세션의 in-flight AI job을 다시 찾아 안전하게 취소/재시도할 수 있게 했습니다.
- **Query foundation 완주**: `archive`, `feedback`, `public` read path를 Query loader seeding으로 이전하고, AI commit 후 full page reload 대신 관련 Query cache invalidation으로 화면을 갱신합니다.
```

If `## Unreleased` already has `### Highlights`, append the two bullets under it instead of duplicating the heading.

- [ ] **Step 5: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

Expected: PASS.

- [ ] **Step 6: Run server checks**

Run:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
```

Expected: PASS.

- [ ] **Step 7: Run docs and public safety checks**

Run:

```bash
git diff --check -- CHANGELOG.md docs/development/server-state-migration.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: PASS.

- [ ] **Step 8: Commit verification docs**

Run:

```bash
git add CHANGELOG.md docs/development/server-state-migration.md front/tests/e2e
git commit -m "test: cover AI ops and query foundation flows"
```

Expected: commit succeeds.

- [ ] **Step 9: Final branch review**

Run:

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
```

Expected: clean worktree except intentional local ignored files; log shows the task commits; diff stat matches frontend/server/docs surfaces.
