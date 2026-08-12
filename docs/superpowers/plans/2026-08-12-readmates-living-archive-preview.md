# ReadMates Living Archive Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 Living Archive Shelf 시안을 기존 홈과 분리된 `/living-archive-preview`에서 실제 공개 데이터로 충실하게 재현한다.

**Architecture:** `front/src/app/routes/public.tsx`의 public route tree 안에 전용 shell을 가진 preview branch를 추가하고, 기존 `PublicRouteLayout` branch는 그대로 유지한다. Loader와 TanStack Query cache는 현재 공개 club query를 재사용하며, 순수 model이 서가·최신 회차·독자 흔적을 만든 뒤 route가 query data를 UI props로 조립한다. Preview UI는 전용 CSS와 component test를 가지며 서버, BFF, 공개 홈 컴포넌트는 변경하지 않는다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, TypeScript, CSS, Vitest/Testing Library, Playwright component test와 E2E.

## Global Constraints

- 구현 URL은 `/living-archive-preview`이며 `/`, `/clubs/:slug`의 현재 화면을 변경하지 않는다.
- 승인 기준 이미지는 구현 handoff로 제공되는 `1487 x 1058` PNG와 SHA-256 `5300d886fcc62edb8bd2c1b4a71dd3a0e58e39d6701cb4effa1f000fdd8a02ee`다. 이미지를 hero raster로 사용하지 않고 DOM/CSS로 재구성한다.
- desktop에서 thin header, 2행 문장, full-width clothbound shelf, 앞으로 나온 최신 회차, 최대 3개 독자 흔적, 밝은 다음 자리, 하단 2분할 strip을 동일한 순서와 비례로 구현한다.
- 제목과 본문은 carbon ink 계열이며 초록은 책등 소재색에만 사용한다.
- 공개 API에 없는 회차, 멤버, 후기, 통계는 생성하지 않는다. 독자 흔적은 공개 session detail에 존재하는 one-liner/highlight만 사용한다.
- 프리뷰는 공용 내비게이션과 footer에 노출하지 않고 `robots=noindex,nofollow`를 route 수명 동안만 설치한다.
- mobile은 desktop을 가로 축소하거나 horizontal scroll하지 않고 문서 흐름으로 재조판한다.
- `prefers-reduced-motion: reduce`에서는 최종 상태를 즉시 표시하고 transform/transition 기반 장식 모션을 제거한다.
- 서버 API, BFF, auth, invitation, database, migration, 현재 public URL policy를 변경하지 않는다.
- 신규 단위 테스트는 source와 co-locate하고, 기존 fixture나 공개 홈 테스트는 이동하지 않는다.

## File Structure

- `front/src/app/routes/public.tsx`: preview branch와 기존 public layout branch를 함께 조립한다.
- `front/src/pages/living-archive-preview.tsx`: feature route를 re-export하는 얇은 page shell이다.
- `front/features/public/model/living-archive-preview-model.ts`: 공개 club/session data를 shelf view model로 순수 변환한다.
- `front/features/public/model/living-archive-preview-model.test.ts`: 빈 상태, 최신 회차, 독자 흔적 제한을 검증한다.
- `front/features/public/route/living-archive-preview-route.tsx`: loader data와 club/session query를 조립한다.
- `front/features/public/route/living-archive-preview-route.test.tsx`: noindex와 query-driven render를 검증한다.
- `front/features/public/ui/living-archive-preview-head.tsx`: preview 전용 metadata와 robots tag의 설치·정리를 담당한다.
- `front/features/public/ui/living-archive-preview-page.tsx`: 승인된 정보 구조와 semantic DOM을 렌더링한다.
- `front/features/public/ui/living-archive-preview.css`: 전용 색, 활자, shelf, responsive, motion을 소유한다.
- `front/features/public/ui/living-archive-preview-page.ct.tsx`: desktop/mobile/reduced-motion layout evidence를 검증한다.
- `front/tests/e2e/living-archive-preview.spec.ts`: 독립 URL 접근과 기존 홈 비변경을 브라우저에서 검증한다.

---

### Task 1: 격리 route, metadata, data model

**Files:**
- Create: `front/features/public/model/living-archive-preview-model.ts`
- Create: `front/features/public/model/living-archive-preview-model.test.ts`
- Create: `front/features/public/ui/living-archive-preview-head.tsx`
- Create: `front/features/public/ui/living-archive-preview-head.test.tsx`
- Create: `front/features/public/route/living-archive-preview-route.tsx`
- Create: `front/features/public/route/living-archive-preview-route.test.tsx`
- Create: `front/features/public/ui/living-archive-preview-page.tsx`
- Create: `front/src/pages/living-archive-preview.tsx`
- Modify: `front/src/app/routes/public.tsx`
- Modify: `front/src/app/router-route-order.test.tsx`

**Interfaces:**
- Consumes: `PublicClubResponse`, `PublicSessionDetailResponse`, `publicClubLoaderFactory(queryClient)`, `publicClubQuery(clubSlug)`, `publicSessionQuery(clubSlug, sessionId)`.
- Produces: `buildLivingArchivePreviewModel(club, session): LivingArchivePreviewModel`, `LivingArchivePreviewHead`, `LivingArchivePreviewRoute`, exact route `/living-archive-preview`.

- [ ] **Step 1: Write failing model and route isolation tests**

Model tests must prove that recent sessions are preserved in API order, `latest` is the first item or `null`, `readerTraces` contains at most three public one-liners/highlights, and an empty club creates no fake spines or people. Route-order tests must prove `/living-archive-preview` matches the preview route while `/` and `/clubs/reading-sai` still end in their existing public-home route.

```ts
expect(buildLivingArchivePreviewModel(club, detail).readerTraces).toHaveLength(3);
expect(routePaths("/living-archive-preview")).toContain("/living-archive-preview");
expect(routePaths("/")).not.toContain("/living-archive-preview");
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/public/model/living-archive-preview-model.test.ts \
  features/public/ui/living-archive-preview-head.test.tsx \
  features/public/route/living-archive-preview-route.test.tsx \
  src/app/router-route-order.test.tsx
```

Expected: FAIL because the preview modules and route do not exist.

- [ ] **Step 3: Implement the pure view model without fabricated data**

The produced types must have stable, presentation-ready fields:

```ts
export type LivingArchiveReaderTrace = {
  id: string;
  index: number;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
  text: string;
  kind: "oneLiner" | "highlight";
};

export type LivingArchivePreviewModel = {
  clubName: string;
  sessions: PublicSessionListItem[];
  latest: PublicSessionListItem | null;
  latestDetail: PublicSessionDetailResponse | null;
  readerTraces: LivingArchiveReaderTrace[];
};
```

Use the first `recentSessions` item as `latest`. Prefer `latestDetail.oneLiners`, then fill remaining trace slots with highlights that have an author. Slice the final list to three. Do not synthesize missing identities or sessions.

- [ ] **Step 4: Implement preview-only head lifecycle**

`LivingArchivePreviewHead` must set the title/description using `PageMetadataHead`, install one managed robots element, reuse an existing matching preview element on rerender, and remove only its own element on unmount:

```html
<meta name="robots" content="noindex,nofollow" data-readmates-living-archive-preview="true">
```

- [ ] **Step 5: Implement route data orchestration and exact route branch**

`LivingArchivePreviewRoute` reads `PublicClubRouteData`, subscribes to the club query, uses an `enabled` session query keyed by the latest session id, builds the model, and renders a minimal `LivingArchivePreviewPage` shell. The shell accepts `{ model, publicBasePath }`; Task 2 replaces its intentionally incomplete markup after a RED test. `publicRoutes()` becomes a pathless parent with two children: the preview exact route with no `PublicRouteLayout`, and the existing `PublicRouteLayout` with all current children unchanged. Keep the existing `RouteErrorBoundary variant="public"` and preview `PublicRouteError`/hydrate fallback behavior.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 7: Run architecture boundary test and commit**

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
git diff --check
git add front/src/app/routes/public.tsx front/src/app/router-route-order.test.tsx \
  front/src/pages/living-archive-preview.tsx front/features/public/model \
  front/features/public/route front/features/public/ui/living-archive-preview-page.tsx \
  front/features/public/ui/living-archive-preview-head.tsx \
  front/features/public/ui/living-archive-preview-head.test.tsx
git commit -m "feat: isolate living archive preview route"
```

Expected: focused tests PASS and commit contains no current public-home UI change.

---

### Task 2: 승인 시안의 desktop visual composition

**Files:**
- Modify: `front/features/public/ui/living-archive-preview-page.tsx`
- Create: `front/features/public/ui/living-archive-preview.css`
- Create: `front/features/public/ui/living-archive-preview-page.test.tsx`
- Modify: `front/features/public/route/living-archive-preview-route.tsx`

**Interfaces:**
- Consumes: `LivingArchivePreviewModel`, `publicBasePath` from Task 1.
- Produces: `LivingArchivePreviewPage({ model, publicBasePath })` with semantic header, shelf, detail strip, empty-state variant, and class hooks used by Task 3 CT.

- [ ] **Step 1: Write semantic rendering tests**

Tests must assert the exact fixed copy, one `h1`, latest record link, records link, one spine per public session, up to three reader traces, and no fabricated spine/portrait in empty state.

```tsx
expect(screen.getByRole("heading", { level: 1, name: "책 사이에 사람이 남습니다" })).toBeVisible();
expect(screen.getByText("서로 다른 문장이 한 권의 기억이 됩니다")).toBeVisible();
expect(screen.getAllByTestId("archive-spine")).toHaveLength(model.sessions.length);
expect(screen.queryAllByTestId("reader-trace")).toHaveLength(model.readerTraces.length);
```

- [ ] **Step 2: Run component unit test and confirm RED**

```bash
corepack pnpm --dir front exec vitest run features/public/ui/living-archive-preview-page.test.tsx
```

Expected: FAIL because the Task 1 page shell does not yet implement the approved composition.

- [ ] **Step 3: Build exact semantic composition**

The DOM order must be:

```text
preview header
brand statement and subtitle
continuous shelf
  historical cloth spines
  pulled-open latest volume with visible record
  reader trace layer
  illuminated next slot
lower editorial strip
  archive index
  latest meeting
  invitation boundary
```

The header contains `ReadMates`, `읽는사이`, `공개 기록 보기`, and a menu glyph button or label with accessible name. Do not render the normal `TopNav` or `PublicFooter` on this route.

- [ ] **Step 4: Implement design tokens and desktop proportions**

Use preview-scoped CSS custom properties with exact approved color roles:

```css
.living-archive-preview {
  --lap-bone: #f5f2eb;
  --lap-ink: #171817;
  --lap-muted: #66635d;
  --lap-cobalt: #315bce;
  --lap-vermilion: #d65a3a;
  --lap-brass: #b38a45;
}
```

At a `1487 x 1058` viewport keep header near 9%, statement origin near `4%/11%`, shelf top near `36.8%`, shelf bottom near `73.2%`, latest volume center near `56%`, next slot center near `82%`, and lower strip start near `77.8%`. Text color remains carbon; green is restricted to cloth spines. Implement subtle cloth grain with CSS pseudo-elements and low-opacity repeating texture; do not add a full-screen raster background.

- [ ] **Step 5: Implement honest empty and partial-data states**

When there is no latest session, keep the shelf silhouette and the illuminated next slot but render no historical spine, member trace, quote, date, or fake book. Show a calm public-record-empty message in the lower strip. When session detail is unavailable, render the latest list-item summary only and no reader trace.

- [ ] **Step 6: Run unit tests and static quality checks**

```bash
corepack pnpm --dir front exec vitest run \
  features/public/ui/living-archive-preview-page.test.tsx \
  features/public/route/living-archive-preview-route.test.tsx
corepack pnpm --dir front lint
git diff --check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/public/ui/living-archive-preview-page.tsx \
  front/features/public/ui/living-archive-preview.css \
  front/features/public/ui/living-archive-preview-page.test.tsx \
  front/features/public/route/living-archive-preview-route.tsx
git commit -m "feat: render living archive preview"
```

---

### Task 3: Responsive composition, meaningful motion, visual fidelity evidence

**Files:**
- Create: `front/features/public/ui/living-archive-preview-page.ct.tsx`
- Modify: `front/features/public/ui/living-archive-preview-page.tsx`
- Modify: `front/features/public/ui/living-archive-preview.css`

**Interfaces:**
- Consumes: Task 2 class hooks and component props.
- Produces: desktop `1487 x 1058`, tablet, `320 x 720`, `200%` zoom, reduced-motion visual behavior with no horizontal overflow.

- [ ] **Step 1: Write component tests for geometry and overflow**

The CT mounts the same public-safe model at desktop and mobile sizes. Desktop assertions compare normalized bounding boxes to the spec tolerances; mobile assertions require every section to fit the viewport, a document-flow shelf, touch-sized links, and no horizontal overflow.

```ts
expect(Math.abs(shelf.top / 1058 - 0.368)).toBeLessThanOrEqual(16 / 1058);
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
```

- [ ] **Step 2: Run CT and confirm RED**

```bash
corepack pnpm --dir front exec playwright test \
  --config=playwright-ct.config.ts \
  features/public/ui/living-archive-preview-page.ct.tsx
```

Expected: FAIL until responsive geometry and CT hooks are complete.

- [ ] **Step 3: Implement responsive editorial reflow**

Desktop keeps the panoramic shelf. Below the established tablet breakpoint, reorder to statement, pulled latest volume, compact vertical archive index, next slot, lower strip. Never create an overflow-hidden desktop shelf that makes content unreachable. Preserve Korean/English wrapping at `320px` and `200%` zoom.

- [ ] **Step 4: Add only meaningful motion**

Use `transform` and `opacity` for a one-time shelf settle, pulled-volume movement, connection-line draw, and CTA underline. Control feedback stays `120–220ms`; section/hero motion stays below `700ms`; no autoplay loop, scroll hijacking, continuous parallax, blur animation, or content-delaying transition.

```css
@media (prefers-reduced-motion: reduce) {
  .living-archive-preview *,
  .living-archive-preview *::before,
  .living-archive-preview *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Capture and compare visual evidence**

Run CT at `1487 x 1058` and `320 x 720`, save temporary screenshots outside tracked source, compare desktop against the approved PNG by the contract coordinates, and manually inspect header, typography, shelf continuity, latest-volume center, next-slot center, lower-strip start, and text color. The approved PNG remains the comparison baseline; do not accept a new screenshot merely because it matches the implementation.

- [ ] **Step 6: Run CT GREEN and commit**

```bash
corepack pnpm --dir front exec playwright test \
  --config=playwright-ct.config.ts \
  features/public/ui/living-archive-preview-page.ct.tsx
git diff --check
git add front/features/public/ui/living-archive-preview-page.tsx \
  front/features/public/ui/living-archive-preview.css \
  front/features/public/ui/living-archive-preview-page.ct.tsx
git commit -m "test: verify living archive visual fidelity"
```

Expected: desktop/mobile/reduced-motion cases PASS.

---

### Task 4: Browser isolation proof and final frontend gates

**Files:**
- Create: `front/tests/e2e/living-archive-preview.spec.ts`
- Modify: only preview files if browser evidence reveals a defect

**Interfaces:**
- Consumes: completed preview route.
- Produces: browser proof that the preview is reachable only by direct URL, current public home remains unchanged, navigation does not expose preview, noindex cleans up on route exit, and key CT geometry is preserved in the built app.

- [ ] **Step 1: Write E2E isolation scenario**

The scenario mocks the same public API contracts used by existing public E2E tests, opens `/living-archive-preview`, checks the approved hero copy and robots tag, navigates to `/`, verifies the existing `읽는사이` home heading and removal of the preview robots tag, then checks top and footer navigation contain no link to `/living-archive-preview`.

- [ ] **Step 2: Run focused E2E and fix only preview defects**

```bash
corepack pnpm --dir front exec playwright test tests/e2e/living-archive-preview.spec.ts
```

Expected: PASS. Do not alter existing home design to satisfy preview assertions.

- [ ] **Step 3: Run focused regression set**

```bash
corepack pnpm --dir front exec vitest run \
  features/public/model/living-archive-preview-model.test.ts \
  features/public/ui/living-archive-preview-head.test.tsx \
  features/public/ui/living-archive-preview-page.test.tsx \
  features/public/route/living-archive-preview-route.test.tsx \
  src/app/router-route-order.test.tsx \
  tests/unit/public-home.test.tsx \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run canonical frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
git diff --check
```

Expected: PASS. If the known unrelated host-session-editor test times out again, rerun the exact test once, retain both outputs, and report it as a suite-level flake rather than hiding the failure.

- [ ] **Step 5: Review tracked scope and commit final fixes**

```bash
git status --short --branch --untracked-files=all
git diff --name-only 2c229500..HEAD
git diff -- front/features/public front/src/app/routes/public.tsx front/src/pages/living-archive-preview.tsx front/tests/e2e/living-archive-preview.spec.ts
```

The diff must contain no generated screenshots, build output, private paths/data, server/BFF changes, current home component/CSS changes, or nav/footer links to the preview. Commit only if Task 4 introduced a tracked test or fix:

```bash
git add front/tests/e2e/living-archive-preview.spec.ts front/features/public front/src/app/routes/public.tsx
git commit -m "test: prove living archive preview isolation"
```

## Acceptance Matrix Selection

- Selected row: `UI or runtime state` because loading, empty, error, wrapping, desktop, mobile, focus, and reduced-motion behavior change on a new public route.
- Selected row: `Guest/public exposure` only for repository proof that the existing public API projection is reused and no new public data field or policy is added.
- Adjacent `Club context`, auth/BFF, server, persistence, deploy rows are excluded because this plan uses the baseline public club loader and changes no trusted context, backend contract, database, or deployment configuration.

## Non-goals and release boundary

- Do not apply the preview to `/` or `/clubs/:slug` in this plan.
- Do not add the preview to public navigation, sitemap, footer, robots allowlist, or marketing links.
- Do not commit generated images or screenshots.
- Do not push, merge, deploy, tag, or mutate production state without a separate user request.
