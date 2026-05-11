# Current Session Refresh — Club Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `current-session` route's silent background refresh carry the route's `clubSlug` so that, on production (`readmates.pages.dev`), saves no longer collapse the page to "아직 열린 세션이 없습니다".

**Architecture:** Source `clubSlug` from React Router's `useParams()` inside `CurrentSessionRoute` and forward it as `{ params }` to `loadCurrentSessionRouteData` inside the `readmates:route-refresh` event handler. Preserve the existing silent-refresh semantics (`.catch` swallows refresh errors and keeps last-successful data on screen). Add a regression test that mounts the route under a club-scoped path and asserts every `/api/sessions/current` fetch carries `clubSlug=reading-sai`.

**Tech Stack:** Vite 5, React 19, React Router 7, vitest + React Testing Library, Playwright. No Next/RSC directives. Per `front/AGENTS.md`: do not add `"use client"` to Vite source files.

**Spec:** `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`

---

## File map

Modify:

- `front/features/current-session/route/current-session-route.tsx`
- `front/tests/unit/current-session.test.tsx`

Do not create or delete files. Do not edit:

- `front/features/current-session/route/current-session-data.ts`
- `front/shared/auth/member-app-loader.ts`
- `front/shared/api/client.ts`
- `front/functions/api/bff/[[path]].ts`
- `front/vite.config.ts`
- Any server-side Kotlin file
- Any other route's refresh path

---

## Task 1: Add `useParams` and forward route params to the refresh handler

**Files:**
- Modify: `front/features/current-session/route/current-session-route.tsx`

This task is small but precise. Verification is by Task 2's regression test (failing-first, then passing) and by `pnpm --dir front test`.

- [ ] **Step 1: Read the current file**

Open `front/features/current-session/route/current-session-route.tsx`. Confirm the imports on line 2 read:

```tsx
import { useLoaderData } from "react-router-dom";
```

If they do not, stop and reconcile — the file shape has drifted from the spec assumption.

- [ ] **Step 2: Add `useParams` to the React Router import**

Replace:

```tsx
import { useLoaderData } from "react-router-dom";
```

with:

```tsx
import { useLoaderData, useParams } from "react-router-dom";
```

- [ ] **Step 3: Read `useParams()` inside the component**

Inside `CurrentSessionRoute(...)`, immediately after the line:

```tsx
const loaderData = useLoaderData() as CurrentSessionRouteData;
```

add:

```tsx
const params = useParams();
```

Do **not** narrow the type with `as { clubSlug?: string }`. `useParams` returns `Readonly<Params<string>>` which is structurally compatible with `Pick<LoaderFunctionArgs, "params">["params"]` because both are `Record<string, string | undefined>`. Forcing a stricter type here only ties the route file to the parameter name.

- [ ] **Step 4: Forward `params` to the refresh call**

Inside the `useEffect` block at line ~56, find:

```tsx
      void loadCurrentSessionRouteData()
```

and change to:

```tsx
      void loadCurrentSessionRouteData({ params })
```

Do not change the surrounding sequence/race logic, the `.then` body, or the `.catch` body. The whole point is to leave silent-failure semantics intact.

- [ ] **Step 5: Add `params` to the effect dependency array**

The effect declaration is `}, [loaderData]);`. Change to:

```tsx
}, [loaderData, params]);
```

This guards against a theoretical (and cheap-to-cover) case where React Router re-renders the same route element with a different `clubSlug` (e.g., programmatic navigation between clubs without unmount). The listener closure would otherwise capture stale params.

- [ ] **Step 6: Sanity check the diff**

Run:

```bash
git diff front/features/current-session/route/current-session-route.tsx
```

Expected diff is exactly three changes:

1. Import line: add `, useParams`.
2. One new line: `const params = useParams();`.
3. `loadCurrentSessionRouteData()` → `loadCurrentSessionRouteData({ params })`.
4. Effect deps: `[loaderData]` → `[loaderData, params]`.

(That is four edits, three logically tied to behavior; double-count is fine. If the diff has any additional changes — for example accidentally reformatted code, removed comments, changed `requestSequence` logic — revert and redo this task.)

- [ ] **Step 7: Type-check**

```bash
pnpm --dir front lint
```

Expected: no new TypeScript or lint errors.

- [ ] **Step 8: Existing tests still pass**

```bash
pnpm --dir front test -- current-session
```

Expected: all existing `current-session.test.tsx` cases still pass. The new behavior is additive — passing `{ params }` where args were previously absent does not change any existing test's observed URLs because those tests mount the route at `/` (so `useParams()` is `{}` and `clubSlugFromLoaderArgs({ params: {} })` is `undefined`, matching the previous no-arg behavior).

- [ ] **Step 9: Do not commit yet**

Hold the change uncommitted until Task 2's regression test exists and demonstrates the bug → fix transition.

---

## Task 2: Add a club-scoped regression test

**Files:**
- Modify: `front/tests/unit/current-session.test.tsx`

The existing test suite mounts the route at `/`, which means `useParams()` returns `{}` and the bug is structurally unreachable in unit tests. The regression test must mount the route under a club-scoped path so the bug becomes representable.

- [ ] **Step 1: Locate the test block where route-refresh cases already live**

Open `front/tests/unit/current-session.test.tsx`. Find the existing test at line ~202:

```tsx
it("keeps current session content visible when a route refresh fails", async () => {
  ...
});
```

The new test belongs in the same `describe` block (the one that imports `currentSessionLoader`). Place it directly after the "keeps current session content visible" case so refresh-related tests stay grouped.

- [ ] **Step 2: Confirm the helpers the new test will reuse**

The test reuses the existing fixtures and helpers:

- `currentSessionData` (line ~26)
- `routeAuthFixture` (line ~57)
- `installRouterRequestShim` (search the file — defined locally)
- `jsonResponse` (search the file — defined locally)
- `vi.stubGlobal`, `vi.fn` from vitest
- `createMemoryRouter`, `RouterProvider` from `react-router-dom`
- `render`, `screen`, `waitFor` from `@testing-library/react`
- `CurrentSessionRoute`, `currentSessionLoader` from `@/features/current-session`

If any of these helpers does not exist under those names, fix the test to use the actual local helper before writing the assertions. Do not introduce new helpers.

- [ ] **Step 3: Verify the test will fail without the fix**

Before adding the test, **temporarily revert Task 1** locally:

```bash
git stash push front/features/current-session/route/current-session-route.tsx
```

This step is to prove the test catches the bug. You will restore the fix immediately after.

- [ ] **Step 4: Add the regression test**

Insert this test directly after the "keeps current session content visible when a route refresh fails" case:

```tsx
it("carries clubSlug through route refresh on a club-scoped path", async () => {
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

  render(<RouterProvider router={router} />);

  expect((await screen.findAllByText("테스트 책")).length).toBeGreaterThan(0);

  // Initial loader must have used the club slug.
  const initialSessionRequests = requestedUrls.filter((url) =>
    url.startsWith("/api/bff/api/sessions/current"),
  );
  expect(initialSessionRequests.length).toBeGreaterThan(0);
  for (const url of initialSessionRequests) {
    expect(url).toContain("clubSlug=reading-sai");
  }

  // Save-triggered refresh must reuse the same slug.
  const initialSessionRequestCount = initialSessionRequests.length;
  window.dispatchEvent(new Event("readmates:route-refresh"));

  await waitFor(() => {
    const sessionRequests = requestedUrls.filter((url) =>
      url.startsWith("/api/bff/api/sessions/current"),
    );
    expect(sessionRequests.length).toBe(initialSessionRequestCount + 1);
  });

  const sessionRequestsAfterRefresh = requestedUrls.filter((url) =>
    url.startsWith("/api/bff/api/sessions/current"),
  );
  for (const url of sessionRequestsAfterRefresh) {
    expect(url).toContain("clubSlug=reading-sai");
  }

  // Auth refresh during route refresh must also carry the slug.
  const authRequests = requestedUrls.filter((url) =>
    url.startsWith("/api/bff/api/auth/me"),
  );
  expect(authRequests.length).toBeGreaterThan(1);
  for (const url of authRequests) {
    expect(url).toContain("clubSlug=reading-sai");
  }
});
```

Notes on the assertions:

- "Every `/api/sessions/current` URL contains the slug" catches both the initial load and the refresh. The bug today fails this check on the refresh URL.
- "Every `/api/auth/me` URL contains the slug" catches the upstream root cause — without `clubSlug` on `/api/auth/me`, the production BFF would resolve a wrong context. This assertion future-proofs against a fix that only patches the session URL while still leaking the bug onto auth.
- Use `toContain("clubSlug=reading-sai")` not `toMatch(/clubSlug=reading-sai/)` so a test failure prints the actual URL, which makes diagnostics trivial.

- [ ] **Step 5: Confirm the test fails on the unfixed code**

```bash
pnpm --dir front test -- current-session
```

Expected:

- The new test "carries clubSlug through route refresh on a club-scoped path" **fails**, specifically on the post-refresh `/api/sessions/current` URL assertion. The failure message should mention the offending URL — it will be `/api/bff/api/sessions/current` with no query string.
- All other tests still pass.

If the test passes on unfixed code, the test does not actually catch the bug — re-check that:
  1. The initial entries use `/clubs/reading-sai/app/session/current` (not `/`).
  2. The route path uses `:clubSlug` so React Router populates `params.clubSlug`.
  3. The dispatched event name is exactly `readmates:route-refresh`.
  4. The fetch mock is recording URLs at the point the event handler runs (no `vi.useFakeTimers` is interfering).

- [ ] **Step 6: Restore the fix and confirm the test passes**

```bash
git stash pop
```

```bash
pnpm --dir front test -- current-session
```

Expected: all tests pass, including the new one.

- [ ] **Step 7: Confirm the silent-refresh test still passes**

The whole point of preserving the custom dispatcher is to keep the "keeps current session content visible when a route refresh fails" UX. Confirm that test name is still in the green output. If it is missing or red, revert to Task 1 step 1 and recheck.

---

## Task 3: Full local verification

The change touches a route, auth flow, and BFF call path. `front/AGENTS.md` requires `pnpm --dir front test:e2e` for that combination.

- [ ] **Step 1: Lint**

```bash
pnpm --dir front lint
```

Expected: passes.

- [ ] **Step 2: Unit tests**

```bash
pnpm --dir front test
```

Expected: passes, including the new regression test.

- [ ] **Step 3: Build**

```bash
pnpm --dir front build
```

Expected: passes.

- [ ] **Step 4: E2E**

```bash
pnpm --dir front test:e2e
```

Expected: passes. This is required because the change touches a route + auth + BFF + user-flow surface (the rule in `front/AGENTS.md`).

If any e2e currently uses MySQL fixtures, ensure the local MySQL setup from `docs/development/local-setup.md` is up before running.

If a check is intentionally skipped (e.g., MySQL unavailable in this environment), record the exact command and reason in the commit message / final report — also per `front/AGENTS.md`.

- [ ] **Step 5: Manual smoke (dev)**

Run the dev server:

```bash
pnpm --dir front dev
```

In a separate browser session:

1. Sign in.
2. Navigate to `/clubs/<your-test-club>/app/session/current`.
3. Confirm session board renders.
4. Adjust reading progress (e.g., slider to 50). Click 저장.
5. Confirm:
   - Save status pill shows 저장됨.
   - Page does **not** flip to "아직 열린 세션이 없습니다".
   - Network tab shows the post-save `/api/bff/api/sessions/current` request carries `?clubSlug=<your-test-club>`.

If the network tab shows the slug missing on the post-save fetch, Task 1 step 4 was not applied — re-check the diff.

---

## Task 4: Commit

- [ ] **Step 1: Stage**

```bash
git add front/features/current-session/route/current-session-route.tsx \
        front/tests/unit/current-session.test.tsx
```

- [ ] **Step 2: Commit**

Use a single commit. Suggested message:

```
fix(current-session): carry clubSlug through route refresh

The route-refresh handler called loadCurrentSessionRouteData() with no
args, so refresh fetches went out without ?clubSlug=. On readmates.pages.dev
the BFF always forwards X-Readmates-Club-Host=readmates.pages.dev, which
the backend treats as "club context supplied, not found", and /api/auth/me
returns an authenticated-but-membershipless response. canUseMemberApp then
returns false and the page renders the empty session state after every save.

Local Vite proxy strips the host header, so dev never reproduced.

Source the route's clubSlug from useParams() and forward { params } to
loadCurrentSessionRouteData inside the refresh handler. Preserves the
deliberate silent-refresh semantics (the .catch swallows errors and keeps
last-successful data; tested at line 202).

Adds a regression test that mounts CurrentSessionRoute under
/clubs/:clubSlug/app/session/current and asserts every /api/sessions/current
and /api/auth/me request carries clubSlug=reading-sai.

Refs: docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md
```

---

## Task 5: Post-merge verification on production

- [ ] **Step 1: Confirm Cloudflare Pages deploy succeeded for the merge commit**

After merging, wait for the Cloudflare Pages deploy to complete on `readmates.pages.dev`. The deploy URL appears in the CI run for the merge commit.

- [ ] **Step 2: Reproduce the original bug, confirm it is gone**

1. Open a browser session signed in as a member of `reading-sai` (or any test club).
2. Navigate to `https://readmates.pages.dev/clubs/reading-sai/app/session/current`.
3. Open DevTools → Network tab → filter `sessions/current`.
4. Change reading progress, click 저장.
5. Confirm:
   - The save POST/PUT to `/api/bff/api/sessions/current/checkin` returns 200.
   - The subsequent GET `/api/bff/api/sessions/current?clubSlug=reading-sai` returns 200 with `currentSession` populated.
   - The page stays on the session board. No "아직 열린 세션이 없습니다".

- [ ] **Step 3: Cross-check rsvp/questions/long-review paths**

The same dispatcher fires for RSVP, question save, long-review save, and one-line-review save (see `current-session-route.tsx:36-42`). Confirm each save type does not collapse the page:

1. RSVP buttons (참석/미정/불참).
2. Question add/save.
3. Long review save.
4. One-line review (if surfaced on this route).

If any save type still collapses, the dispatcher is firing but a different code path is broken — open a new bug; this plan's scope is the refresh route, not the save endpoints themselves.

---

## Out-of-scope follow-ups

These are listed for the record. They are **not** part of this change.

1. **BFF host policy on shared fallback.** Stop forwarding `X-Readmates-Club-Host` when the request host is the shared fallback domain (`readmates.pages.dev`). Removes the implicit-context source so a slug-less request never silently degrades. Requires environment-aware host classification and parity work in `vite.config.ts`. File a new spec when prioritized.
2. **Audit other routes for the same refresh pattern.** Today `grep -r "READMATES_ROUTE_REFRESH_EVENT" front/` and `grep -r "loadCurrentSessionRouteData(" front/` confirm this is the only no-arg refresh consumer. Re-run the grep before each new event-driven refresh consumer to maintain that invariant.
3. **Decision: keep silent-refresh, or surface refresh failures.** Today's UX swallows refresh errors. An explicit retry/toast surface (and a `useRevalidator` migration that comes with it) is a UX decision, not a bug fix. Track separately.
