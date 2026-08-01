# Task 10 — Public Entry Points and Target-Club OAuth Join

## Scope

Added scoped `둘러보기` and `멤버로 시작` entry actions to the login and public
home/about/records/session surfaces. `멤버로 시작` carries an explicit club join
intent only when the already-safe return path names the same canonical club.
The OAuth callback can then create a `VIEWER` membership only in that active,
public target club.

## RED → GREEN

- Frontend CTA and OAuth URL tests first failed because public surfaces exposed
  only the former `시작하기` action and the OAuth helper had no `joinClub`
  contract.
- Server compile/tests first failed because no guest-join session attribute or
  target-aware login contract existed. Focused tests also reproduced invalid
  invite collision, duplicate short-name, exact-membership concurrency, and
  non-canonical scoped-path cases before their fixes.
- The full browser run exposed a real 320px Kakao recovery regression: placing
  `둘러보기` first pushed `로그인 주소 복사` below the initial viewport. The
  copy-first primary action was restored for that branch; the focused recovery
  scenarios and final full E2E suite then passed.

## Entry and OAuth boundary

- Legacy public routes map to the baseline club; `/clubs/{slug}` public routes
  retain that exact scoped club for both entry actions.
- Generic `/login` keeps `Google로 시작하기` and never carries an implicit club
  join. A safe scoped app return shows `둘러보기` plus `멤버로 시작`.
- `oauthHrefForReturnTo` emits `joinClub` only when it equals the canonical club
  extracted from `/clubs/{slug}/app/**`. Dot-segment, cross-club, malformed, and
  non-canonical slug cases cannot create an intent.
- OAuth start clears stale invite/join state before capture. Any `inviteToken`
  parameter presence suppresses guest join, including an invalid token.
- OAuth success consumes the invite, signed return state, and target exactly
  once. The captured target is used only when it still matches the verified
  signed return path; success and failure clear/invalidate servlet auth state.

## Membership boundary

- Google identity creation/connection is separate from club enrollment.
  Generic login creates no membership.
- Explicit enrollment first requires an `ACTIVE + PUBLIC` target club and then
  checks that exact `(user_id, club_id)` row, including blocked statuses.
- Existing `VIEWER` and `ACTIVE` memberships are preserved. `LEFT`,
  `SUSPENDED`, `INACTIVE`, and `INVITED` fail closed.
- A new target row is `MEMBER + VIEWER` only. No baseline or other-club row is
  created implicitly.
- Unique `(club_id, user_id)` races recover by re-reading the exact target row.
  A real pending MySQL insert test covers the blocking/commit/conflict path.
  Club-local display-name collisions retry with a UUID-derived 50-character
  short name without treating another member's name as an enrollment race.

## Changed surfaces

- Frontend: scoped public entry helper/action, login route/card, public
  home/about/records/session surfaces, OAuth return helper, unit and E2E tests.
- Server: OAuth guest-join session/capture/return/success handling, Google login
  service and persistence ports/adapter, focused service/filter/callback tests.
- No Task 11/12, deployment, migration, or public-data exposure work was added.

## Verification

- `corepack pnpm --dir front test` — 241 files, 1,907 tests passed.
- `corepack pnpm --dir front lint` — passed.
- `corepack pnpm --dir front build` — passed.
- `corepack pnpm --dir front test:e2e` — 113 tests passed.
- `./scripts/server-ci-check.sh` — detekt, ktlint, unit, architecture, coverage,
  and `check` passed.
- `./server/gradlew -p server integrationTest --tests 'com.readmates.auth.application.service.GoogleLoginServiceTest' --tests 'com.readmates.auth.infrastructure.security.InviteAwareOAuthTest' --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'`
  — 35 focused integration tests passed.
- `git diff --check` — passed before report creation; repeated at final staging.

## Residual risk

- Verification used repository fixtures and the local OAuth success-handler
  integration boundary. It did not contact Google's live OAuth service or
  perform a deployment.

## Review fix round 1 — exact raw join authorization

The review found that member-start authorization reused navigation path
canonicalization. A dot-resolving or percent-encoded raw `returnTo` could
therefore become the target club's canonical route and retain a captured join
intent. Redirect safety and membership authorization now have separate
boundaries: redirects keep their existing safe canonicalization, while a join
is authorized only from the exact raw `/clubs/{canonical-slug}/app/**` shape.

### RED evidence

- Frontend focused tests reproduced the issue: 1 failed and 11 passed because a
  noncanonical raw target still emitted `joinClub`.
- Server capture and callback tests reproduced both stages: 2 tests ran and 2
  failed because the target attribute was captured and membership was created.
- The rejection matrix covers dot segments, percent-encoded slugs/fixed
  segments/dot segments, mixed-case slugs, repeated separators, and backslashes.
  Exact canonical targets with query and hash remain eligible.
- Callback integration covers one dot-resolving path and one percent-encoded
  path and asserts zero memberships for both.

### GREEN evidence

- `corepack pnpm --dir front exec vitest run tests/unit/login-return.test.ts tests/unit/login-card.test.tsx`
  — 2 files, 28 tests passed.
- `corepack pnpm --dir front exec vitest run features/auth features/public tests/unit/login-return.test.ts tests/unit/login-card.test.tsx tests/unit/public-home.test.tsx tests/unit/public-club.test.tsx`
  — 13 files, 84 tests passed.
- `corepack pnpm --dir front test` — 241 files, 1,909 tests passed.
- `corepack pnpm --dir front lint` — passed.
- `corepack pnpm --dir front build` — passed.
- `./scripts/server-ci-check.sh` — detekt, ktlint, compile, unit,
  architecture, coverage, and `check` passed.
- `./server/gradlew -p server integrationTest --tests 'com.readmates.auth.application.service.GoogleLoginServiceTest' --tests 'com.readmates.auth.infrastructure.security.InviteAwareOAuthTest' --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'`
  — 36 focused integration tests passed.
- `git diff --check` — passed.

The review fix did not contact Google's live OAuth service, deploy the app, or
rerun the unchanged browser E2E surface; the original Task 10 full E2E gate
remains 113 tests passed.
