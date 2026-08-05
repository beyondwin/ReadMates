# OAuth And Route Error Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OAuth 문서 이동 실패를 안전한 ReadMates 오류 화면으로 전환하고, 일반 404·인증·5xx 오류도 승인된 차분한 editorial UI와 복구 행동으로 통일한다.

**Architecture:** `shared/auth`의 순수 모델이 허용된 OAuth 오류 종류, 상태 분류, 안전한 `returnTo`, 사용자용 view model을 소유한다. Cloudflare Functions와 Vite 개발 proxy는 HTML 문서 이동의 비정상 응답만 같은 출처 `/auth/error`로 바꾸고, 정상 redirect와 프로그램 호출은 기존 계약을 보존한다. React auth route는 URL을 파싱해 feature UI에 계산된 view model만 전달하고, 공통 오류 presentation primitive를 기존 route error와 함께 사용한다.

**Tech Stack:** TypeScript 6, React 19, React Router 8, Vite 8 proxy, Cloudflare Pages Functions, Vitest, Testing Library, Playwright, existing ReadMates design-system CSS tokens.

## Global Constraints

- 정상 OAuth 3xx의 `Location`, 허용된 cookie, 공개 가능한 header 동작을 보존한다.
- HTML 문서 이동만 `/auth/error`로 전환하고 JSON·프로그램 호출은 현재 status/body 계약을 유지한다.
- 오류 URL에는 allowlist된 `kind`와 `safeRelativeReturnTo`를 통과한 상대 `returnTo`만 넣는다.
- `joinIntent`, invite token, OAuth `state`, provider body, upstream URL, stack trace, 내부 header, secret, raw query를 오류 URL이나 화면에 복사하지 않는다.
- Spring OAuth registration, success/failure handler, membership, join-intent 발급·소비 계약은 변경하지 않는다.
- 자동 재시도, countdown, 실제 Google 호출, 실제 가입, 운영 배포를 추가하지 않는다.
- 기존 `Modern editorial · warm neutral · ink blue` 톤, 44px action, visible focus, WCAG AA, 320px wrapping, reduced-motion을 지킨다.
- 오류 주제목에는 404·500 같은 숫자를 노출하지 않는다.

## File Structure

- Create `front/shared/auth/oauth-error.ts`: allowlisted kind, upstream status/phase 분류, HTML 문서 탐색 판별, 안전한 오류 location, OAuth 오류 view model.
- Create `front/shared/auth/oauth-error.test.ts`: 순수 분류, 안전한 return path, 민감 query 비노출, copy/action 계약.
- Create `front/functions/_shared/oauth-error-response.ts`: Cloudflare용 upstream/error response 변환과 cookie/header 보존.
- Modify `front/functions/oauth2/authorization/[[registrationId]].ts`: authorization start fetch와 invalid route를 공통 변환기로 감싼다.
- Modify `front/functions/login/oauth2/code/[[registrationId]].ts`: callback fetch와 invalid route를 공통 변환기로 감싼다.
- Modify `front/tests/unit/cloudflare-oauth-proxy.test.ts`: document navigation 404/429/500/503/network, JSON 유지, 정상 redirect/cookie, secret/query 비노출을 검증한다.
- Create `front/shared/auth/oauth-vite-proxy.ts`: Vite proxy `proxyRes`/`error` event에서 HTML 탐색만 같은 오류 route로 응답한다.
- Create `front/tests/unit/vite-oauth-proxy.test.ts`: fake proxy event와 Node response를 통해 local proxy 분기와 정상 pass-through를 검증한다.
- Modify `front/vite.config.ts`: authorization/callback proxy에 공통 configure hook을 연결한다.
- Create `front/shared/ui/error-experience.tsx`: 공통 오류 문서 레이아웃과 action presentation primitive.
- Modify `front/shared/ui/route-error.tsx`: 401/403/404/409/410/429/500/503 분류와 공통 primitive 사용.
- Create `front/features/auth/ui/oauth-error-page.tsx`: 계산된 OAuth view model을 렌더링하는 prop-driven UI.
- Create `front/features/auth/route/oauth-error-route.tsx`: query 파싱, metadata, fixed-kind observability, UI prop 조립.
- Create `front/src/pages/oauth-error.tsx`: feature route compatibility shell.
- Modify `front/src/app/routes/auth.tsx`: public `/auth/error` lazy route 등록.
- Modify `front/src/styles/globals.css`: 승인된 warm-paper/ink editorial 오류 화면, responsive actions, focus/wrapping 스타일.
- Modify `front/tests/unit/route-error-metadata.test.tsx`: 일반 오류 copy/action/semantics 회귀 검증.
- Modify `front/tests/unit/spa-router.test.tsx`: auth error route, allowlist fallback, unsafe return path 비노출 검증.
- Modify `front/tests/e2e/guest-browsing.spec.ts`: 멤버 시작 OAuth 404가 JSON 대신 오류 UI로 이어지는 브라우저 흐름과 반응형 상태 검증.

---

### Task 1: Safe OAuth Error Contract

**Files:**
- Create: `front/shared/auth/oauth-error.ts`
- Test: `front/shared/auth/oauth-error.test.ts`

**Interfaces:**
- Consumes: `safeRelativeReturnTo(rawValue: string | null | undefined): string | null` from `front/shared/auth/login-return.ts`.
- Produces: `OAuthErrorKind`, `OAuthProxyPhase`, `classifyOAuthError(status: number | null, phase: OAuthProxyPhase): OAuthErrorKind`, `isHtmlDocumentNavigation(headers: Pick<Headers, "get"> | Record<string, string | string[] | undefined>): boolean`, `oauthErrorLocation(input: { requestUrl: string; status: number | null; phase: OAuthProxyPhase }): string`, `oauthErrorViewModel(kindValue: string | null, returnToValue: string | null): OAuthErrorViewModel`.

- [ ] **Step 1: Write failing pure-model tests**

  Add table tests with literal expectations: authorization `404 -> oauth_unavailable`, `400 -> request_invalid`, `401 -> session_required`, `403 -> access_denied`, `409/410 -> request_expired`, `429 -> rate_limited`, `500 -> internal_error`, `502/503/504/null -> service_unavailable`, and other statuses -> `unexpected`. Assert `Accept: text/html` document requests are eligible while `application/json` and `sec-fetch-dest: empty` are not.

- [ ] **Step 2: Write failing safety and view-model tests**

  Assert this input:

  ```text
  /oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&joinClub=reading-sai&joinIntent=opaque-placeholder&state=provider-placeholder
  ```

  produces exactly:

  ```text
  /auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Freading-sai%2Fapp
  ```

  Assert external, auth-loop, malformed, and root `returnTo` values are omitted. Assert unknown `kind` becomes `unexpected`, and literal headings/actions distinguish page 404 from OAuth unavailable and 500/503 recovery.

- [ ] **Step 3: Run the focused test and verify RED**

  Run: `corepack pnpm --dir front exec vitest run shared/auth/oauth-error.test.ts`

  Expected: FAIL because `oauth-error.ts` and its exports do not exist.

- [ ] **Step 4: Implement the minimal pure model**

  Define the fixed union exactly as `oauth_unavailable | request_invalid | session_required | access_denied | request_expired | rate_limited | internal_error | service_unavailable | unexpected`. Build query strings only with `URLSearchParams`, classify `null` as service unavailable, and derive the primary action from validated `returnTo` with `/` fallback. Keep all copy literals in the model so UI never renders raw query/error text.

- [ ] **Step 5: Run the focused test and verify GREEN**

  Run: `corepack pnpm --dir front exec vitest run shared/auth/oauth-error.test.ts`

  Expected: PASS with no console warnings.

- [ ] **Step 6: Commit the contract**

  ```bash
  git add front/shared/auth/oauth-error.ts front/shared/auth/oauth-error.test.ts
  git commit -m "feat(auth): define safe OAuth error contract"
  ```

### Task 2: Cloudflare And Vite OAuth Navigation Translation

**Files:**
- Create: `front/functions/_shared/oauth-error-response.ts`
- Create: `front/shared/auth/oauth-vite-proxy.ts`
- Create: `front/tests/unit/vite-oauth-proxy.test.ts`
- Modify: `front/functions/oauth2/authorization/[[registrationId]].ts`
- Modify: `front/functions/login/oauth2/code/[[registrationId]].ts`
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts`
- Modify: `front/vite.config.ts`

**Interfaces:**
- Consumes: Task 1 `classifyOAuthError`, `isHtmlDocumentNavigation`, `oauthErrorLocation`; existing `copyUpstreamHeaders`, `requestIdForUpstream`, `bffErrorResponse`.
- Produces: `oauthErrorResponseForUpstream(request: Request, upstream: Response, phase: OAuthProxyPhase, requestId: string): Response | null`, `oauthNetworkErrorResponse(request: Request, phase: OAuthProxyPhase, requestId: string): Response`, `configureOAuthNavigationProxy(phase: OAuthProxyPhase): ProxyOptions["configure"]`.

- [ ] **Step 1: Add failing Cloudflare behavior tests**

  Extend `cloudflare-oauth-proxy.test.ts` so an HTML authorization 404 returns `302` with `/auth/error?kind=oauth_unavailable&returnTo=...`; HTML 429/500/503 and callback failures map to their fixed kinds; a rejected `fetch` maps to `service_unavailable`; JSON 404 keeps its original JSON status/body. Assert upstream/body secrets, `joinIntent`, `state`, and invite parameters never appear in `Location`. Keep existing normal 302/307 and multi-cookie assertions unchanged.

- [ ] **Step 2: Add failing Vite proxy tests**

  Use an `EventEmitter` proxy double plus Node `PassThrough` request/response fixtures. Assert the `proxyRes` hook sends a 302 safe location for an HTML authorization 404, passes a JSON 404 status/body through, and the `error` hook sends `service_unavailable` only for HTML document requests. The production mutation each test catches is a missing or overly broad navigation translation branch.

- [ ] **Step 3: Run proxy tests and verify RED**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-oauth-proxy.test.ts tests/unit/vite-oauth-proxy.test.ts`

  Expected: FAIL because the new Cloudflare responses still expose upstream errors and the Vite hook does not exist.

- [ ] **Step 4: Implement Cloudflare response translation**

  Build a 302 response with same-origin relative `Location`, sanitized copied headers, preserved `Set-Cookie`, retained request ID, and no upstream body. Wrap both fetch calls in `try/catch`; document navigation gets the safe redirect, programmatic network failure gets the existing sanitized BFF 502 error. Invalid registration IDs remain JSON for programmatic calls and become `request_invalid` for document navigation.

- [ ] **Step 5: Implement Vite proxy translation**

  Attach `proxyRes` before Vite's default forwarding and translate only eligible non-redirect error responses. Drain the upstream body after ending the local redirect. Attach an `error` listener that ends eligible document requests before Vite's default 502 handler; leave non-document errors for Vite. Preserve normal response status, headers, body, cookies, and location.

- [ ] **Step 6: Wire both Vite OAuth routes**

  Add `configure: configureOAuthNavigationProxy("authorization")` to `/oauth2/authorization` and `configure: configureOAuthNavigationProxy("callback")` to `/login/oauth2/code`; do not alter API proxy headers or rewrites.

- [ ] **Step 7: Run proxy tests and verify GREEN**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/cloudflare-oauth-proxy.test.ts tests/unit/vite-oauth-proxy.test.ts`

  Expected: PASS; existing normal redirect/cookie/header tests remain green.

- [ ] **Step 8: Run frontend boundary test**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts`

  Expected: PASS; the new modules respect shared/functions boundaries.

- [ ] **Step 9: Commit proxy behavior**

  ```bash
  git add front/functions/_shared/oauth-error-response.ts 'front/functions/oauth2/authorization/[[registrationId]].ts' 'front/functions/login/oauth2/code/[[registrationId]].ts' front/shared/auth/oauth-vite-proxy.ts front/tests/unit/cloudflare-oauth-proxy.test.ts front/tests/unit/vite-oauth-proxy.test.ts front/vite.config.ts
  git commit -m "fix(auth): route OAuth navigation failures safely"
  ```

### Task 3: Approved Error UI And Public Auth Route

**Files:**
- Create: `front/shared/ui/error-experience.tsx`
- Create: `front/features/auth/ui/oauth-error-page.tsx`
- Create: `front/features/auth/route/oauth-error-route.tsx`
- Create: `front/src/pages/oauth-error.tsx`
- Modify: `front/shared/ui/route-error.tsx`
- Modify: `front/src/app/routes/auth.tsx`
- Modify: `front/src/styles/globals.css`
- Modify: `front/tests/unit/route-error-metadata.test.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`

**Interfaces:**
- Consumes: Task 1 `oauthErrorViewModel`; existing `PageMetadataHead`, `recordFrontendRuntimeError`, `scopedAppLinkTarget`.
- Produces: `ErrorExperience(props: ErrorExperienceProps)`, `OAuthErrorPage({ view }: { view: OAuthErrorViewModel })`, default `OAuthErrorRoute`, route `/auth/error`.

- [ ] **Step 1: Add failing component and route assertions**

  In `route-error-metadata.test.tsx`, assert semantic `<main>` and `<h1>`, 401 copy, distinct 404 copy, 500 internal-error copy, 503 connection copy, nonnumeric headings, scoped recovery links, and `.rm-error-experience`/action hooks. In `spa-router.test.tsx`, render `/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Freading-sai%2Fapp`, assert heading `로그인을 시작할 수 없습니다.`, primary club return link, secondary public home, metadata, and absence of raw secret-like query values. Add unknown kind and unsafe external return cases.

- [ ] **Step 2: Run UI tests and verify RED**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/route-error-metadata.test.tsx tests/unit/spa-router.test.tsx`

  Expected: FAIL because the route and shared presentation primitive do not exist and current 401/500 copy is generic.

- [ ] **Step 3: Load the UI craft floor immediately before editing**

  Read the complete Impeccable `reference/craft-floor.md`, then apply its bans and quality floor to the already-approved mockup direction. Do not rerun the Impeccable context loader in this session.

- [ ] **Step 4: Implement shared error presentation**

  Render a restrained archive folio, eyebrow, editorial h1, body, optional reassurance, primary action, optional secondary action, and small help note. Use semantic links/buttons from props, no API/router parsing in UI, no red warning panel, no icon library, and no inline layout styles.

- [ ] **Step 5: Refactor general route errors onto the primitive**

  Preserve loader retry behavior and scoped paths. Add explicit 401, 500, and 502/503/504 branches while retaining 403/404/409/410/429 behavior. Keep public retry as an explicit button only when a revalidator exists; never auto-retry.

- [ ] **Step 6: Implement `/auth/error` route**

  Parse only `kind` and `returnTo`, call the pure model, set a fixed page title/description, record only the allowlisted kind once, and pass the view model into prop-driven UI. Register it before the public catch-all so it requires no auth provider or server request.

- [ ] **Step 7: Implement approved responsive CSS**

  Add a warm paper canvas, narrow reading measure, ink rule/folio detail, restrained surface border, editorial title, readable sans body, 44px actions, visible `:focus-visible`, full-width stacked actions below the mobile breakpoint, 320px-safe overflow wrapping, and reduced-motion-safe behavior. Reuse existing tokens; add no gradient, glow, glass, nested cards, stock art, or broad global token changes.

- [ ] **Step 8: Run UI tests and verify GREEN**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/route-error-metadata.test.tsx tests/unit/spa-router.test.tsx`

  Expected: PASS with no React/router warnings.

- [ ] **Step 9: Run the Impeccable detector once**

  Run the active Impeccable installation's `scripts/detect.mjs --json` against `front/shared/ui/error-experience.tsx`, `front/shared/ui/route-error.tsx`, `front/features/auth/ui/oauth-error-page.tsx`, `front/features/auth/route/oauth-error-route.tsx`, and `front/src/styles/globals.css`. The executor-specific skill installation path must not be persisted in this public plan.

  Expected: no unresolved blocking design findings; fix all legitimate findings in one batch.

- [ ] **Step 10: Commit the UI slice**

  ```bash
  git add front/shared/ui/error-experience.tsx front/shared/ui/route-error.tsx front/features/auth/ui/oauth-error-page.tsx front/features/auth/route/oauth-error-route.tsx front/src/pages/oauth-error.tsx front/src/app/routes/auth.tsx front/src/styles/globals.css front/tests/unit/route-error-metadata.test.tsx front/tests/unit/spa-router.test.tsx
  git commit -m "feat(front): add editorial error recovery screens"
  ```

### Task 4: Browser Evidence And Full Frontend Gates

**Files:**
- Modify: `front/tests/e2e/guest-browsing.spec.ts`

**Interfaces:**
- Consumes: Task 2 safe OAuth error redirect and Task 3 `/auth/error` route.
- Produces: browser regression evidence for the guest member-start failure and responsive error states.

- [ ] **Step 1: Add failing browser flow**

  Intercept the OAuth start as a fixture redirect to `/auth/error?kind=oauth_unavailable&returnTo=%2Fclubs%2Fsample-book-club%2Fapp`, click `멤버로 시작`, and assert the ReadMates heading/body/actions are visible while JSON/technical/provider text is absent. At 320px and 1366px, assert no horizontal overflow, action height at least 44px, and visible focus outline on the primary action.

- [ ] **Step 2: Run the focused E2E regression**

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/guest-browsing.spec.ts --grep "OAuth 오류"`

  Expected: PASS against Tasks 1–3; this final integration test adds no new production behavior, while each production branch was already introduced through a witnessed unit or route RED/GREEN cycle.

- [ ] **Step 3: Complete the minimal E2E fixture wiring**

  Reuse existing guest fixtures and join-intent interception. Do not add live provider credentials or call Google.

- [ ] **Step 4: Run focused E2E GREEN**

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/guest-browsing.spec.ts --grep "OAuth 오류"`

  Expected: PASS at desktop and mobile viewport assertions.

- [ ] **Step 5: Perform one batched visual inspection**

  Capture desktop and mobile screenshots for general 404, OAuth unavailable, and 500/503 representative states in one batch. Check approved hierarchy, action order, wrapping, focus, and absence of horizontal overflow. Apply at most one consolidated correction batch, then one confirmation batch.

- [ ] **Step 6: Run canonical frontend gates**

  Run in order:

  ```bash
  corepack pnpm --dir front lint
  corepack pnpm --dir front test
  corepack pnpm --dir front build
  corepack pnpm --dir front test:e2e
  git diff --check origin/main...HEAD
  ```

  Expected: all commands exit 0. Report any environmental skip exactly; do not label a skipped command as passed.

- [ ] **Step 7: Commit browser evidence**

  ```bash
  git add front/tests/e2e/guest-browsing.spec.ts
  git commit -m "test(auth): cover OAuth error recovery flow"
  ```

- [ ] **Step 8: Request independent code review**

  Use the required review workflow against `origin/main...HEAD`. Address only verified findings, rerun the smallest affected test after each fix batch, and then rerun the final canonical gate affected by the fix.

## Acceptance Matrix Handoff

- Selected `BFF or OAuth`: same-origin document translation, normal redirect/cookie preservation, safe return path, raw state/join-intent/header/body non-disclosure; evidence is shared-model tests, Cloudflare/Vite proxy tests, and focused browser flow.
- Selected `UI or runtime state`: 401, 403, 404, 409/410, 429, 500/503, desktop/mobile, wrapping, focus, action hierarchy; evidence is component/route tests plus batched browser screenshots.
- Selected `Club context`: only validated relative club `returnTo` may drive recovery; evidence is pure-model and router tests.
- Excluded actor authorization: no authz decision, role gate, or protected write changes.
- Excluded persistence/migration, guest DTO privacy, cursor collection, and async/provider side effects: no schema, serialized DTO, collection, queue, provider SDK, or live provider call changes.

## Non-Goals And Residual Validation Boundary

- No server source or migration change; server CI and Testcontainers are not required unless implementation discovers a server contract change.
- No production deploy, real OAuth credential, real Google redirect, or real membership mutation validation.
- Local tests prove Vite and Cloudflare behavior from fixtures; production Cloudflare routing remains a post-deploy smoke concern outside this requested merge.
