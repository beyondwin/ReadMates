# B4 — Shared member and host club shell report

Status: `DONE_WITH_CONCERNS`

ADR impact: `update`. This task implements and validates the shared-shell and route-authority portions of Proposed ADR-0019 and Proposed ADR-0026. Their status is intentionally not promoted inside this isolated task; the program integration pass must update the ADR text/status only after all dependent tasks and active architecture agree.

## Implementation

- Added one presentation-only `AppClubShell` and `WorkspaceSelector` with shared member/host DOM regions: desktop spine, mobile spine, mobile context, content, and mobile primary navigation. Authorized items and app-owned targets vary; the interaction model does not.
- Moved club selection into the global spine and kept it distinct from workspace selection. Both are named native disclosures with named link destinations and current semantics. The mobile selector triggers/items have at least 44px targets.
- Kept all href, history, route ownership, club-switch authority, record-origin continuity, mobile title, and Back-target decisions in `src/app`. The new shared model and production shell/selector do not import React Router, `src/app`, or feature modules.
- Made the four member and host destinations explicit presentation data. The shell no longer fetches current-session identity to compute stable navigation, and platform-admin navigation remains outside the club workspace navigation.
- Added the single authenticated `AppRouteSecurityController` extension point. Workspace switching survives route-layout remount through a session-scoped transition marker, announces the destination, updates the document title, and focuses the route heading. Empty announcements do not create a competing `role=status` node.
- Preserved the existing account control and settings/notification/logout behavior by rendering the same account-controller spine on desktop and mobile.
- Normalized the global breakpoint in `globals.css` and `mobile.css`: mobile ends at 767px and tablet/desktop begins at 768px. Visibility helpers, primary navigation, selectors, sticky mobile context, content clearance, scroll margin, bottom navigation, and safe-area calculations follow that single boundary.
- Updated the responsive/auth browser fixtures to the approved B2/B3 contracts: stable meeting-list navigation, dedicated record ownership, the B3 meeting-list empty state, and activation without automatic current-session participant enrollment.

## TDD evidence

Initial RED:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx src/app/app-route-security-controller.test.tsx`

- Failed as intended: the three new shell/selector/security-controller suites could not resolve their missing modules; 86 existing layout/navigation tests passed.

Final focused GREEN:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx src/app/app-route-security-controller.test.tsx tests/unit/typography-contract.test.ts`

- PASS: 6 files, 109 tests. The task-prescribed five files account for 96 passing tests; the typography contract was added to the final gate after the detector found an 11px selector label during self-review.

Additional layout regression:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/spa-layout.test.tsx`

- PASS: 1 file, 12 tests during implementation, covering unscoped/scoped compatibility routes, club/workspace targets, account controls, and stable host navigation.

## Component and browser evidence

Exact component gate:

`npx --yes corepack@0.35.0 pnpm --dir front test:ct`

- PASS on the completed shared-shell implementation: 62/62 Playwright component tests, one Docker worker, including exact 767px and 768px shell tests.
- The first exact attempt was terminated by `SIGKILL` before test execution while the Docker VM was constrained to about 1.9 GiB and unrelated task containers were active. Existing services/containers were not stopped.
- A later snapshot-alignment attempt ran all 62 tests: the three intentional legacy chrome snapshots were visually inspected, regenerated through the repository Docker update path, and the next exact verification passed 62/62.
- A final exact re-run after raising the selector kind label from 11px to 12px was again terminated by `SIGKILL` immediately after the Vite build and before any test result. This is recorded as a resource failure, not an assertion failure.
- Repository-supported fallback after the final CSS/story cleanup:

  `npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/app-club-shell.ct.tsx --workers=1`

  PASS: 2/2 exact-width tests at 767px and 768px.

Required isolated E2E gate:

`READMATES_E2E_DB_NAME=readmates_e2e_b4_final4_20260824 READMATES_API_BASE_URL=http://127.0.0.1:18099 PLAYWRIGHT_PORT=3119 PLAYWRIGHT_WORKERS=1 READMATES_MUTATION_IDENTITY_CURRENT_KEY=e2e-mutation-key READMATES_HOST_LIST_CURSOR_CURRENT_KEY=e2e-cursor-key npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/responsive-navigation-chrome.spec.ts tests/e2e/public-auth-member-host.spec.ts`

- PASS: 13/13 Chromium tests.
- Browser assertions cover separate club/workspace selectors, authorized current workspace, shared member/host primary regions, account behavior, title/status transitions, canonical member/host targets, mobile Back/record ownership, and the exact 767/768 non-overlap boundary.
- A final post-typography boundary check used database `readmates_e2e_b4_boundary_final_20260824`, API port `18100`, frontend port `3120`, and one worker; PASS: 1/1.
- Every E2E attempt used a fresh task-specific database name and dedicated API/frontend ports. Existing services, databases, and containers were not stopped or reused.

Fixture diagnosis:

- The attendee baseline initially expected host activation to auto-enroll the member in the current meeting and then awaited a successful RSVP. The server write contract updates only an existing active `session_participants` row, so activation correctly produces an active club member who is not automatically a meeting attendee. The test now verifies active member authority and explicitly verifies no automatic attendee enrollment.
- The responsive suite initially expected the pre-B3 `모임 기록 장부` list. The approved B3 route owns a `모임` creation/list surface and the isolated fixture returns its first-meeting empty state, so the test now validates that state and opens the known seeded canonical detail directly.
- These were fixture expectation failures, not public-auth or B4 shell assertion failures.

## Static verification

- `npx --yes corepack@0.35.0 pnpm --dir front lint` — PASS.
- `npx --yes corepack@0.35.0 pnpm --dir front build` — PASS: Vite transformed 702 modules before final cleanup and completed again after final cleanup.
- Impeccable detector over the changed UI targets — no finding in the new B4 components. The full changed-CSS file scan reported six existing `side-tab` warnings outside the B4 diff.
- Static dependency scan — no router, `src/app`, or feature import in the new shared model/shell/selector/story/CT production boundary.
- Static media scan — no `max-width: 768px` or `min-width: 769px` remains in `globals.css` or `mobile.css`.
- `git diff --cached --check` — PASS immediately before commit.

## Acceptance-matrix selection

- Selected `UI or runtime state`: component and real-browser evidence covers desktop/mobile, exact boundary widths, empty meeting list, long selector names, current state, safe-area clearance, wrapping/overflow, and role-switch status/focus/title.
- Selected `Actor or authorization`: layout/unit and public-auth E2E prove member/host options are authorization-derived and platform-admin navigation is not injected into club workspace navigation.
- Selected `Club context`: scoped and compatibility route tests plus browser href assertions cover authoritative current-club links, other joined-club targets, and canonical scoped account/workspace routes.
- Excluded server persistence, migration, provider, cursor, and guest DTO privacy rows because B4 changes no server/BFF schema, persistence, provider behavior, collection cursor, or public DTO.

## Self-review

- Shell ownership: `AppRouteLayout` is the only owner of navigation targets and mounts one authenticated security-controller node; shared rendering accepts complete models.
- Shared interaction: member/host render the same ordered region list and the same selector/tab primitives. Only authorized workspaces, primary labels, current state, and hrefs differ.
- Security/authority: current workspace is derived from the canonical route; options come only from active member/host authority; joined-club host capability remains checked per target club.
- Navigation continuity: member/host last-safe targets, record-origin return state, scoped compatibility paths, account routes, and replace/push intent remain explicit app-layer decisions.
- Accessibility: selectors use native summaries, named navigation regions, visible current names, `aria-current`, 44px targets, keyboard-operable links, focus-visible rings, and route-heading focus after a workspace switch.
- Responsive layout: exact browser and CT checks prove only mobile chrome at 767px and only desktop chrome at 768px, without horizontal overflow or bottom-navigation content collision.
- Visual language: selectors use existing ReadMates type, color, line, radius, and motion tokens; no generic dashboard/KPI surface or nested card stack was introduced.
- Public-repo safety: no secret, private domain, deployment state, real member data, or local absolute workspace path was added to source/tests/docs.

## Concerns

- The aggregate frontend test command is not fully green: `npx --yes corepack@0.35.0 pnpm --dir front test` completed with 308/310 files and 2553/2555 tests passing. Both failures are unchanged from BASE `b186dbf2587c9ac91b9db6990b9433e438fa7917`: four feature-route imports from `src/app` violate `frontend-boundaries.test.ts`, and `host-session-editor.test.tsx` expects the obsolete `기록을 공개했습니다.` status while runtime uses the approved B1 publication copy. B4 did not edit those files.
- Docker CT resource pressure is intermittent while other task containers are active. The exact suite has one successful 62/62 run, and the final affected fallback is 2/2; the later pre-test `SIGKILL` is retained above instead of being presented as a pass.
- Proposed ADR-0019/ADR-0026 should be updated/promoted only in the program integration task after the remaining aggregate residuals and all dependent workspace tasks are reconciled.

## Fix round 1 — current-item continuity and committed workspace transitions

ADR impact: `update` (unchanged). This round tightens the implemented route-authority and transition-feedback details of Proposed ADR-0019/ADR-0026; it does not introduce a new durable decision or promote either ADR.

### Review findings closed

- Current club and workspace entries are now non-navigation current items. Other authorized destinations remain links. Activating a current item cannot add a history entry or discard pathname, search, hash, React Router state, or record-origin ownership.
- Member mobile Back now uses `readAppReturnTarget` with the current pathname and a current-club scoped fallback. Valid scoped and compatibility `/app/**` state is retained/canonicalized; another club, another origin, malformed input, cycles, and over-depth chains fall back inside the active club. Host record ownership continues to use the stricter host-record parser.
- The security controller no longer records click intent. It derives the destination from the mounted router location and prepares a committed receipt bound to page-session identity, source and destination workspace, club scope, complete href, history location key, and a six-hour expiry. Only a matching successfully mounted destination can consume the announcement. StrictMode remounts preserve the pending committed receipt until the animation-frame title/focus/status work runs; modified, cancelled, and loader-failed navigation cannot create a destination receipt. An in-memory page-session fallback preserves the same behavior when session storage is unavailable.
- Every mounted app location receives the current workspace title and heading focus. Actual member/host transitions, including Back and Forward, announce exactly once. Ordinary initial load and same-route reload do not announce. Prior member/host prefixes are stripped before one exact current prefix is applied, so prefixes cannot accumulate.

### TDD evidence

Initial RED command:

`npx --yes corepack@0.35.0 pnpm --dir front test -- shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx shared/routing/readmates-route-state.test.ts src/app/app-route-security-controller.test.tsx src/app/layouts/app-route-layout.test.tsx`

- The script forwarded the separator in a way that ran the aggregate Vitest suite. It produced 2553 passes and 11 failures: nine intended B4 RED assertions (four current-selector, one cross-club Back, four transition/title/focus) plus the two already documented BASE failures (architecture inverse dependencies and stale publication copy).
- A later StrictMode-specific RED reproduced the browser defect directly: `src/app/app-route-security-controller.test.tsx` had 1/4 failing tests because a remounted destination lost its status on the second StrictMode effect setup.

Final focused GREEN:

`npx --yes corepack@0.35.0 pnpm --dir front exec vitest run shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx shared/routing/readmates-route-state.test.ts src/app/app-route-security-controller.test.tsx src/app/layouts/app-route-layout.test.tsx tests/unit/spa-layout.test.tsx tests/unit/responsive-navigation.test.tsx`

- PASS: 7 files, 123 tests.
- Coverage includes an actual MemoryRouter history stack with scoped host-record search/hash/state, current item activation followed by Back, valid scoped/unscoped/nested return state, all unsafe return-state classes, StrictMode layout remount, member → host → member → Back → Forward, exact titles, reload/remount focus, one status node, modified/cancelled activation, a failed destination loader, and unavailable session storage.

### Component and browser evidence

Affected exact-boundary CT:

`npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts shared/ui/app-club-shell.ct.tsx --workers=1`

- PASS: 2/2 at 767px and 768px.
- The first attempt was 1/2 because the new assertion measured a current item while its native `details` menu was closed, yielding a zero layout box. After the test opened the menu like a user, it verified the non-link current item and its 44px height; both assertions passed. This was a test-harness assertion error, not a product-layout failure.

Required isolated browser gate:

`READMATES_E2E_DB_NAME=readmates_e2e_b4_fix1_20260824e READMATES_API_BASE_URL=http://127.0.0.1:18125 PLAYWRIGHT_PORT=3145 PLAYWRIGHT_WORKERS=1 READMATES_MUTATION_IDENTITY_CURRENT_KEY=e2e-mutation-key READMATES_HOST_LIST_CURSOR_CURRENT_KEY=e2e-cursor-key npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/responsive-navigation-chrome.spec.ts tests/e2e/public-auth-member-host.spec.ts`

- PASS: 14/14 Chromium tests on the final code.
- Browser assertions cover current club/workspace items preserving a scoped host-record URL, state, and history length; current-club bounded mobile Back after injected cross-club state; exact member/host titles; title/status/focus through switch, Back, Forward, and reload; one controller/status; public-auth chrome; and the 767/768 boundary.
- The first isolated attempt used a different fresh database and ports and passed 12/14. Both failures were real transition-status assertions: StrictMode consumed the first committed destination receipt before feedback ran. The direct StrictMode RED and matched consume-on-feedback fix closed them. A fresh responsive run then passed 11/11, followed by the final fresh two-file 14/14 gate above.
- Every run used a new task-specific database and dedicated API/frontend ports. No existing service, database, or container was stopped or reused.

### Static verification and self-review

- `npx --yes corepack@0.35.0 pnpm --dir front lint` — PASS.
- `npx --yes corepack@0.35.0 pnpm --dir front build` — PASS, 702 modules transformed.
- Impeccable detector on the changed shell, selector, controller/layout, CT, and browser-test targets — no findings.
- Shared production UI remains free of React Router, `src/app`, and feature imports. All href, replace/push, security receipt, route scope, and Back decisions remain in `src/app` or shared routing policy; shared UI only distinguishes current presentation from navigable destinations.
- `AppRouteLayout` still mounts exactly one authenticated security controller. Empty feedback still renders no `role=status`, and the matched consume contract prevents duplicate or stale announcements.
- The aggregate suite was not rerun after the focused final gate. The two unchanged BASE aggregate concerns documented above therefore remain integration risks, not B4 fix-round regressions.
