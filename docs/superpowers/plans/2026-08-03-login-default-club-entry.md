# Login Default Club Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make bare `/login` render reading-sai `둘러보기` and `멤버로 시작` actions while preserving explicit return, recovery, unsafe-return, Kakao, and dev-login behavior.

**Architecture:** Keep URL interpretation in `LoginRouteContent` and presentation/join-intent behavior in the existing `LoginCard` and `MemberStartLink`. Derive a default club entry target only for the normal bare login UI; keep the user-supplied safe return value separate so dev-account redirects and recovery branches retain their current semantics.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Playwright, Vite.

## Global Constraints

- Bare `/login` defaults its entry UI target to `/clubs/reading-sai/app`.
- The `둘러보기` anchor uses `/clubs/reading-sai/app`.
- The `멤버로 시작` fallback anchor uses `/login?returnTo=%2Fclubs%2Freading-sai%2Fapp` and retains the existing one-time join-intent click behavior.
- Valid explicit `returnTo` takes precedence; unsafe explicit returns remain rejected.
- Recovery state, Kakao guidance, invite flows, and dev-account redirect defaults remain unchanged.
- Do not touch BFF, server, API, persistence, migrations, or unrelated dirty frontend files.
- Do not commit, push, deploy, or mutate live data without separate authorization.

---

### Task 1: Default the bare login entry actions

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `front/tests/unit/login-card.test.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`
- Modify: `front/features/auth/route/login-route.tsx`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Verify unchanged contract: `front/tests/e2e/google-auth-invite-flow.spec.ts`

**Interfaces:**
- Consumes: `safeRelativeReturnTo(value: string | null): string | null`, `scopedAppClubSlug(returnTo: string | null): string | null`, `LoginCard`, and `MemberStartLink`.
- Produces: `LoginRouteContent` props where bare normal login receives `browseHref="/clubs/reading-sai/app"`, `joinClub="reading-sai"`, and `joinReturnTo="/clubs/reading-sai/app"`.

- [x] **Step 1: Replace the old generic-login unit expectation with the desired bare-login behavior**

In `front/tests/unit/login-card.test.tsx`, change the test that currently expects only `Google로 시작하기` so it independently asserts these literals:

```tsx
it("offers reading-sai browse and member entry actions on bare login", () => {
  render(<LoginRoute />);

  expect(screen.getByRole("link", { name: "둘러보기" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app",
  );
  expect(screen.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
    "href",
    "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
  );
  expect(screen.queryByRole("link", { name: "Google로 시작하기" })).not.toBeInTheDocument();
});
```

Keep the existing explicit club-return test, unsafe-return test, generic OAuth recovery tests, and admin dev-login test because they catch regressions outside the new default.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/login-card.test.tsx
```

Expected: FAIL because bare `/login` has no `둘러보기` link and still renders `Google로 시작하기`.

- [x] **Step 3: Implement the minimal route-level default without changing user-supplied return semantics**

In `front/features/auth/route/login-route.tsx`, introduce a named default and keep two values:

```tsx
const DEFAULT_CLUB_ENTRY_RETURN_TO = "/clubs/reading-sai/app";

function requestedLoginReturnTo(search: string) {
  return safeRelativeReturnTo(new URLSearchParams(search).get("returnTo"));
}

function loginEntryReturnTo(search: string, requestedReturnTo: string | null) {
  const params = new URLSearchParams(search);
  if (params.has("returnTo") || params.has("error")) {
    return requestedReturnTo;
  }
  return DEFAULT_CLUB_ENTRY_RETURN_TO;
}
```

In `LoginRouteContent`, derive `requestedReturnTo` first and `returnTo` for the entry UI second. Continue using UI `returnTo` for `browseHref`, Google/join links, club derivation, and Kakao copy URL. Use only `requestedReturnTo` in `loginAsDevAccount` so the platform-admin shortcut still defaults to `/admin`:

```tsx
const requestedReturnTo = requestedLoginReturnTo(search);
const returnTo = loginEntryReturnTo(search, requestedReturnTo);

globalThis.location.assign(requestedReturnTo ?? defaultRedirectPath ?? "/app");
```

- [x] **Step 4: Run the focused unit file and verify GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/login-card.test.tsx
```

Expected: all login-card tests PASS, including unsafe external return, recovery labels, Kakao guidance, and admin dev redirect.

- [x] **Step 5: Update the smallest browser smoke assertion**

In `front/tests/e2e/public-auth-member-host.spec.ts`, replace the bare-login `Google로 시작하기` visibility assertion with:

```tsx
await expect(page.getByRole("link", { name: "둘러보기" })).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app",
);
await expect(page.getByRole("link", { name: "멤버로 시작" })).toHaveAttribute(
  "href",
  "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp",
);
```

Do not change `google-auth-invite-flow.spec.ts`: its unsafe absolute `returnTo` assertion must continue to prove that untrusted input cannot create implicit club context.

Update the existing `renders the login route` SPA router smoke with the same two literal link expectations so the route integration contract matches the focused login-card contract.

Add a focused bare-login browser test that intercepts the join-intent POST and OAuth start, clicks `멤버로 시작`, and verifies exactly one reading-sai intent with the expected `returnTo`, `joinClub`, and one-time `joinIntent` query values.

Record the user-visible bare-login default under `CHANGELOG.md` `Unreleased`, including explicit-return precedence and fail-closed recovery/unsafe-return behavior.

- [x] **Step 6: Run focused and canonical frontend verification**

Run in order:

```bash
corepack pnpm --dir front exec vitest run tests/unit/login-card.test.tsx
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
READMATES_API_BASE_URL=http://127.0.0.1:18081 PLAYWRIGHT_PORT=3101 corepack pnpm --dir front exec playwright test tests/e2e/public-auth-member-host.spec.ts tests/e2e/google-auth-invite-flow.spec.ts
```

Expected: every command exits 0. If the focused Playwright command cannot run because its local server, database, or browser dependency is unavailable, report that exact command and reason rather than claiming it passed.

- [x] **Step 7: Review scope and formatting**

Run:

```bash
git diff --check -- CHANGELOG.md front/features/auth/route/login-route.tsx front/tests/unit/login-card.test.tsx front/tests/unit/spa-router.test.tsx front/tests/e2e/public-auth-member-host.spec.ts docs/superpowers/specs/2026-08-03-login-default-club-entry-design.md docs/superpowers/plans/2026-08-03-login-default-club-entry.md
git status --short --branch --untracked-files=all
```

Expected: no whitespace errors; only the auth/test files and the two new design/plan documents belong to this task. Existing archive, member-space, global-style, and release-readiness changes remain untouched.
