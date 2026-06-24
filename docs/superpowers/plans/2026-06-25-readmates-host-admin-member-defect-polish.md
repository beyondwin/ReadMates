# ReadMates Host/Admin Member Defect Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore host member route reachability, remove admin club-detail mobile overflow, and clarify admin support search states without changing backend contracts.

**Architecture:** Keep the existing route-first frontend structure. Fix route matching in `front/src/app`, keep host member data/actions untouched, and make admin UI changes inside `features/platform-admin` presentation/route state plus existing global responsive CSS.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vitest, Testing Library, Playwright, Vite, TypeScript, CSS.

## Global Constraints

- Do not change Spring API contracts or persistence.
- Do not widen platform-admin permissions or support-grant capabilities.
- Do not remove the legacy club-detail support-grant panel in this pass.
- Do not redesign the admin shell navigation or host member list from scratch.
- Do not commit browser screenshots or local Playwright artifacts as product files.
- Preserve the frontend dependency direction: `src/app -> src/pages -> features -> shared`.
- Keep browser-visible data public-safe: no real member data, private domains, local absolute paths, token-shaped values, or screenshot artifacts.

---

## File Structure

- Modify `front/src/app/router.tsx`: evaluate host routes before member routes.
- Modify `front/src/app/router-route-order.test.tsx`: characterize host route matching before member wildcard routes.
- Modify `front/src/styles/globals.css`: collapse admin closing-risk rows inside the existing mobile media query.
- Modify `front/tests/e2e/admin-club-operations.spec.ts`: add a mobile overflow regression check using mocked public-safe admin data.
- Modify `front/features/platform-admin/route/admin-support-route.tsx`: track whether search has been submitted and pass that state to the workbench.
- Modify `front/features/platform-admin/ui/admin-support-workbench.tsx`: render initial/loading/no-result/result search states explicitly.
- Modify `front/features/platform-admin/ui/admin-support-workbench.test.tsx`: test initial and no-result states.
- Modify `front/features/platform-admin/route/admin-support-route.test.tsx`: ensure the route starts in the initial search state.

---

### Task 1: Restore Host Route Reachability

**Files:**
- Modify: `front/src/app/router.tsx`
- Modify: `front/src/app/router-route-order.test.tsx`

**Interfaces:**
- Consumes: `hostRoutes(queryClient): RouteObject[]`, `memberRoutes(queryClient): RouteObject[]`.
- Produces: `buildRoutes(queryClient): RouteObject[]` where `/app/host/**` and `/clubs/:clubSlug/app/host/**` match host route ids before member wildcard routes.

- [ ] **Step 1: Write the failing route-order tests**

Add host route assertions to `front/src/app/router-route-order.test.tsx`:

```tsx
  it("matches unscoped host routes before the member wildcard", () => {
    expect(routeIdsFor("/app/host")).toContain("app-host");
    expect(routeIdsFor("/app/host/members")).toContain("app-host");
    expect(routePathsFor("/app/host/members")).not.toEqual(expect.arrayContaining(["*"]));
  });

  it("matches club-scoped host routes before the member wildcard", () => {
    expect(routeIdsFor("/clubs/reading-sai/app/host")).toContain("club-app-host");
    expect(routeIdsFor("/clubs/reading-sai/app/host/members")).toContain("club-app-host");
    expect(routePathsFor("/clubs/reading-sai/app/host/members")).not.toEqual(expect.arrayContaining(["*"]));
  });
```

- [ ] **Step 2: Run the route-order test and verify it fails**

Run:

```bash
pnpm --dir front test -- router-route-order
```

Expected before implementation: the new host assertions fail because the member route tree catches `/app/host/**` or `/clubs/:slug/app/host/**` first.

- [ ] **Step 3: Implement the smallest route-order fix**

Replace `buildRoutes` in `front/src/app/router.tsx` with this order:

```tsx
export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    ...authRoutes(queryClient),
    ...hostRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...adminRoutes(queryClient),
    publicRoutes(queryClient),
  ];
}
```

- [ ] **Step 4: Run the route-order test and verify it passes**

Run:

```bash
pnpm --dir front test -- router-route-order
```

Expected: all route-order tests pass, including the existing admin-before-public checks.

- [ ] **Step 5: Commit Task 1**

```bash
git add front/src/app/router.tsx front/src/app/router-route-order.test.tsx
git commit -m "fix(front): route host app before member wildcard"
```

---

### Task 2: Remove Admin Club Detail Mobile Overflow

**Files:**
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/e2e/admin-club-operations.spec.ts`

**Interfaces:**
- Consumes: existing `AdminClubOperationsPage` markup and `.admin-club-operations__closing-risk-*` class names.
- Produces: responsive CSS where `.admin-club-operations__closing-risk-row` becomes a one-column mobile layout and cannot push the document wider than the viewport.

- [ ] **Step 1: Write the failing mobile overflow E2E test**

Append this test to `front/tests/e2e/admin-club-operations.spec.ts`:

```ts
test("owner views club operations closing risks without mobile horizontal overflow", async ({ page }) => {
  await routePlatformAdminShell(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`/admin/clubs/${CLUB_ID}`);
  await expect(page.getByRole("heading", { name: "클로징 확인 필요" })).toBeVisible();
  await expect(page.getByText("No.07 · 페인트")).toBeVisible();

  const width = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
});
```

- [ ] **Step 2: Run the targeted E2E test and verify it fails**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts
```

Expected before implementation: the new mobile overflow assertion fails on the current four-column closing-risk row.

- [ ] **Step 3: Add mobile CSS for closing-risk rows**

Inside the existing mobile media query in `front/src/styles/globals.css`, directly after the `.admin-club-operations__summary, .admin-club-operations__grid` mobile rule, add:

```css
  .admin-club-operations__closing-risk-header {
    display: grid;
    justify-items: stretch;
  }

  .admin-club-operations__closing-risk-row {
    grid-template-columns: 1fr;
    align-items: start;
    gap: 8px;
  }

  .admin-club-operations__closing-risk-main {
    max-width: 100%;
  }

  .admin-club-operations__closing-risk-badge,
  .admin-club-operations__closing-risk-blocker,
  .admin-club-operations__closing-risk-age,
  .admin-club-operations__closing-risk-date,
  .admin-club-operations__closing-risk-repeat,
  .admin-club-operations__closing-risk-tracking {
    justify-self: start;
    max-width: 100%;
  }

  .admin-club-operations__closing-risk-row .btn {
    justify-self: stretch;
    width: 100%;
  }
```

- [ ] **Step 4: Run the targeted E2E test and verify it passes**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts
```

Expected: all tests in `admin-club-operations.spec.ts` pass, and the new mobile width assertion reports `scrollWidth <= clientWidth`.

- [ ] **Step 5: Commit Task 2**

```bash
git add front/src/styles/globals.css front/tests/e2e/admin-club-operations.spec.ts
git commit -m "fix(front): contain admin club mobile closing risks"
```

---

### Task 3: Clarify Admin Support Search States

**Files:**
- Modify: `front/features/platform-admin/route/admin-support-route.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.tsx`
- Modify: `front/features/platform-admin/ui/admin-support-workbench.test.tsx`
- Modify: `front/features/platform-admin/route/admin-support-route.test.tsx`

**Interfaces:**
- Consumes: `platformAdminSupportSearchQuery(submittedQuery, selectedClubId)`, existing workbench callbacks, and support grant mutations.
- Produces: `AdminSupportWorkbench` prop `hasSearched: boolean` that separates initial, loading, no-result, and result search rendering.

- [ ] **Step 1: Write failing workbench tests for initial and no-result states**

In `front/features/platform-admin/ui/admin-support-workbench.test.tsx`, update the default `renderWorkbench` props to include `hasSearched={false}`:

```tsx
      hasSearched={false}
```

Then add these tests:

```tsx
  it("shows an initial search prompt before the first submitted search", () => {
    renderWorkbench({ hasSearched: false, results: [], busy: false });

    expect(screen.getByText("이름 또는 이메일로 지원 대상을 검색하세요.")).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
  });

  it("shows no-results copy only after a submitted search returns no results", () => {
    renderWorkbench({ hasSearched: true, query: "없는 사용자", results: [], busy: false });

    expect(screen.getByText("검색 결과가 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("이름 또는 이메일로 지원 대상을 검색하세요.")).not.toBeInTheDocument();
  });

  it("shows a loading state while a submitted search is running", () => {
    renderWorkbench({ hasSearched: true, query: "지원", results: [], busy: true });

    expect(screen.getByText("지원 대상을 검색하는 중입니다.")).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Write a route test for the initial state**

In `front/features/platform-admin/route/admin-support-route.test.tsx`, add this expectation to the existing shell test:

```tsx
    expect(screen.getByText("이름 또는 이메일로 지원 대상을 검색하세요.")).toBeInTheDocument();
    expect(screen.queryByText("검색 결과가 없습니다.")).not.toBeInTheDocument();
```

- [ ] **Step 3: Run the support tests and verify they fail**

Run:

```bash
pnpm --dir front test -- admin-support
```

Expected before implementation: TypeScript or render failures because `hasSearched` is not a workbench prop, and the initial-state copy is not rendered.

- [ ] **Step 4: Add `hasSearched` route state**

In `front/features/platform-admin/route/admin-support-route.tsx`, add state near the existing query state:

```tsx
  const [hasSearched, setHasSearched] = useState(false);
```

Update `search()`:

```tsx
  async function search() {
    setError(null);
    setSelectedResult(null);
    setHasSearched(true);
    setSubmittedQuery(query.trim());
  }
```

Pass the prop to `AdminSupportWorkbench`:

```tsx
      hasSearched={hasSearched}
```

- [ ] **Step 5: Add workbench prop and explicit search-state rendering**

In `front/features/platform-admin/ui/admin-support-workbench.tsx`, add the prop to `AdminSupportWorkbenchProps`:

```ts
  hasSearched: boolean;
```

Replace the current results/no-results block with:

```tsx
        {props.busy && props.hasSearched ? (
          <p className="muted">지원 대상을 검색하는 중입니다.</p>
        ) : props.results.length > 0 ? (
          <div className="admin-support-workbench__results">
            {props.results.map((result) => (
              <button key={result.subjectId} type="button" onClick={() => props.onSelectResult(result)}>
                <strong>{result.displayName}</strong>
                <span>{result.maskedEmail}</span>
                <em>{result.platformAdminRole ?? result.kind}</em>
              </button>
            ))}
          </div>
        ) : props.hasSearched ? (
          <p className="muted">검색 결과가 없습니다.</p>
        ) : (
          <p className="muted">이름 또는 이메일로 지원 대상을 검색하세요.</p>
        )}
```

- [ ] **Step 6: Run the support tests and verify they pass**

Run:

```bash
pnpm --dir front test -- admin-support
```

Expected: `AdminSupportWorkbench` and `AdminSupportRoute` tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add front/features/platform-admin/route/admin-support-route.tsx front/features/platform-admin/ui/admin-support-workbench.tsx front/features/platform-admin/ui/admin-support-workbench.test.tsx front/features/platform-admin/route/admin-support-route.test.tsx
git commit -m "fix(front): clarify admin support search states"
```

---

### Task 4: Final Verification and Browser Evidence

**Files:**
- No source files should be modified in this task unless a previous task failed verification.
- Local-only browser artifacts may be written under `output/playwright/`; do not commit them.

**Interfaces:**
- Consumes: all fixes from Tasks 1-3.
- Produces: verified working tree ready for review or PR preparation.

- [ ] **Step 1: Run focused frontend tests**

```bash
pnpm --dir front test -- router-route-order
pnpm --dir front test -- admin-support
pnpm --dir front test -- admin-club-operations
```

Expected: all focused Vitest suites pass.

- [ ] **Step 2: Run targeted E2E**

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts
```

Expected: the admin club operations E2E suite passes, including the mobile overflow assertion.

- [ ] **Step 3: Run broad frontend checks**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: lint, full Vitest, and Vite build pass.

- [ ] **Step 4: Perform manual browser checks**

Use local fixture routing or an existing dev/e2e environment to inspect:

```text
/app/host/members at 1280px and 390px
/clubs/reading-sai/app/host/members at 1280px and 390px
/admin/clubs/club-1 at 390px with long closing-risk text
/admin/support before search
/admin/support after a no-result search
/admin/support after selecting a result
```

For `/admin/clubs/club-1`, evaluate:

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

Expected: host member routes render host content instead of member not-found, admin club detail has no horizontal document overflow, and admin support states match the submitted search state.

- [ ] **Step 5: Confirm no local artifacts are staged**

```bash
git status --short
```

Expected: no `output/playwright/`, screenshots, traces, or local generated files are staged. Source changes should already be committed by Tasks 1-3.
