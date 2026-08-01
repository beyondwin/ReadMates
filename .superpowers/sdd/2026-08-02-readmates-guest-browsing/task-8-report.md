# Task 8 — Scoped Guest Routes, Navigation, Locks, and Personal Preview

## Scope

Implemented the guest shell for club-scoped app routes. Unscoped `/app`
remains authenticated. Guest deep links preserve their original scoped URL,
never invoke protected data APIs, and resolve to a browse landing, personal
preview, or member-only lock as determined by the guest capability matrix.

## RED → GREEN

- RED: `corepack pnpm --dir front exec vitest run src/app/router-route-order.test.tsx tests/unit/spa-router.test.tsx features/guest-browse/route/guest-route-data.test.ts`
  failed as expected: anonymous feedback and print URLs rendered the login
  redirect instead of a guest lock, and the host deep link rendered login.
- GREEN: the same focused route command passed with 3 files and 50 tests.

## Implementation decisions

- React Router starts matched parent and child loaders in parallel. A parent
  redirect alone therefore cannot stop an already-matched protected child
  loader. Each scoped child route now has a static audience-aware loader: for
  anonymous guests it returns a guest marker without importing or calling the
  protected loader; for authenticated audiences it loads and delegates to the
  original loader.
- The lazy route component renders the guest route element when it receives
  that marker. This keeps feedback, print, preview, and unknown direct URLs at
  their original `/clubs/:clubSlug/app/**` URL rather than introducing an
  internal guest URL. Guest host deep links alone redirect to the scoped app
  root before host loaders execute.
- Guest shell navigation uses the existing member navigation without host
  entry. It renders a guest badge, conversion action, and public-home exit;
  it never renders the logout control. Preview has no fabricated personal
  data. Feedback explains Google starts a viewer membership and host approval
  is still required for full membership.
- Locked navigation is represented by an accessible dialog/sheet: keyboard
  Escape and backdrop close it, focus returns to the initiating control, and
  its controls meet the 44px minimum. Direct URLs render an accessible lock
  page instead.
- `GuestAppHead` installs a single scoped `noindex` robots meta tag.

## Changed files

- Guest route access loader, context, audience marker, lock/preview/account,
  noindex, and navigation-dialog UI under `front/features/guest-browse/`.
- Scoped member routing and club layouts under `front/src/app/`.
- Scoped host guard, global guest-shell styles, and router zero-fetch tests.

## Verification

- Focused routes: 3 files, 50 tests passed.
- Extended regression including frontend architecture boundaries and app layout:
  5 files, 69 tests passed.
- `corepack pnpm --dir front test`: 232 files, 1855 tests passed.
- `corepack pnpm --dir front lint`: passed.
- `corepack pnpm --dir front build`: passed.
- `git diff --check`: passed.

## Self-review and residual risk

- Full suite initially exposed a feature/app import-boundary violation and an
  omitted `appPath` prop in club switching; both were fixed before the final
  full suite.
- Task 9 will replace the browse landing on OPEN routes with safe guest home,
  current-session, notes, and archive data surfaces. This task deliberately
  provides only the shell, capability gate, preview, and locks.

## Review-fix round — guest route bypass closure

### RED evidence

- Added `loads the public shell for an authenticated guest-equivalent
  membership` and `does not import a protected child loader for any GUEST
  audience` to `guest-route-data.test.ts`.
- Before the fix, the focused route test failed twice: an authenticated
  `INACTIVE` membership produced `club: null`, and the protected-loader
  importer was invoked instead of returning `{ guestRoute: true }`.

### Resolutions

1. Every `GUEST` audience, authenticated or anonymous, now fetches the public
   shell. Its shell 404 remains the authoritative result for an inaccessible
   private or inactive club. The scoped app layout no longer renders the
   blocked-member branch for guest-equivalent authentication.
2. Scoped member and scoped host children use static loaders and a post-loader
   `Suspense` component boundary. Guest-equivalent navigation returns before
   either `*-data` importer runs, while unscoped and authorized scoped routes
   retain their original loader behavior. Router-graph assertions require
   scoped member and host children to have a static loader and no `lazy`
   property.
3. Scoped host child loaders call the scoped host authorization gate before
   their route module importer. Guest DENY redirects to scoped app root; the
   unscoped `/app/host` tree is unchanged. The direct host test continues to
   assert no protected API fetch, and the static-route graph assertion prevents
   child lazy module execution for the scoped tree.
4. Guest lock dialog dismissal now restores opener focus for Escape, close and
   backdrop. Tab and Shift+Tab cycle between the close and conversion controls.
5. Lock, preview, and account conversion targets preserve pathname, search,
   and hash. The exact approved feedback copy is `Google로 시작한 뒤 호스트의
   정식 멤버 승인이 필요합니다.`
6. Added co-located shell tests for noindex single-node lifecycle, preview,
   account/no-logout behavior, desktop/mobile navigation, direct feedback
   conversion, and dialog focus behavior. The noindex head helper is now
   reference-counted so multiple mounted guest shells keep exactly one node.
7. Confirmed `MobileTabBar` has no injected `appPath` prop.

### Review-fix verification

- Focused guest route/UI/router run: 4 files, 61 tests passed.
- Architecture boundary and app-layout regression: 2 files, 19 tests passed.
- `corepack pnpm --dir front test`: 233 files, 1866 tests passed.
- `corepack pnpm --dir front lint`: passed.
- `corepack pnpm --dir front build`: passed.
- `git diff --check`: passed.

### Remaining concern

- The dedicated public browse content for OPEN routes remains Task 9 scope;
  this round only strengthens the Task 8 shell boundary and never exposes
  protected route data to guest-equivalent audiences.

## Review-fix round 2 — scoped route contract preservation

### RED → GREEN

- RED: the new scoped-route metadata test found `ErrorBoundary` undefined on
  scoped `session/current`; scoped notes also had no `shouldRevalidate`.
- RED: concurrent `loadClubAppAudience` calls with one navigation `Request`
  performed four fetches, exhausting the two-response fixture.
- GREEN: focused router, guest route/UI, and module-loader tests passed with
  5 files and 64 tests after the fixes.

### Resolutions

1. `scopedMemberRoute` now accepts and preserves `ErrorBoundary` and
   `shouldRevalidate`. Scoped current session uses `CurrentSessionRouteError`;
   scoped notes reuses the identical `notesFeedShouldRevalidate` function as
   unscoped notes. The pure revalidation function moved out of the protected
   notes data-loader module, so the guest graph never imports that module.
2. Member and host scoped route builders use `memoizeRouteModule`, a single
   promise shared by static loader and `React.lazy` element. Its co-located
   test proves concurrent loader/element callers assemble a module once.
3. Audience access now uses a `WeakMap<Request, Promise<ClubAppAccess>>` only
   while the exact router `Request` is pending. It deduplicates parent/child
   reads in one navigation, deletes both successful and failed entries, and
   cannot become a stale cross-navigation auth cache. The request-count test
   verifies one auth plus one public-shell fetch for two concurrent calls.

### Round 2 verification

- Focused routes/UI/router/module helper: 5 files, 64 tests passed.
- Architecture boundary and app-layout regression: 2 files, 19 tests passed.
- `corepack pnpm --dir front test`: 234 files, 1869 tests passed.
- `corepack pnpm --dir front lint`: passed.
- `corepack pnpm --dir front build`: passed.
- `git diff --check`: passed.
