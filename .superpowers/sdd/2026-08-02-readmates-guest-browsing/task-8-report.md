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
