# ReadMates Login Default Club Entry Design

**Date:** 2026-08-03

**Status:** Approved design

## Goal

Make the bare `/login` route offer the same two choices as the public reading-sai entry surface instead of showing only `Google로 시작하기`.

## Chosen Behavior

- A bare `/login` defaults its club entry target to `/clubs/reading-sai/app`.
- The primary action is `둘러보기` with `href="/clubs/reading-sai/app"`.
- The secondary action is `멤버로 시작` with the safe fallback `href="/login?returnTo=%2Fclubs%2Freading-sai%2Fapp"`.
- Clicking `멤버로 시작` continues to use the existing one-time join-intent flow before navigating to Google OAuth.
- A valid explicit `returnTo` keeps its existing scoped behavior and takes precedence over the default target.
- Recovery state, Kakao in-app-browser guidance, dev-login controls, unsafe-return filtering, and invite acceptance remain unchanged.

## Implementation Boundary

Keep the change in the existing auth route and login-card contract. Reuse `safeRelativeReturnTo`, `scopedAppClubSlug`, and `MemberStartLink`; do not add a second OAuth or join implementation and do not change BFF, Spring auth, API, persistence, or migrations.

## Test Strategy

Use TDD around the login route behavior:

1. Add a focused component/route test proving bare `/login` renders both actions with the expected reading-sai links.
2. Prove a valid explicit club `returnTo` still overrides the default.
3. Update the smallest affected E2E assertions that currently expect `Google로 시작하기` on bare `/login`.
4. Run the focused test, then frontend lint, unit tests, build, and the auth/user-flow E2E gate.

## Acceptance Criteria

- `http://localhost:5174/login` visibly offers `둘러보기` and `멤버로 시작`.
- The rendered anchor destinations match the requested URLs.
- No bare-login `Google로 시작하기` action remains in the normal browser state.
- Existing explicit-return, recovery, external-browser, and dev-login behavior does not regress.

## Non-Goals

- Changing the public navigation link itself.
- Changing Google OAuth, join-intent, membership, or authorization contracts.
- Changing copy or layout outside the login entry actions.
- Committing, pushing, deploying, or mutating live data.
