# Google Login Recovery and Kakao Browser Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop failed Google logins from silently reusing the same account, preserve safe member return paths, and guide KakaoTalk in-app browser users to continue in an external browser.

**Architecture:** The frontend converts allowlisted OAuth error codes into a typed recovery view and sends only a ReadMates-owned `chooseAccount=true` intent. Spring maps that exact intent to Google's `prompt=select_account`, while the existing signed return-state service projects only safe relative member paths back to the login page. KakaoTalk User-Agent detection remains a frontend-only UX hint that exposes a canonical login URL copy action without affecting authentication or authorization.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 4, Testing Library, Cloudflare Pages Functions, Kotlin 2.4, Spring Boot 4, Spring Security OAuth2 Client, JUnit 5, MockMvc, Playwright 1.61, MySQL/Testcontainers.

## Global Constraints

- Normal `/login` entry must not add a Google `prompt` parameter.
- Only `error=membership-left` and `error=google` may enable account-choice recovery.
- Only the exact internal query `chooseAccount=true` maps to Google `prompt=select_account`; browser-provided `prompt`, `login_hint`, and `hd` remain ignored.
- Reuse `safeRelativeReturnTo`; do not admit absolute, protocol-relative, login, OAuth, reset, invite, root, backslash, control-character, or over-2,048-character return targets.
- Keep the same-origin Cloudflare OAuth proxy, primary callback origin, Spring OAuth state, `readmates_session` cookie, BFF secret, trusted forwarded headers, and invite-token flow intact.
- Match only the case-insensitive `KAKAOTALK` User-Agent marker and use it only for advisory UI.
- Do not add an identity provider, password/magic-link/passkey flow, database migration, dependency, browser-exposed secret, unofficial Kakao scheme, or browser-specific intent.
- Do not log or emit analytics for copied login URLs, raw OAuth errors, session values, invitation values, email addresses, or Google subject identifiers.
- Use the exact Korean copy approved in the design and preserve WCAG-friendly `role="alert"`, `role="status"`, `aria-live`, focus, wrapping, and 320px-width behavior.
- Automated verification must not perform a live Google login, use real member data, mutate production, or require provider credentials.
- Use the root-pinned `pnpm@11.13.1` through Corepack for frontend commands.

---

## File Structure

### Create

- `front/features/auth/model/login-recovery.ts` — allowlisted login recovery state, approved copy, KakaoTalk marker detection, and canonical copy URL construction.
- `front/features/auth/model/login-recovery.test.ts` — pure recovery, URL, and User-Agent tests colocated with the model.
- `front/tests/e2e/google-login-recovery.spec.ts` — browser-level recovery link, clipboard, accessibility, and 320px overflow evidence without contacting Google.

### Modify

- `front/shared/auth/login-return.ts` — add an optional `chooseAccount` intent to the existing safe OAuth URL builder.
- `front/tests/unit/login-return.test.ts` — lock query ordering, safe-return filtering, and account-choice intent behavior.
- `front/features/auth/route/login-route.tsx` — assemble recovery view, safe return path, Kakao advisory state, canonical URL, and clipboard result.
- `front/features/auth/ui/login-card.tsx` — render state-specific Google copy and the Kakao external-browser advisory from props only.
- `front/tests/unit/login-card.test.tsx` — cover recovery labels/hrefs, unknown errors, Kakao guidance, and clipboard outcomes.
- `front/src/styles/globals.css` — add restrained advisory layout and mobile wrapping rules beside the existing auth styles.
- `front/tests/unit/cloudflare-oauth-proxy.test.ts` — characterize that the BFF forwards `chooseAccount=true` while retaining all existing trusted-header rules.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/PrimaryOriginOAuthAuthorizationRequestResolver.kt` — translate the exact ReadMates account-choice intent into a provider parameter.
- `server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt` — verify generated Google redirect parameters and reject arbitrary provider query input.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt` — expose a verified, frontend-compatible relative retry target.
- `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt` — cover safe projection and excluded targets.
- `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt` — preserve safe return context for allowlisted OAuth errors without leaking exception detail.
- `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt` — verify LEFT, generic failure, invalid-state, session-clear, and invite-regression behavior.
- `CHANGELOG.md` — record the user-visible login recovery fix under `Unreleased`.

### Intentionally Unchanged

- `front/functions/oauth2/authorization/[[registrationId]].ts` — already forwards the complete source query to Spring; Task 2 adds characterization evidence only.
- `front/functions/login/oauth2/code/[[registrationId]].ts` — callback proxy behavior does not change.
- Database migrations, OAuth client scopes, provider credentials, deploy configuration, and session-cookie configuration.

---

## Execution Preflight

- [ ] Confirm that design commit `493c22d0` is an ancestor of `HEAD` and inspect all untracked paths:

```bash
git merge-base --is-ancestor 493c22d0 HEAD
git status --short --branch --untracked-files=all
```

Expected: the ancestry command exits 0. Preserve every unrelated staged, unstaged, or untracked user path reported by the fresh status check.

- [ ] Commit this reviewed plan by itself before editing product code:

```bash
git add docs/superpowers/plans/2026-08-01-google-login-recovery-kakao-browser.md
git commit -m "docs(auth): plan Google login recovery"
```

Expected: one docs-only commit containing only this plan. If the plan is already committed, verify `git log -1 --oneline -- docs/superpowers/plans/2026-08-01-google-login-recovery-kakao-browser.md` and continue without creating a duplicate commit.

---

### Task 1: Typed Login Recovery and Safe OAuth Intent

**Files:**
- Create: `front/features/auth/model/login-recovery.ts`
- Create: `front/features/auth/model/login-recovery.test.ts`
- Modify: `front/shared/auth/login-return.ts:33-38`
- Modify: `front/tests/unit/login-return.test.ts:1-36`

**Interfaces:**
- Produces: `type LoginRecoveryCode = "membership-left" | "google" | null`.
- Produces: `type LoginRecoveryView = { code: LoginRecoveryCode; errorMessage: string | null; googleActionLabel: string; chooseAccount: boolean }`.
- Produces: `loginRecoveryFromSearch(search: string): LoginRecoveryView`.
- Produces: `oauthHrefForReturnTo(rawValue: string | null | undefined, options?: { chooseAccount?: boolean }): string`.
- Consumes: existing `safeRelativeReturnTo(rawValue)` without changing its allowlist.

- [ ] **Step 1: Write failing recovery-model tests**

Create `front/features/auth/model/login-recovery.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loginRecoveryFromSearch } from "./login-recovery";

describe("login recovery model", () => {
  it("keeps normal login fast", () => {
    expect(loginRecoveryFromSearch("")).toEqual({
      code: null,
      errorMessage: null,
      googleActionLabel: "Google로 시작하기",
      chooseAccount: false,
    });
  });

  it("forces account choice after a left-membership login", () => {
    expect(loginRecoveryFromSearch("?error=membership-left")).toEqual({
      code: "membership-left",
      errorMessage: "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.",
      googleActionLabel: "다른 Google 계정으로 로그인",
      chooseAccount: true,
    });
  });

  it("forces account choice after a generic Google failure", () => {
    expect(loginRecoveryFromSearch("?error=google")).toEqual({
      code: "google",
      errorMessage: "Google 인증을 완료하지 못했습니다. 사용할 계정을 다시 선택해 주세요.",
      googleActionLabel: "Google 로그인 다시 시도",
      chooseAccount: true,
    });
  });

  it("does not trust unknown error codes", () => {
    expect(loginRecoveryFromSearch("?error=provider-detail")).toEqual(
      loginRecoveryFromSearch(""),
    );
  });
});
```

- [ ] **Step 2: Extend the safe OAuth URL tests**

Add these assertions to `front/tests/unit/login-return.test.ts`:

```ts
it("adds only the ReadMates account-choice intent when recovery requests it", () => {
  expect(oauthHrefForReturnTo("/clubs/reading-sai/app", { chooseAccount: true })).toBe(
    "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&chooseAccount=true",
  );
  expect(oauthHrefForReturnTo(null, { chooseAccount: true })).toBe(
    "/oauth2/authorization/google?chooseAccount=true",
  );
  expect(oauthHrefForReturnTo("https://evil.example/app", { chooseAccount: true })).toBe(
    "/oauth2/authorization/google?chooseAccount=true",
  );
});
```

- [ ] **Step 3: Run the focused frontend tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/model/login-recovery.test.ts tests/unit/login-return.test.ts
```

Expected: FAIL because `login-recovery.ts` and the two-argument OAuth helper do not exist.

- [ ] **Step 4: Implement the recovery model**

Create `front/features/auth/model/login-recovery.ts`:

```ts
export type LoginRecoveryCode = "membership-left" | "google" | null;

export type LoginRecoveryView = {
  code: LoginRecoveryCode;
  errorMessage: string | null;
  googleActionLabel: string;
  chooseAccount: boolean;
};

const NORMAL_LOGIN: LoginRecoveryView = {
  code: null,
  errorMessage: null,
  googleActionLabel: "Google로 시작하기",
  chooseAccount: false,
};

export function loginRecoveryFromSearch(search: string): LoginRecoveryView {
  const error = new URLSearchParams(search).get("error");
  if (error === "membership-left") {
    return {
      code: "membership-left",
      errorMessage: "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.",
      googleActionLabel: "다른 Google 계정으로 로그인",
      chooseAccount: true,
    };
  }
  if (error === "google") {
    return {
      code: "google",
      errorMessage: "Google 인증을 완료하지 못했습니다. 사용할 계정을 다시 선택해 주세요.",
      googleActionLabel: "Google 로그인 다시 시도",
      chooseAccount: true,
    };
  }
  return NORMAL_LOGIN;
}
```

- [ ] **Step 5: Implement the safe account-choice URL option**

Replace `oauthHrefForReturnTo` in `front/shared/auth/login-return.ts` with:

```ts
export function oauthHrefForReturnTo(
  rawValue: string | null | undefined,
  { chooseAccount = false }: { chooseAccount?: boolean } = {},
) {
  const returnTo = safeRelativeReturnTo(rawValue);
  const query = new URLSearchParams();
  if (returnTo) query.set("returnTo", returnTo);
  if (chooseAccount) query.set("chooseAccount", "true");
  const search = query.toString();
  return `/oauth2/authorization/google${search ? `?${search}` : ""}`;
}
```

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/model/login-recovery.test.ts tests/unit/login-return.test.ts
```

Expected: PASS for the new recovery model and all existing safe-return cases.

- [ ] **Step 7: Commit the frontend intent contract**

```bash
git add front/features/auth/model/login-recovery.ts front/features/auth/model/login-recovery.test.ts front/shared/auth/login-return.ts front/tests/unit/login-return.test.ts
git commit -m "feat(auth): model Google login recovery"
```

---

### Task 2: Server-Owned Google Account Chooser Mapping

**Files:**
- Modify: `front/tests/unit/cloudflare-oauth-proxy.test.ts:35-130`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt:31-86`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/PrimaryOriginOAuthAuthorizationRequestResolver.kt:21-50`

**Interfaces:**
- Consumes: frontend query `chooseAccount=true` from Task 1.
- Produces: Google authorization additional parameter `prompt=select_account` only for that exact value.
- Preserves: `redirect_uri=$authOrigin/login/oauth2/code/google`, generated state, existing scope, and BFF forwarding headers.

- [ ] **Step 1: Add BFF characterization and failing Spring integration tests**

Add a BFF test to `front/tests/unit/cloudflare-oauth-proxy.test.ts`:

```ts
it("forwards the ReadMates account-choice intent without interpreting it", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 302 }));
  vi.stubGlobal("fetch", fetchMock);

  await authorizationGet(
    context(
      new Request(
        "https://readmates.pages.dev/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=true",
      ),
      "google",
    ),
  );

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/oauth2/authorization/google?returnTo=%2Fapp&chooseAccount=true",
    expect.objectContaining({ method: "GET", redirect: "manual" }),
  );
});
```

Add imports for `assertNull` and these tests to `OAuthAuthorizationControllerTest.kt`:

```kotlin
@Test
fun `google account recovery requests provider account selection`() {
    val result =
        mockMvc
            .get("/oauth2/authorization/google") {
                param("chooseAccount", "true")
            }.andExpect {
                status { is3xxRedirection() }
            }.andReturn()

    val parameters =
        UriComponentsBuilder
            .fromUriString(result.response.getHeader(HttpHeaders.LOCATION)!!)
            .build()
            .queryParams

    assertEquals("select_account", parameters.getFirst("prompt"))
}

@Test
fun `google authorization ignores arbitrary browser provider parameters`() {
    val result =
        mockMvc
            .get("/oauth2/authorization/google") {
                param("chooseAccount", "TRUE")
                param("prompt", "consent")
                param("login_hint", "attacker@example.test")
                param("hd", "example.test")
            }.andExpect {
                status { is3xxRedirection() }
            }.andReturn()

    val parameters =
        UriComponentsBuilder
            .fromUriString(result.response.getHeader(HttpHeaders.LOCATION)!!)
            .build()
            .queryParams

    assertNull(parameters.getFirst("prompt"))
    assertNull(parameters.getFirst("login_hint"))
    assertNull(parameters.getFirst("hd"))
}
```

- [ ] **Step 2: Run both focused lanes and confirm the boundary state**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/cloudflare-oauth-proxy.test.ts
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.OAuthAuthorizationControllerTest'
```

Expected: BFF characterization PASS because the current proxy already preserves the query; Spring integration FAIL because `prompt=select_account` is not yet added.

- [ ] **Step 3: Implement exact server-side mapping**

Update both resolver overloads and replace the extension in `PrimaryOriginOAuthAuthorizationRequestResolver.kt` with this shape:

```kotlin
override fun resolve(request: HttpServletRequest): OAuth2AuthorizationRequest? {
    val registrationId = request.registrationIdFromDefaultPath()
    return delegate
        .resolve(request)
        ?.withReadmatesAuthorizationParameters(registrationId, request.shouldChooseAccount())
}

override fun resolve(
    request: HttpServletRequest,
    clientRegistrationId: String,
): OAuth2AuthorizationRequest? =
    delegate
        .resolve(request, clientRegistrationId)
        ?.withReadmatesAuthorizationParameters(clientRegistrationId, request.shouldChooseAccount())

private fun OAuth2AuthorizationRequest.withReadmatesAuthorizationParameters(
    registrationId: String?,
    chooseAccount: Boolean,
): OAuth2AuthorizationRequest {
    if (registrationId.isNullOrBlank()) return this

    val builder =
        OAuth2AuthorizationRequest
            .from(this)
            .redirectUri("$authOrigin/login/oauth2/code/$registrationId")
    if (chooseAccount) {
        builder.additionalParameters(additionalParameters + ("prompt" to "select_account"))
    }
    return builder.build()
}

private fun HttpServletRequest.shouldChooseAccount(): Boolean = getParameter("chooseAccount") == "true"
```

- [ ] **Step 4: Run the focused proxy and integration tests**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/cloudflare-oauth-proxy.test.ts
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.OAuthAuthorizationControllerTest'
```

Expected: PASS; the positive request contains `prompt=select_account`, the negative request contains none of the browser-supplied provider parameters, and the callback URI assertion remains unchanged.

- [ ] **Step 5: Commit the provider mapping**

```bash
git add front/tests/unit/cloudflare-oauth-proxy.test.ts server/src/main/kotlin/com/readmates/auth/infrastructure/security/PrimaryOriginOAuthAuthorizationRequestResolver.kt server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt
git commit -m "feat(auth): request Google account selection on retry"
```

---

### Task 3: Recovery-Specific Login UI

**Files:**
- Modify: `front/features/auth/route/login-route.tsx:1-65`
- Modify: `front/features/auth/ui/login-card.tsx:10-55`
- Modify: `front/tests/unit/login-card.test.tsx:25-158`

**Interfaces:**
- Consumes: `loginRecoveryFromSearch(search)` and `oauthHrefForReturnTo(returnTo, { chooseAccount })` from Task 1.
- Produces: `LoginCard` prop `googleLoginLabel?: string` while retaining existing `initialError`, dev accounts, and dev-login callback.
- Preserves: production hiding of dev-login controls and safe dev-login `returnTo` behavior.

- [ ] **Step 1: Expand login route/UI tests for every recovery state**

Replace the existing LEFT-only assertion and add generic/unknown cases in `front/tests/unit/login-card.test.tsx`:

```tsx
it("offers another Google account after a left-membership login", () => {
  window.history.pushState(
    {},
    "",
    "/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp",
  );

  render(<LoginRoute />);

  expect(screen.getByRole("alert")).toHaveTextContent("이전 멤버십이 종료된 계정입니다.");
  expect(screen.getByRole("link", { name: "다른 Google 계정으로 로그인" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&chooseAccount=true",
  );
});

it("offers account selection after a generic Google failure", () => {
  window.history.pushState({}, "", "/login?error=google");

  render(<LoginRoute />);

  expect(screen.getByRole("alert")).toHaveTextContent("Google 인증을 완료하지 못했습니다.");
  expect(screen.getByRole("link", { name: "Google 로그인 다시 시도" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google?chooseAccount=true",
  );
});

it("ignores unknown OAuth errors without changing the normal action", () => {
  window.history.pushState({}, "", "/login?error=provider-detail");

  render(<LoginRoute />);

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Google로 시작하기" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google",
  );
});
```

- [ ] **Step 2: Run the login UI test and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/login-card.test.tsx
```

Expected: FAIL because the route still calculates only an error string and the card hard-codes `Google로 시작하기`.

- [ ] **Step 3: Route the typed recovery view into the card**

In `login-route.tsx`, remove `loginErrorMessage`, import `loginRecoveryFromSearch`, and assemble props as follows:

```tsx
export function LoginRouteContent() {
  const search = globalThis.location.search;
  const recovery = loginRecoveryFromSearch(search);
  const returnTo = loginReturnTo(search);
  const loginAsDevAccount = useCallback(async (email: string, defaultRedirectPath?: string) => {
    const response = await submitDevLogin(email);
    if (!response.ok) throw new Error(`Dev login failed: ${response.status}`);
    globalThis.location.assign(returnTo ?? defaultRedirectPath ?? "/app");
  }, [returnTo]);

  return (
    <LoginCard
      devAccounts={devAccounts}
      googleLoginHref={oauthHrefForReturnTo(returnTo, { chooseAccount: recovery.chooseAccount })}
      googleLoginLabel={recovery.googleActionLabel}
      initialError={recovery.errorMessage}
      showDevLogin={isDevLoginEnabled()}
      onDevLogin={loginAsDevAccount}
    />
  );
}
```

- [ ] **Step 4: Make the card label prop-driven and keep the error before recovery action**

Add `googleLoginLabel = "Google로 시작하기"` to the card props:

```tsx
export function LoginCard({
  devAccounts = [],
  googleLoginHref = "/oauth2/authorization/google",
  googleLoginLabel = "Google로 시작하기",
  initialError = null,
  showDevLogin = false,
  onDevLogin,
}: {
  devAccounts?: DevAccount[];
  googleLoginHref?: string;
  googleLoginLabel?: string;
  initialError?: string | null;
  showDevLogin?: boolean;
  onDevLogin?: (email: string, defaultRedirectPath?: string) => Promise<void>;
}) {
```

Render the existing error block immediately before the action block:

```tsx
{error ? (
  <p className="small auth-card__error" role="alert">
    {error}
  </p>
) : null}
<div className="auth-card__actions auth-card__actions--primary">
  <a className="btn btn-primary btn-lg" href={googleLoginHref}>
    {googleLoginLabel}
  </a>
</div>
```

- [ ] **Step 5: Run focused recovery and return-path tests**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/model/login-recovery.test.ts tests/unit/login-card.test.tsx tests/unit/login-return.test.ts
```

Expected: PASS, including existing production dev-login hiding and dev-login redirect tests.

- [ ] **Step 6: Commit the recovery UI**

```bash
git add front/features/auth/route/login-route.tsx front/features/auth/ui/login-card.tsx front/tests/unit/login-card.test.tsx
git commit -m "fix(auth): make failed Google login retry actionable"
```

---

### Task 4: KakaoTalk External-Browser Advisory and Clipboard Recovery

**Files:**
- Modify: `front/features/auth/model/login-recovery.ts`
- Modify: `front/features/auth/model/login-recovery.test.ts`
- Modify: `front/features/auth/route/login-route.tsx`
- Modify: `front/features/auth/ui/login-card.tsx`
- Modify: `front/tests/unit/login-card.test.tsx`
- Modify: `front/src/styles/globals.css:4272-4360,4776-4820`

**Interfaces:**
- Produces: `isKakaoInAppBrowser(userAgent: string): boolean`.
- Produces: `canonicalLoginUrl(origin: string, rawReturnTo: string | null | undefined, recovery: LoginRecoveryView): string`.
- Produces: `LoginCard` props `showExternalBrowserGuidance?: boolean`, `copyStatus?: string | null`, and `onCopyLoginUrl?: () => Promise<void>`.
- Consumes: `safeRelativeReturnTo`, the Task 1 recovery view, and browser `navigator.clipboard.writeText` only after a user click.

- [ ] **Step 1: Add failing pure model tests for Kakao and canonical URLs**

Append to `front/features/auth/model/login-recovery.test.ts`:

```ts
import {
  canonicalLoginUrl,
  isKakaoInAppBrowser,
  loginRecoveryFromSearch,
} from "./login-recovery";

it("recognizes only the case-insensitive KakaoTalk marker", () => {
  expect(isKakaoInAppBrowser("Mozilla/5.0 KAKAOTALK/25.7.0")).toBe(true);
  expect(isKakaoInAppBrowser("Mozilla/5.0 kakaotalk/25.7.0")).toBe(true);
  expect(isKakaoInAppBrowser("Mozilla/5.0 Chrome/140.0 Mobile Safari/537.36")).toBe(false);
});

it("builds a canonical copy URL from allowlisted recovery state only", () => {
  const recovery = loginRecoveryFromSearch("?error=membership-left&ignored=secret");
  expect(canonicalLoginUrl("https://app.example.test", "/clubs/reading-sai/app", recovery)).toBe(
    "https://app.example.test/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp",
  );
  expect(canonicalLoginUrl("https://app.example.test", "https://evil.example/app", recovery)).toBe(
    "https://app.example.test/login?error=membership-left",
  );
});
```

- [ ] **Step 2: Add failing Kakao route/UI tests**

Add tests to `front/tests/unit/login-card.test.tsx` using `vi.stubGlobal` so the original navigator is restored by the existing `afterEach`:

```tsx
it("prioritizes external-browser recovery in KakaoTalk", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const origin = window.location.origin;
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
    clipboard: { writeText },
  });
  window.history.pushState(
    {},
    "",
    "/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp",
  );

  render(<LoginRoute />);

  expect(screen.getByRole("heading", { name: "외부 브라우저에서 로그인해 주세요" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "로그인 주소 복사" }));
  expect(writeText).toHaveBeenCalledWith(
    `${origin}/login?error=membership-left&returnTo=%2Fclubs%2Freading-sai%2Fapp`,
  );
  expect(screen.getByRole("status")).toHaveTextContent("로그인 주소를 복사했습니다");
  expect(screen.getByRole("link", { name: "Google 로그인 시도" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp&chooseAccount=true",
  );
});

it("explains clipboard failure without hiding the browser-menu recovery", async () => {
  const user = userEvent.setup();
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
  });

  render(<LoginRoute />);
  await user.click(screen.getByRole("button", { name: "로그인 주소 복사" }));

  expect(screen.getByRole("status")).toHaveTextContent(
    "주소를 복사하지 못했습니다. 브라우저 메뉴에서 다른 브라우저로 열어 주세요",
  );
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/model/login-recovery.test.ts tests/unit/login-card.test.tsx
```

Expected: FAIL because Kakao detection, canonical URL construction, advisory props, and clipboard orchestration do not exist.

- [ ] **Step 4: Implement the pure Kakao and canonical URL helpers**

Add to `login-recovery.ts` and import `safeRelativeReturnTo` from `@/shared/auth/login-return`:

```ts
export function isKakaoInAppBrowser(userAgent: string) {
  return userAgent.toUpperCase().includes("KAKAOTALK");
}

export function canonicalLoginUrl(
  origin: string,
  rawReturnTo: string | null | undefined,
  recovery: LoginRecoveryView,
) {
  const url = new URL("/login", origin);
  if (recovery.code) url.searchParams.set("error", recovery.code);
  const returnTo = safeRelativeReturnTo(rawReturnTo);
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  return url.toString();
}
```

- [ ] **Step 5: Add route-owned clipboard orchestration**

Change the React import to `import { useCallback, useState } from "react";`, import the three Task 4 model helpers, and add state plus a callback without logging the URL or exception. Build the canonical URL only for Kakao so existing dev-login location stubs do not need an `origin` field:

```tsx
const isKakaoBrowser = isKakaoInAppBrowser(globalThis.navigator.userAgent);
const [copyStatus, setCopyStatus] = useState<string | null>(null);
const loginUrl = isKakaoBrowser
  ? canonicalLoginUrl(globalThis.location.origin, returnTo, recovery)
  : null;
const copyLoginUrl = useCallback(async () => {
  if (!loginUrl) return;
  try {
    await globalThis.navigator.clipboard.writeText(loginUrl);
    setCopyStatus("로그인 주소를 복사했습니다.");
  } catch {
    setCopyStatus("주소를 복사하지 못했습니다. 브라우저 메뉴에서 다른 브라우저로 열어 주세요.");
  }
}, [loginUrl]);
```

Pass these props to `LoginCard`:

```tsx
googleLoginLabel={isKakaoBrowser ? "Google 로그인 시도" : recovery.googleActionLabel}
showExternalBrowserGuidance={isKakaoBrowser}
copyStatus={copyStatus}
onCopyLoginUrl={isKakaoBrowser ? copyLoginUrl : undefined}
```

- [ ] **Step 6: Render the advisory as the primary Kakao path**

Extend `LoginCard` with exact defaults and prop types:

```tsx
export function LoginCard({
  devAccounts = [],
  googleLoginHref = "/oauth2/authorization/google",
  googleLoginLabel = "Google로 시작하기",
  initialError = null,
  showDevLogin = false,
  showExternalBrowserGuidance = false,
  copyStatus = null,
  onCopyLoginUrl,
  onDevLogin,
}: {
  devAccounts?: DevAccount[];
  googleLoginHref?: string;
  googleLoginLabel?: string;
  initialError?: string | null;
  showDevLogin?: boolean;
  showExternalBrowserGuidance?: boolean;
  copyStatus?: string | null;
  onCopyLoginUrl?: () => Promise<void>;
  onDevLogin?: (email: string, defaultRedirectPath?: string) => Promise<void>;
}) {
```

Render this branch in place of the normal primary action when `showExternalBrowserGuidance` is true:

```tsx
{showExternalBrowserGuidance ? (
  <aside className="auth-browser-guidance" aria-labelledby="external-browser-guidance-title">
    <p className="eyebrow">카카오톡 브라우저</p>
    <h2 className="h3 editorial" id="external-browser-guidance-title">
      외부 브라우저에서 로그인해 주세요
    </h2>
    <p className="small auth-browser-guidance__copy">
      카카오톡 안의 브라우저에서는 Google 로그인이 제한될 수 있습니다. 카카오톡 메뉴에서 다른 브라우저로 열어 주세요.
    </p>
    <div className="auth-browser-guidance__actions">
      <button className="btn btn-primary btn-lg" type="button" onClick={() => void onCopyLoginUrl?.()}>
        로그인 주소 복사
      </button>
      <a className="btn btn-ghost btn-lg" href={googleLoginHref}>
        {googleLoginLabel}
      </a>
    </div>
    {copyStatus ? (
      <p className="small auth-browser-guidance__status" role="status" aria-live="polite">
        {copyStatus}
      </p>
    ) : null}
  </aside>
) : (
  <div className="auth-card__actions auth-card__actions--primary">
    <a className="btn btn-primary btn-lg" href={googleLoginHref}>
      {googleLoginLabel}
    </a>
  </div>
)}
```

- [ ] **Step 7: Add restrained responsive auth advisory styles**

Add beside the existing auth-card rules in `front/src/styles/globals.css`:

```css
.auth-browser-guidance {
  margin-top: 24px;
  padding: 20px;
  border: 1px solid var(--warning-line);
  border-radius: 14px;
  background: var(--paper-200);
}

.auth-browser-guidance .h3 {
  margin: 8px 0 0;
}

.auth-browser-guidance__copy,
.auth-browser-guidance__status {
  margin: 10px 0 0;
  color: var(--text-2);
}

.auth-browser-guidance__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
}
```

Inside the existing mobile media query add:

```css
.auth-browser-guidance {
  padding: 18px;
}

.auth-browser-guidance__actions {
  display: grid;
  grid-template-columns: 1fr;
}

.auth-browser-guidance__actions .btn {
  width: 100%;
  min-height: 46px;
  height: auto;
  padding: 12px 14px;
  white-space: normal;
  text-align: center;
}
```

- [ ] **Step 8: Run focused UI/model tests and frontend lint**

Run:

```bash
corepack pnpm --dir front exec vitest run features/auth/model/login-recovery.test.ts tests/unit/login-card.test.tsx
corepack pnpm --dir front lint
```

Expected: PASS; lint reports no hook dependency, JSX, type, or boundary violations.

- [ ] **Step 9: Commit the Kakao advisory**

```bash
git add front/features/auth/model/login-recovery.ts front/features/auth/model/login-recovery.test.ts front/features/auth/route/login-route.tsx front/features/auth/ui/login-card.tsx front/tests/unit/login-card.test.tsx front/src/styles/globals.css
git commit -m "feat(auth): guide Kakao browser login recovery"
```

---

### Task 5: Safe OAuth Failure Return Context

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt:41-131`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt:59-130,240-248`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt:218-281`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt:34-140`

**Interfaces:**
- Produces: `OAuthReturnState.loginRetryReturnTarget(signedState: String?): String?`.
- Consumes: existing HMAC verification and trusted-host rules before projecting a retry target.
- Produces: login error redirect query containing only `error=membership-left|google` plus an optional verified relative non-auth `returnTo`.
- Preserves: cookie clearing, servlet-session invalidation, security-context clearing, invite token handling, and successful custom-domain redirects.

- [ ] **Step 1: Add failing return-state projection tests**

Add to `OAuthReturnStateTest.kt`:

```kotlin
@Test
fun `login retry target keeps only verified frontend-compatible relative paths`() {
    val safeTarget = "/clubs/$CLUB_SLUG/app/sessions/current?from=login"
    val safeState = returnState.signReturnTarget(safeTarget, VALID_EXPIRY)
    val absoluteState = returnState.signReturnTarget("$APP_ORIGIN/app", VALID_EXPIRY)

    assertEquals(safeTarget, returnState.loginRetryReturnTarget(safeState))
    assertNull(returnState.loginRetryReturnTarget(absoluteState))
}

@Test
fun `login retry target excludes auth root reset and invite paths`() {
    listOf(
        "/",
        "/login",
        "/oauth2/authorization/google",
        "/login/oauth2/code/google",
        "/reset-password/example",
        "/invite/example",
        "/clubs/$CLUB_SLUG/invite/example",
    ).forEach { excludedTarget ->
        val signedState = returnState.signReturnTarget(excludedTarget, VALID_EXPIRY)
        assertNull(returnState.loginRetryReturnTarget(signedState), excludedTarget)
    }
}
```

- [ ] **Step 2: Add failing handler integration tests**

In the LEFT test, set a signed safe target before invoking the handler and parse the redirect query instead of asserting a raw URL:

```kotlin
servletSession.setAttribute(
    OAuthReturnState.SESSION_ATTRIBUTE,
    oauthReturnState.signReturnTarget("/clubs/reading-sai/app/sessions/current"),
)

val redirect = UriComponentsBuilder.fromUriString(response.redirectedUrl!!).build()
assertEquals("membership-left", redirect.queryParams.getFirst("error"))
assertEquals("/clubs/reading-sai/app/sessions/current", redirect.queryParams.getFirst("returnTo"))
```

Add imports for `BadCredentialsException` and `UriComponentsBuilder`, then add:

```kotlin
@Test
fun `google authentication failure preserves safe return context without exposing exception`() {
    val servletSession = securitySession()
    servletSession.setAttribute(
        OAuthReturnState.SESSION_ATTRIBUTE,
        oauthReturnState.signReturnTarget("/clubs/reading-sai/app"),
    )
    val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
    request.setSession(servletSession)
    val response = MockHttpServletResponse()

    successHandler.onAuthenticationFailure(
        request,
        response,
        BadCredentialsException("provider detail must remain private"),
    )

    val redirect = UriComponentsBuilder.fromUriString(response.redirectedUrl!!).build()
    assertEquals("google", redirect.queryParams.getFirst("error"))
    assertEquals("/clubs/reading-sai/app", redirect.queryParams.getFirst("returnTo"))
    assertTrue(response.redirectedUrl!!.contains("provider detail").not())
    assertTrue(servletSession.isInvalid)
}
```

Extend the invalid-return test family so a signed invite path and an invalid state produce no `returnTo` on a login error. Keep all existing invite-success and custom-domain assertions unchanged.

- [ ] **Step 3: Run unit and integration tests and confirm RED**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.auth.infrastructure.security.OAuthReturnStateTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'
```

Expected: FAIL because `loginRetryReturnTarget` does not exist and error redirects discard the signed return state.

- [ ] **Step 4: Implement verified relative retry projection**

Add to `OAuthReturnState.kt`:

```kotlin
fun loginRetryReturnTarget(signedState: String?): String? =
    verifiedReturnTarget(signedState)
        ?.takeIf { target ->
            target.startsWith("/") &&
                LOGIN_RETRY_EXCLUDED_PATHS.none { pattern -> pattern.containsMatchIn(target) }
        }
```

Add the exact exclusion patterns to the companion object:

```kotlin
private val LOGIN_RETRY_EXCLUDED_PATHS =
    listOf(
        Regex("^/(?:[?#]|$)"),
        Regex("^/login(?:[/?#]|$)"),
        Regex("^/oauth2(?:[/?#]|$)"),
        Regex("^/login/oauth2(?:[/?#]|$)"),
        Regex("^/reset-password(?:[/?#]|$)"),
        Regex("^/invite(?:[/?#]|$)"),
        Regex("^/clubs/[^/]+/invite(?:[/?#]|$)"),
    )
```

HMAC verification, expiry, max length, trusted absolute host, and invite methods remain unchanged.

- [ ] **Step 5: Preserve the state before login domain work can fail**

Replace `onAuthenticationSuccess` with the same invitation/session behavior but capture state before domain work can fail:

```kotlin
override fun onAuthenticationSuccess(
    request: HttpServletRequest,
    response: HttpServletResponse,
    authentication: Authentication,
) {
    val oidcUser = authentication.principal as OidcUser
    val inviteToken = capturedInviteToken(request)
    val signedReturnState = capturedReturnState(request)
    try {
        val login =
            if (inviteToken != null) {
                val acceptedMember =
                    invitationService.acceptGoogleInvitation(
                        rawToken = inviteToken,
                        googleSubjectId = oidcUser.subject,
                        email = oidcUser.email,
                        displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
                        profileImageUrl = oidcUser.getClaimAsString("picture"),
                        expectedClubSlug =
                            oauthReturnState.inviteClubSlugFromReturnState(
                                signedReturnState,
                                inviteToken,
                            ),
                    )
                OAuthLoginRedirect(
                    userId = acceptedMember.userId,
                    returnTarget =
                        oauthReturnState.inviteReturnTargetFromState(
                            signedState = signedReturnState,
                            clubSlug = acceptedMember.clubSlug,
                            inviteToken = inviteToken,
                        ) ?: oauthReturnState.inviteReturnTarget(acceptedMember.clubSlug, inviteToken),
                )
            } else {
                val loginResult =
                    googleLoginService.loginVerifiedGoogleUserForSession(
                        googleSubjectId = oidcUser.subject,
                        email = oidcUser.email,
                        displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
                        profileImageUrl = oidcUser.getClaimAsString("picture"),
                    )
                OAuthLoginRedirect(
                    userId = loginResult.userId,
                    returnTarget = oauthReturnState.validatedReturnTarget(signedReturnState),
                )
            }
        val issuedSession =
            authSessionService.issueSession(
                userId = login.userId.toString(),
                userAgent = request.getHeader("User-Agent"),
                ipAddress = request.remoteAddr,
            )

        response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.sessionCookie(issuedSession.rawToken))
        clearServletAuthenticationState(request)
        response.sendRedirect(oauthReturnState.redirectUrl(login.returnTarget))
    } catch (exception: RuntimeException) {
        if (exception !is GoogleLoginException && exception !is InvitationDomainException) {
            throw exception
        }
        val error =
            if (exception is GoogleLoginException && exception.redirectError == "membership-left") {
                "membership-left"
            } else {
                "google"
            }
        redirectToLoginError(
            request,
            response,
            error,
            oauthReturnState.loginRetryReturnTarget(signedReturnState),
        )
    }
}
```

For authentication failure, capture and validate the stored state before clearing the servlet session:

```kotlin
val signedReturnState = capturedReturnState(request)
redirectToLoginError(
    request,
    response,
    "google",
    oauthReturnState.loginRetryReturnTarget(signedReturnState),
)
```

- [ ] **Step 6: Build the login error redirect with Spring URI components**

Import `UriComponentsBuilder`, add a nullable `returnTarget` parameter, and replace string concatenation:

```kotlin
private fun redirectToLoginError(
    request: HttpServletRequest,
    response: HttpServletResponse,
    error: String,
    returnTarget: String? = null,
) {
    response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.clearedSessionCookie())
    clearServletAuthenticationState(request)
    val redirect =
        UriComponentsBuilder
            .fromUriString("$appOrigin/login")
            .queryParam("error", error)
            .apply {
                if (returnTarget != null) queryParam("returnTo", returnTarget)
            }.build()
            .encode()
            .toUriString()
    response.sendRedirect(redirect)
}
```

- [ ] **Step 7: Run focused server tests and architecture checks**

Run:

```bash
./server/gradlew -p server unitTest --tests 'com.readmates.auth.infrastructure.security.OAuthReturnStateTest'
./server/gradlew -p server integrationTest --tests 'com.readmates.auth.api.GoogleOAuthLoginSessionTest'
./server/gradlew -p server architectureTest
```

Expected: PASS; LEFT and authentication failures retain only safe relative member paths, raw errors remain absent, session state clears, and invite/custom-domain tests remain green.

- [ ] **Step 8: Commit safe failure recovery**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnState.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt server/src/test/kotlin/com/readmates/auth/infrastructure/security/OAuthReturnStateTest.kt server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt
git commit -m "fix(auth): preserve safe Google login retry context"
```

---

### Task 6: Browser Acceptance, CHANGELOG, and Final Gates

**Files:**
- Create: `front/tests/e2e/google-login-recovery.spec.ts`
- Modify: `CHANGELOG.md:7-12`
- Verify only: all files from Tasks 1-5

**Interfaces:**
- Consumes: final `/login` recovery UI, safe OAuth href, Kakao advisory, clipboard status, and server redirect contracts.
- Produces: browser evidence at 320px and an `Unreleased` user-visible fix entry.
- Does not navigate to `accounts.google.com` or perform a provider login.

- [ ] **Step 1: Write the browser acceptance spec**

Create `front/tests/e2e/google-login-recovery.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

const appOrigin = `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}`;
const memberReturnTo = "/clubs/reading-sai/app/sessions/current";

test("failed Google login offers explicit account selection", async ({ page }) => {
  await page.goto(
    `/login?error=membership-left&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  await expect(page.getByRole("alert")).toContainText("이전 멤버십이 종료된 계정입니다");
  await expect(page.getByRole("link", { name: "다른 Google 계정으로 로그인" })).toHaveAttribute(
    "href",
    `/oauth2/authorization/google?returnTo=${encodeURIComponent(memberReturnTo)}&chooseAccount=true`,
  );
});

test("KakaoTalk browser receives copy-first recovery without horizontal overflow", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 KAKAOTALK/25.7.0",
    viewport: { width: 320, height: 720 },
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: appOrigin });
  const page = await context.newPage();
  await page.goto(
    `${appOrigin}/login?error=google&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );

  await expect(page.getByRole("heading", { name: "외부 브라우저에서 로그인해 주세요" })).toBeVisible();
  const copyButton = page.getByRole("button", { name: "로그인 주소 복사" });
  await copyButton.focus();
  await expect(copyButton).toBeFocused();
  await copyButton.click();
  await expect(page.getByRole("status")).toContainText("로그인 주소를 복사했습니다");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    `${appOrigin}/login?error=google&returnTo=${encodeURIComponent(memberReturnTo)}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  await context.close();
});
```

- [ ] **Step 2: Run focused E2E and confirm it exercises only ReadMates**

Run:

```bash
corepack pnpm --dir front test:e2e -- tests/e2e/google-login-recovery.spec.ts
```

Expected: PASS with 2 tests; network logs show no navigation to the Google authorization endpoint because assertions stop at the generated href.

- [ ] **Step 3: Record the user-visible fix under Unreleased**

Add below `## Unreleased` in `CHANGELOG.md`:

```markdown
### Fixed

- **Google 로그인 복구:** 종료된 멤버십 또는 Google 인증 실패 뒤에는 다른 Google 계정을 명시적으로 선택해 다시 로그인할 수 있습니다. 카카오톡 인앱 브라우저에서는 외부 브라우저 안내와 로그인 주소 복사를 제공하며, 안전한 멤버 복귀 경로와 기존 OAuth·세션 보안 경계는 유지합니다.
```

- [ ] **Step 4: Run the complete frontend gates**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

Expected: all commands exit 0. If a full test fails, rerun the named failing file alone, fix the root cause, then rerun the complete command.

- [ ] **Step 5: Run the complete server gates**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: both commands exit 0; OAuth integration, architecture, formatting, static analysis, unit, and MySQL/Testcontainers lanes remain green.

- [ ] **Step 6: Run the canonical auth/BFF browser suite once at final HEAD**

Run:

```bash
corepack pnpm --dir front test:e2e
```

Expected: the complete Playwright suite exits 0, including the new recovery spec and existing Google invite/session fixtures.

- [ ] **Step 7: Run final diff, docs, and public-safety checks**

Run:

```bash
git diff --check
rg -n "(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)" CHANGELOG.md docs/superpowers/specs/2026-08-01-google-login-recovery-kakao-browser-design.md docs/superpowers/plans/2026-08-01-google-login-recovery-kakao-browser.md
git status --short --branch --untracked-files=all
```

Expected: `git diff --check` exits 0; the safety scan returns no matches; status contains only the intended feature files plus any unrelated user files discovered by the fresh status check. Do not stage unrelated paths.

- [ ] **Step 8: Commit browser evidence and release note**

```bash
git add front/tests/e2e/google-login-recovery.spec.ts CHANGELOG.md
git commit -m "test(auth): cover Google login recovery flow"
```

- [ ] **Step 9: Verify the final commit set and report residual runtime risk**

Run:

```bash
git log --oneline --decorate -7
git diff --stat 493c22d0..HEAD
git status --short --branch --untracked-files=all
```

Expected: the docs-only plan commit and six narrow implementation commits follow design commit `493c22d0`; no intended feature file is unstaged. Report that repository tests validate generated redirects and browser UX but do not prove current KakaoTalk iOS/Android or live Google behavior. A real-device, post-deploy check remains an operator follow-up and requires separate deployment scope.

---

## Requirement-to-Task Traceability

| Approved requirement | Implemented by | Evidence |
| --- | --- | --- |
| Normal login stays fast | Tasks 1 and 3 | model, URL, and login-card unit tests |
| LEFT/general failure forces account choice | Tasks 1-3 | frontend href test plus Spring redirect parameter integration test |
| Arbitrary provider parameters are ignored | Task 2 | negative MockMvc integration test |
| Safe member `returnTo` survives failure/retry | Task 5 | HMAC projection unit test and handler integration tests |
| Invite/auth/reset/root paths remain excluded | Tasks 1 and 5 | mirrored frontend/server exclusion tests and existing invite regression suite |
| Kakao browser receives proactive guidance | Task 4 | pure marker test and login UI test |
| External-browser continuation preserves state | Tasks 4 and 6 | canonical URL unit test and clipboard E2E |
| Clipboard failures remain recoverable | Task 4 | rejected Clipboard API unit test |
| 320px mobile and accessibility | Tasks 4 and 6 | semantic UI assertions and Playwright overflow test |
| Existing BFF/OAuth/session boundaries remain intact | Tasks 2, 5, and 6 | BFF unit, Spring integration, server gates, full E2E |
| No live provider or production mutation | Task 6 | E2E stops at href; handoff records live-runtime residual risk |

## Non-Goals Preserved

- No alternate login method, account-provider linking redesign, membership reactivation, invite recovery redesign, migration, dependency, provider scope, secret, deploy, or production change.
- No User-Agent security decision, browser fingerprinting, unofficial app scheme, Chrome intent, Google token persistence, or raw exception exposure.
- No edit, stage, or commit of unrelated user files discovered before or during execution.
