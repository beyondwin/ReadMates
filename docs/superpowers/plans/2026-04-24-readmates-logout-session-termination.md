# ReadMates Logout Session Termination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make logout terminate server and browser authentication so `/api/bff/api/auth/me` is anonymous after logout.

**Architecture:** Keep `readmates_session` ownership in `AuthSessionService`, but make the web logout adapter clear all browser-visible auth state: custom auth session, servlet session, Spring Security context, and `JSESSIONID`. Preserve existing frontend logout state reset and add regression coverage for server cookies, BFF multi-cookie forwarding, and E2E auth state after logout.

**Tech Stack:** Kotlin/Spring Boot, Spring Security, MockMvc, React/Vite, Cloudflare Pages Functions, Vitest, Playwright.

---

## File Map

- Modify `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`: expose a `clearedServletSessionCookie()` helper using the same secure-cookie setting.
- Modify `server/src/main/kotlin/com/readmates/auth/adapter/in/web/PasswordAuthController.kt`: invalidate servlet session, clear `SecurityContextHolder`, and add both clearing cookies.
- Modify `server/src/test/kotlin/com/readmates/auth/api/PasswordAuthControllerTest.kt`: verify custom session revoke plus `readmates_session` and `JSESSIONID` deletion cookies.
- Modify `front/tests/unit/cloudflare-bff.test.ts`: lock in forwarding of multiple `Set-Cookie` headers from logout upstream responses.
- Modify `front/tests/e2e/logout-flow.spec.ts`: assert `/api/bff/api/auth/me` returns `authenticated: false` immediately after logout.

## Task 1: Server Logout Clears All Session State

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthSessionService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/adapter/in/web/PasswordAuthController.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/PasswordAuthControllerTest.kt`

- [ ] **Step 1: Write the failing server test**

Add assertions to `logout revokes current session and clears cookie`:

```kotlin
val setCookieHeaders = result.response.getHeaders("Set-Cookie")
assertEquals(
    true,
    setCookieHeaders.any { it.startsWith("${AuthSessionService.COOKIE_NAME}=;") && it.contains("Max-Age=0") },
)
assertEquals(
    true,
    setCookieHeaders.any { it.startsWith("JSESSIONID=;") && it.contains("Max-Age=0") },
)
```

Capture the result:

```kotlin
val result = mockMvc.post("/api/auth/logout") {
    cookie(cookie)
}.andExpect {
    status { isNoContent() }
    cookie { maxAge(AuthSessionService.COOKIE_NAME, 0) }
}.andReturn()
```

- [ ] **Step 2: Run the failing server test**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.PasswordAuthControllerTest
```

Expected: FAIL because `JSESSIONID` is not yet cleared by logout.

- [ ] **Step 3: Implement the minimal server change**

In `AuthSessionService`, add:

```kotlin
fun clearedServletSessionCookie(): String =
    ResponseCookie
        .from("JSESSIONID", "")
        .httpOnly(true)
        .secure(secureCookie)
        .sameSite("Lax")
        .path("/")
        .maxAge(Duration.ZERO)
        .build()
        .toString()
```

In `PasswordAuthController`, import `org.springframework.security.core.context.SecurityContextHolder`, then update `logout`:

```kotlin
@PostMapping("/api/auth/logout")
@ResponseStatus(HttpStatus.NO_CONTENT)
fun logout(request: HttpServletRequest, response: HttpServletResponse) {
    val rawToken = request.cookies
        ?.firstOrNull { it.name == logoutAuthSessionUseCase.sessionCookieName }
        ?.value

    request.getSession(false)?.invalidate()
    SecurityContextHolder.clearContext()
    response.addHeader(HttpHeaders.SET_COOKIE, logoutAuthSessionUseCase.logout(rawToken))
    response.addHeader(HttpHeaders.SET_COOKIE, logoutAuthSessionUseCase.clearedServletSessionCookie())
}
```

If `LogoutAuthSessionUseCase` does not expose `clearedServletSessionCookie`, add it to `server/src/main/kotlin/com/readmates/auth/application/port/in/AuthSessionUseCases.kt`:

```kotlin
interface LogoutAuthSessionUseCase {
    val sessionCookieName: String
    fun logout(rawToken: String?): String
    fun clearedServletSessionCookie(): String
}
```

- [ ] **Step 4: Run the server test again**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.PasswordAuthControllerTest
```

Expected: PASS.

## Task 2: BFF Preserves Multiple Logout Cookies

**Files:**
- Modify: `front/tests/unit/cloudflare-bff.test.ts`
- Optional modify: `front/functions/api/bff/[[path]].ts`

- [ ] **Step 1: Write or strengthen the BFF test**

Add a test near the existing BFF cookie tests:

```ts
it("forwards multiple logout Set-Cookie headers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const headers = new Headers();
      headers.append("Set-Cookie", "readmates_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
      headers.append("Set-Cookie", "JSESSIONID=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax");
      return new Response(null, { status: 204, headers });
    }),
  );

  const response = await onRequest(
    context(
      new Request("https://readmates.pages.dev/api/bff/api/auth/logout", {
        method: "POST",
        headers: { Origin: "https://readmates.pages.dev" },
      }),
      { path: ["api", "auth", "logout"] },
    ),
  );

  expect(response.status).toBe(204);
  expect(response.headers.get("set-cookie")).toContain("readmates_session=;");
  expect(response.headers.get("set-cookie")).toContain("JSESSIONID=;");
});
```

- [ ] **Step 2: Run the BFF test**

Run:

```bash
pnpm --dir front test -- cloudflare-bff
```

Expected: PASS if current header copy behavior already preserves both cookies; otherwise FAIL.

- [ ] **Step 3: Adjust BFF only if the test fails**

If `Headers` collapses cookies in this runtime, update `copyUpstreamHeaders` to prefer `getSetCookie()` and append all returned values. Do not alter path validation or mutation origin checks.

## Task 3: E2E Confirms Anonymous Auth After Logout

**Files:**
- Modify: `front/tests/e2e/logout-flow.spec.ts`

- [ ] **Step 1: Strengthen the E2E assertion**

After clicking logout and asserting `/login`, add:

```ts
const authMe = await page.evaluate(async () => {
  const response = await fetch("/api/bff/api/auth/me", { cache: "no-store" });
  return {
    status: response.status,
    body: await response.json(),
  };
});
expect(authMe.status).toBe(200);
expect(authMe.body.authenticated).toBe(false);
expect(authMe.body.approvalState).toBe("ANONYMOUS");
```

- [ ] **Step 2: Run the E2E logout spec**

Run:

```bash
pnpm --dir front test:e2e -- logout-flow
```

Expected: PASS after Task 1.

## Task 4: Full Relevant Verification

**Files:**
- No new files.

- [ ] **Step 1: Run server tests**

Run:

```bash
./server/gradlew -p server clean test
```

Expected: PASS.

- [ ] **Step 2: Run frontend unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 3: Run auth/user-flow E2E**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS.

## Self-Review

- Spec coverage: server logout, BFF cookie forwarding, public top-nav stale-state protection, `/api/auth/me` anonymous assertion, and `/app` redirect are covered.
- Placeholder scan: no placeholder markers or unspecified test steps.
- Type consistency: `LogoutAuthSessionUseCase`, `AuthSessionService`, and MockMvc cookie assertions match existing project names.
