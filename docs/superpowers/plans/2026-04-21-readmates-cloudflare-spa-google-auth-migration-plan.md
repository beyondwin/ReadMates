# ReadMates Cloudflare SPA And Google Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ReadMates from a Vercel/Next.js frontend to a Cloudflare Pages hosted Vite React SPA with Cloudflare Pages Function BFF, Google-only login, approval-pending members, and browser-based PDF saving.

**Architecture:** Cloudflare Pages serves the static SPA and uses Pages Functions as a thin same-origin BFF for `/api/bff/**`, `/oauth2/authorization/**`, and `/login/oauth2/code/**`. OCI Spring Boot remains the source of truth for OAuth, sessions, membership status, permissions, and all domain APIs. Browser PDF export uses a React print view and `window.print()` instead of a server Playwright route.

**Tech Stack:** Kotlin Spring Boot, Spring Security OAuth2 Client, MySQL/Flyway, React 19, Vite, React Router, Cloudflare Pages Functions, Vitest, Playwright E2E.

---

## Scope Check

This is a cross-cutting migration touching frontend runtime, edge proxy, backend auth, authorization, data migration, and deployment. Keep it as one release train because the SPA, BFF, OAuth callback origin, and session cookie behavior must land together. The tasks below are still split into independently reviewable commits.

## File Structure Map

Backend files:

- Create `server/src/main/resources/db/mysql/migration/V9__google_auth_pending_approval.sql`: MySQL schema/data migration for `PENDING_APPROVAL` and Google-only legacy user conversion.
- Modify `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`: add `PENDING_APPROVAL`.
- Modify `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`: expose membership status and pending approval identity.
- Modify `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`: return status and approval state.
- Modify `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`: resolve active or pending Google members, connect existing Gmail users, create pending users.
- Create `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt`: own Google account connection and pending membership creation.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/GoogleOidcUserService.kt`: keep verified-email validation.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`: enable OAuth2 login and permit OAuth endpoints.
- Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`: issue ReadMates session cookie after OAuth success.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`: grant `ROLE_PENDING_APPROVAL` for pending members.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`: refresh `ROLE_HOST`, `ROLE_MEMBER`, and `ROLE_PENDING_APPROVAL`.
- Create `server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt`: host approval endpoints.
- Create `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt`: list, approve, and reject pending memberships.
- Modify `server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt`: explicitly reject pending users from feedback documents.

Frontend files:

- Create `front/index.html`, `front/src/main.tsx`, `front/src/app/router.tsx`, `front/src/app/auth-context.tsx`.
- Create `front/src/styles/globals.css`: moved copy of the current `front/app/globals.css` for Vite.
- Create `front/src/pages/login.tsx`, `front/src/pages/pending-approval.tsx`, `front/src/pages/feedback-print.tsx`.
- Modify or move existing `front/app/**/page.tsx` route components into `front/src/pages/**`.
- Modify `front/shared/api/readmates.ts`: browser-only API client and new auth types.
- Modify `front/shared/ui/top-nav.tsx`, `front/shared/ui/mobile-header.tsx`, `front/shared/ui/mobile-tab-bar.tsx`, `front/shared/ui/public-auth-action.tsx`: replace Next navigation and `guest` naming.
- Modify `front/features/auth/components/login-card.tsx`: Google-only login UI.
- Modify `front/features/feedback/components/feedback-document-page.tsx`: link to print route and keep print mode.
- Delete `front/app/(app)/app/feedback/[sessionId]/pdf/route.ts`.
- Delete or replace password-specific tests under `front/tests/unit/*password*`, `front/tests/unit/login-card.test.tsx`, and password E2E specs.
- Create `front/functions/api/bff/[[path]].ts`, `front/functions/oauth2/authorization/[[registrationId]].ts`, `front/functions/login/oauth2/code/[[registrationId]].ts`.
- Modify `front/package.json`, `front/vitest.config.ts`, `front/playwright.config.ts`, and create `front/vite.config.ts`, `front/tsconfig.json` if the current config is Next-specific.

Docs and deployment:

- Create `docs/deploy/cloudflare-pages-spa.md`.
- Modify README or deploy script references that still mention Vercel once Task 14 removes Next.js runtime files.

---

### Task 1: Add Membership Status And Database Migration

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V9__google_auth_pending_approval.sql`
- Modify: `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt`
- Test: `server/src/test/kotlin/com/readmates/support/MySqlFlywayMigrationTest.kt`

- [x] **Step 1: Write the migration file**

Create `server/src/main/resources/db/mysql/migration/V9__google_auth_pending_approval.sql`:

```sql
alter table memberships drop check memberships_status_check;

alter table memberships
  add constraint memberships_status_check
  check (status in ('INVITED', 'PENDING_APPROVAL', 'ACTIVE', 'INACTIVE'));

update users
set auth_provider = 'GOOGLE',
    password_hash = null,
    password_set_at = null,
    updated_at = utc_timestamp(6)
where auth_provider = 'PASSWORD';
```

- [x] **Step 2: Update the enum**

Change `server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt` to:

```kotlin
package com.readmates.auth.domain

enum class MembershipStatus {
    INVITED,
    PENDING_APPROVAL,
    ACTIVE,
    INACTIVE,
}
```

- [x] **Step 3: Run the MySQL migration test**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.support.MySqlFlywayMigrationTest
```

Expected: PASS. If it fails with a check-constraint name mismatch, inspect the generated MySQL constraint name in the failure and update the migration to drop the exact existing constraint used by `V1__readmates_mysql_baseline.sql`.

- [x] **Step 4: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V9__google_auth_pending_approval.sql server/src/main/kotlin/com/readmates/auth/domain/MembershipStatus.kt
git commit -m "feat: add pending approval membership status"
```

---

### Task 2: Extend Auth Identity To Distinguish Active And Pending Users

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`

- [x] **Step 1: Write failing auth-me tests**

Add these test cases to `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`:

```kotlin
@Test
fun `auth me returns pending approval status without member role`() {
    val pendingCookie = loginAsGooglePendingUser("pending.approval@example.com", "google-pending-auth-me")

    mockMvc.get("/api/auth/me") {
        cookie(pendingCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(true) }
        jsonPath("$.email") { value("pending.approval@example.com") }
        jsonPath("$.membershipStatus") { value("PENDING_APPROVAL") }
        jsonPath("$.approvalState") { value("PENDING_APPROVAL") }
        jsonPath("$.role") { value("MEMBER") }
    }
}

@Test
fun `auth me returns active approval state for active member`() {
    val activeCookie = loginAndReturnSessionCookie("host@example.com", "correct horse battery staple")

    mockMvc.get("/api/auth/me") {
        cookie(activeCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.authenticated") { value(true) }
        jsonPath("$.membershipStatus") { value("ACTIVE") }
        jsonPath("$.approvalState") { value("ACTIVE") }
    }
}
```

Use existing test helpers in the file for session cookie issuance. If the file has no Google helper yet, create a private helper in the same test file that inserts a `users` row and a `memberships.status='PENDING_APPROVAL'` row, then calls `AuthSessionService.issueSession`.

- [x] **Step 2: Run the targeted test and verify failure**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.AuthMeControllerTest
```

Expected: FAIL because `membershipStatus` and `approvalState` are missing.

- [x] **Step 3: Update identity and response types**

In `server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt`, add `membershipStatus`:

```kotlin
data class CurrentMember(
    val userId: UUID,
    val membershipId: UUID,
    val clubId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val role: MembershipRole,
    val membershipStatus: MembershipStatus = MembershipStatus.ACTIVE,
) {
    val isHost: Boolean get() = role == MembershipRole.HOST && membershipStatus == MembershipStatus.ACTIVE
    val isActive: Boolean get() = membershipStatus == MembershipStatus.ACTIVE
    val isPendingApproval: Boolean get() = membershipStatus == MembershipStatus.PENDING_APPROVAL
}
```

Add imports:

```kotlin
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import java.util.UUID
```

In `server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt`, add:

```kotlin
enum class ApprovalState {
    ANONYMOUS,
    PENDING_APPROVAL,
    ACTIVE,
    INACTIVE,
}
```

Extend `AuthMemberResponse`:

```kotlin
val membershipStatus: MembershipStatus?,
val approvalState: ApprovalState,
```

Set `approvalState` from `member.membershipStatus`:

```kotlin
approvalState = when (member.membershipStatus) {
    MembershipStatus.PENDING_APPROVAL -> ApprovalState.PENDING_APPROVAL
    MembershipStatus.ACTIVE -> ApprovalState.ACTIVE
    MembershipStatus.INACTIVE -> ApprovalState.INACTIVE
    MembershipStatus.INVITED -> ApprovalState.INACTIVE
}
```

Set anonymous response to:

```kotlin
membershipStatus = null,
approvalState = ApprovalState.ANONYMOUS,
```

- [x] **Step 4: Include membership status in repository queries**

In every `CurrentMember` mapping query in `MemberAccountRepository.kt`, select:

```sql
memberships.status as membership_status
```

In `toCurrentMember()`, set:

```kotlin
membershipStatus = MembershipStatus.valueOf(getString("membership_status")),
```

Add:

```kotlin
import com.readmates.auth.domain.MembershipStatus
```

- [x] **Step 5: Run tests**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.AuthMeControllerTest
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/shared/security/CurrentMember.kt server/src/main/kotlin/com/readmates/auth/api/AuthMeController.kt server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt
git commit -m "feat: expose pending approval auth state"
```

Adjustment: pending authority mapping from Task 6 Step 3 was applied in this task so `PENDING_APPROVAL` sessions are not temporarily granted `ROLE_MEMBER` while auth identity starts resolving pending memberships.

---

### Task 3: Implement Google Account Connection And Pending Creation

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt`

- [x] **Step 1: Write service tests**

Create `server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt`:

```kotlin
package com.readmates.auth.application

import com.readmates.auth.domain.MembershipStatus
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
class GoogleLoginServiceTest(
    @param:Autowired private val googleLoginService: GoogleLoginService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `connects existing gmail user and preserves active membership`() {
        val member = googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = "google-existing-wooseung",
            email = "host@example.com",
            displayName = "김호스트",
            profileImageUrl = "https://example.com/wooseung.png",
        )

        assertEquals("host@example.com", member.email)
        assertEquals(MembershipStatus.ACTIVE, member.membershipStatus)
        assertEquals("HOST", member.role.name)

        val subject = jdbcTemplate.queryForObject(
            "select google_subject_id from users where email = 'host@example.com'",
            String::class.java,
        )
        assertEquals("google-existing-wooseung", subject)
    }

    @Test
    fun `creates pending approval membership for new google user`() {
        val member = googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = "google-new-pending-user",
            email = "new.pending@example.com",
            displayName = "New Pending",
            profileImageUrl = "https://example.com/new.png",
        )

        assertEquals("new.pending@example.com", member.email)
        assertEquals(MembershipStatus.PENDING_APPROVAL, member.membershipStatus)
        assertEquals("MEMBER", member.role.name)
        assertNotNull(member.membershipId)
    }

    @Test
    fun `rejects google subject already connected to another email`() {
        googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = "google-conflict-subject",
            email = "conflict.one@example.com",
            displayName = "Conflict One",
            profileImageUrl = null,
        )

        org.junit.jupiter.api.assertThrows<GoogleLoginException> {
            googleLoginService.loginVerifiedGoogleUser(
                googleSubjectId = "google-conflict-subject",
                email = "conflict.two@example.com",
                displayName = "Conflict Two",
                profileImageUrl = null,
            )
        }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run the test and verify failure**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.application.GoogleLoginServiceTest
```

Expected: FAIL because `GoogleLoginService` does not exist.

- [x] **Step 3: Add repository methods**

In `MemberAccountRepository.kt`, add public methods:

```kotlin
fun findMemberByGoogleSubject(googleSubjectId: String): CurrentMember?
fun findAnyUserIdByEmail(email: String): UUID?
fun connectGoogleSubject(userId: UUID, googleSubjectId: String, profileImageUrl: String?): Boolean
fun createPendingGoogleMember(googleSubjectId: String, email: String, displayName: String?, profileImageUrl: String?): CurrentMember
fun findMemberByUserIdIncludingPending(userId: UUID): CurrentMember?
fun googleSubjectOwnerEmail(googleSubjectId: String): String?
```

Use the same SQL style as existing repository methods. All member lookup queries must include `memberships.status in ('ACTIVE', 'PENDING_APPROVAL')` and select `memberships.status as membership_status`.

- [x] **Step 4: Create the service**

Create `server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt`:

```kotlin
package com.readmates.auth.application

import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ResponseStatus
import java.util.Locale
import java.util.UUID

@ResponseStatus(HttpStatus.UNAUTHORIZED)
class GoogleLoginException(message: String) : RuntimeException(message)

@Service
class GoogleLoginService(
    private val memberAccountRepository: MemberAccountRepository,
) {
    @Transactional
    fun loginVerifiedGoogleUser(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ) = connectOrCreate(
        googleSubjectId = googleSubjectId.trim().takeIf { it.isNotEmpty() }
            ?: throw GoogleLoginException("Google subject is required"),
        normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
            ?: throw GoogleLoginException("Google email is required"),
        displayName = displayName,
        profileImageUrl = profileImageUrl,
    )

    private fun connectOrCreate(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ) = memberAccountRepository.findMemberByGoogleSubject(googleSubjectId)
        ?: connectExistingEmailUser(googleSubjectId, normalizedEmail, profileImageUrl)
        ?: memberAccountRepository.createPendingGoogleMember(
            googleSubjectId = googleSubjectId,
            email = normalizedEmail,
            displayName = displayName,
            profileImageUrl = profileImageUrl,
        )

    private fun connectExistingEmailUser(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
    ): com.readmates.shared.security.CurrentMember? {
        val ownerEmail = memberAccountRepository.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }

        val userId = memberAccountRepository.findAnyUserIdByEmail(normalizedEmail) ?: return null
        val connected = memberAccountRepository.connectGoogleSubject(
            userId = userId,
            googleSubjectId = googleSubjectId,
            profileImageUrl = profileImageUrl,
        )
        if (!connected) {
            throw GoogleLoginException("Existing user is connected to a different Google account")
        }
        return memberAccountRepository.findMemberByUserIdIncludingPending(userId)
            ?: throw GoogleLoginException("Connected user has no membership")
    }
}
```

- [x] **Step 5: Run the test**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.application.GoogleLoginServiceTest
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/GoogleLoginService.kt server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt server/src/test/kotlin/com/readmates/auth/application/GoogleLoginServiceTest.kt
git commit -m "feat: connect google login accounts"
```

---

### Task 4: Enable Spring OAuth Login And ReadMates Session Cookie

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/GoogleOidcUserService.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt`

- [x] **Step 1: Replace the existing OAuth inactive test**

In `OAuthAuthorizationControllerTest.kt`, replace tests that expect unauthorized with:

```kotlin
@Test
fun `google authorization endpoint redirects to provider when client registration is configured`() {
    mockMvc.get("/oauth2/authorization/google")
        .andExpect {
            status { is3xxRedirection() }
            redirectedUrlPattern("https://accounts.google.com/o/oauth2/v2/auth?*")
        }
}
```

- [x] **Step 2: Add a success-handler test**

Create `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=https://readmates.pages.dev",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "spring.security.oauth2.client.registration.google.scope=openid,email,profile",
    ],
)
@AutoConfigureMockMvc
class GoogleOAuthLoginSessionTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `successful google login issues readmates session cookie and redirects to app`() {
        mockMvc.get("/login/oauth2/code/google") {
            with(
                oidcLogin().idToken { token ->
                    token.subject("google-oauth-session-existing")
                    token.claim("email", "host@example.com")
                    token.claim("email_verified", true)
                    token.claim("name", "김호스트")
                    token.claim("picture", "https://example.com/avatar.png")
                },
            )
        }.andExpect {
            status { is3xxRedirection() }
            redirectedUrl("https://readmates.pages.dev/app")
            cookie { exists(AuthSessionService.COOKIE_NAME) }
        }
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 3: Run tests and verify failure**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.OAuthAuthorizationControllerTest --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest
```

Expected: FAIL because OAuth login is not wired to issue `readmates_session`.

- [x] **Step 4: Create success handler**

Create `ReadmatesOAuthSuccessHandler.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.AuthSessionService
import com.readmates.auth.application.GoogleLoginService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.core.Authentication
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component

@Component
class ReadmatesOAuthSuccessHandler(
    private val googleLoginService: GoogleLoginService,
    private val authSessionService: AuthSessionService,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) : AuthenticationSuccessHandler {
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val oidcUser = authentication.principal as OidcUser
        val member = googleLoginService.loginVerifiedGoogleUser(
            googleSubjectId = oidcUser.subject,
            email = oidcUser.email,
            displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
            profileImageUrl = oidcUser.getClaimAsString("picture"),
        )
        val issuedSession = authSessionService.issueSession(
            userId = member.userId.toString(),
            userAgent = request.getHeader("User-Agent"),
            ipAddress = request.remoteAddr,
        )
        response.addHeader("Set-Cookie", authSessionService.sessionCookie(issuedSession.rawToken))
        response.sendRedirect("${appBaseUrl.trimEnd('/')}/app")
    }
}
```

- [x] **Step 5: Wire OAuth in SecurityConfig**

Change constructor parameters:

```kotlin
private val googleOidcUserService: GoogleOidcUserService,
private val readmatesOAuthSuccessHandler: ReadmatesOAuthSuccessHandler,
```

Add to `securityFilterChain` before `exceptionHandling`:

```kotlin
.oauth2Login {
    it.userInfoEndpoint { endpoint ->
        endpoint.oidcUserService(googleOidcUserService)
    }
    it.successHandler(readmatesOAuthSuccessHandler)
}
```

Permit:

```kotlin
"/oauth2/**",
"/login/oauth2/**",
```

Annotate `GoogleOidcUserService` as a bean:

```kotlin
@Component
class GoogleOidcUserService : OidcUserService() {
```

- [x] **Step 6: Run tests**

Run:

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.OAuthAuthorizationControllerTest --tests com.readmates.auth.api.GoogleOAuthLoginSessionTest
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/ReadmatesOAuthSuccessHandler.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/GoogleOidcUserService.kt server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt
git commit -m "feat: issue readmates session from google oauth"
```

---

### Task 5: Add Host Approval API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/HostMemberApprovalControllerTest.kt`

- [x] **Step 1: Write API tests**

Create `HostMemberApprovalControllerTest.kt` with three cases:

```kotlin
@Test
fun `host lists pending approvals`() {
    val hostCookie = loginAndReturnSessionCookie("host@example.com", "correct horse battery staple")
    insertPendingMember("pending.list@example.com", "Pending List")

    mockMvc.get("/api/host/members/pending-approvals") {
        cookie(hostCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$[0].email") { value("pending.list@example.com") }
        jsonPath("$[0].status") { value("PENDING_APPROVAL") }
    }
}

@Test
fun `host approves pending member`() {
    val hostCookie = loginAndReturnSessionCookie("host@example.com", "correct horse battery staple")
    val membershipId = insertPendingMember("pending.approve@example.com", "Pending Approve")

    mockMvc.post("/api/host/members/$membershipId/approve") {
        cookie(hostCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.status") { value("ACTIVE") }
    }
}

@Test
fun `host rejects pending member`() {
    val hostCookie = loginAndReturnSessionCookie("host@example.com", "correct horse battery staple")
    val membershipId = insertPendingMember("pending.reject@example.com", "Pending Reject")

    mockMvc.post("/api/host/members/$membershipId/reject") {
        cookie(hostCookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.status") { value("INACTIVE") }
    }
}
```

Use the file's private helpers to insert users and memberships into the seeded `reading-sai` club.

- [x] **Step 2: Run tests and verify failure**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.HostMemberApprovalControllerTest
```

Expected: FAIL with 404 for approval endpoints.

- [x] **Step 3: Implement service**

Create response type and methods:

```kotlin
data class PendingApprovalMemberResponse(
    val membershipId: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val status: MembershipStatus,
    val createdAt: String,
)
```

Service methods:

```kotlin
fun listPending(host: CurrentMember): List<PendingApprovalMemberResponse>
fun approve(host: CurrentMember, membershipId: UUID): PendingApprovalMemberResponse
fun reject(host: CurrentMember, membershipId: UUID): PendingApprovalMemberResponse
```

`approve` updates `status='ACTIVE'`, `joined_at=utc_timestamp(6)`, and adds the membership to the current open session using the same SQL pattern as `InvitationService.addToCurrentOpenSession`.

- [x] **Step 4: Implement controller**

Create `HostMemberApprovalController.kt`:

```kotlin
@RestController
@RequestMapping("/api/host/members")
class HostMemberApprovalController(
    private val memberApprovalService: MemberApprovalService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @GetMapping("/pending-approvals")
    fun pending(authentication: Authentication?) =
        memberApprovalService.listPending(requireHost(authentication))

    @PostMapping("/{membershipId}/approve")
    fun approve(authentication: Authentication?, @PathVariable membershipId: UUID) =
        memberApprovalService.approve(requireHost(authentication), membershipId)

    @PostMapping("/{membershipId}/reject")
    fun reject(authentication: Authentication?, @PathVariable membershipId: UUID) =
        memberApprovalService.reject(requireHost(authentication), membershipId)

    private fun requireHost(authentication: Authentication?): CurrentMember =
        authenticatedMemberResolver.resolve(authentication)
            ?.takeIf { it.isHost }
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "Host role required")
}
```

- [x] **Step 5: Run tests**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.HostMemberApprovalControllerTest
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/MemberApprovalService.kt server/src/main/kotlin/com/readmates/auth/api/HostMemberApprovalController.kt server/src/test/kotlin/com/readmates/auth/api/HostMemberApprovalControllerTest.kt
git commit -m "feat: add host member approval api"
```

---

### Task 6: Enforce Pending Approval Read-Only Access And Feedback Restriction

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt`
- Modify: `server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/PendingApprovalSecurityTest.kt`

- [x] **Step 1: Write security tests**

Create `PendingApprovalSecurityTest.kt`:

```kotlin
@Test
fun `pending approval can read auth me`() {
    val cookie = pendingSessionCookie("pending.readonly@example.com")
    mockMvc.get("/api/auth/me") { cookie(cookie) }
        .andExpect { status { isOk() } }
}

@Test
fun `pending approval cannot mutate current session`() {
    val cookie = pendingSessionCookie("pending.write@example.com")
    mockMvc.post("/api/sessions/current/questions") {
        cookie(cookie)
        contentType = MediaType.APPLICATION_JSON
        content = """{"questions":[{"priority":1,"text":"Question?","draftThought":null}]}"""
    }.andExpect { status { isForbidden() } }
}

@Test
fun `pending approval cannot read feedback document`() {
    val cookie = pendingSessionCookie("pending.feedback@example.com")
    mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
        cookie(cookie)
    }.andExpect { status { isForbidden() } }
}

@Test
fun `pending approval cannot access host api`() {
    val cookie = pendingSessionCookie("pending.host@example.com")
    mockMvc.get("/api/host/dashboard") { cookie(cookie) }
        .andExpect { status { isForbidden() } }
}
```

- [x] **Step 2: Run and verify failure**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.PendingApprovalSecurityTest
```

Expected: FAIL because pending role mapping and access rules are not complete.

- [x] **Step 3: Grant pending authority**

In session and authority filters, map pending members:

```kotlin
val roleAuthority = when {
    member.isPendingApproval -> "ROLE_PENDING_APPROVAL"
    else -> "ROLE_${member.role}"
}
```

Filter out stale authorities:

```kotlin
.filterNot { it.authority in setOf("ROLE_HOST", "ROLE_MEMBER", "ROLE_PENDING_APPROVAL") }
```

- [x] **Step 4: Update SecurityConfig authorization**

Permit pending users for safe read endpoints only:

```kotlin
.requestMatchers(HttpMethod.GET, "/api/auth/me").hasAnyRole("HOST", "MEMBER", "PENDING_APPROVAL")
.requestMatchers(HttpMethod.GET, "/api/public/**").permitAll()
.requestMatchers(HttpMethod.GET, "/api/app/pending").hasRole("PENDING_APPROVAL")
.requestMatchers("/api/host/**").hasRole("HOST")
.requestMatchers(HttpMethod.GET, "/api/**").hasAnyRole("HOST", "MEMBER")
.requestMatchers("/api/**").hasAnyRole("HOST", "MEMBER")
```

Import `org.springframework.http.HttpMethod`.

- [x] **Step 5: Add explicit feedback guard**

In `FeedbackDocumentController`, reject pending memberships before attendee checks:

```kotlin
if (currentMember.isPendingApproval) {
    throw ResponseStatusException(HttpStatus.FORBIDDEN, "Feedback documents require approved membership")
}
```

- [x] **Step 6: Run tests**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.PendingApprovalSecurityTest
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt server/src/main/kotlin/com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt server/src/main/kotlin/com/readmates/feedback/api/FeedbackDocumentController.kt server/src/test/kotlin/com/readmates/auth/api/PendingApprovalSecurityTest.kt
git commit -m "feat: restrict pending approval permissions"
```

---

### Task 7: Add Pending Approval Read API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/api/PendingApprovalController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/application/PendingApprovalReadService.kt`
- Test: `server/src/test/kotlin/com/readmates/auth/api/PendingApprovalControllerTest.kt`

- [x] **Step 1: Write controller test**

Create a test that expects pending users to get basic state:

```kotlin
@Test
fun `pending approval user can read pending app summary`() {
    val cookie = pendingSessionCookie("pending.summary@example.com")

    mockMvc.get("/api/app/pending") {
        cookie(cookie)
    }.andExpect {
        status { isOk() }
        jsonPath("$.approvalState") { value("PENDING_APPROVAL") }
        jsonPath("$.clubName") { value("ReadMates") }
        jsonPath("$.currentSession") { exists() }
    }
}
```

- [x] **Step 2: Run and verify failure**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.PendingApprovalControllerTest
```

Expected: FAIL with 404.

- [x] **Step 3: Implement response and service**

Create response types:

```kotlin
data class PendingApprovalAppResponse(
    val approvalState: String,
    val clubName: String,
    val currentSession: PendingCurrentSessionResponse?,
)

data class PendingCurrentSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val date: String,
    val locationLabel: String,
)
```

Service query selects the latest `OPEN` or `PUBLISHED` session for the user's club and returns null if no session exists.

- [x] **Step 4: Implement controller**

```kotlin
@RestController
@RequestMapping("/api/app/pending")
class PendingApprovalController(
    private val service: PendingApprovalReadService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) {
    @GetMapping
    fun get(authentication: Authentication?): PendingApprovalAppResponse {
        val member = authenticatedMemberResolver.resolve(authentication)
            ?.takeIf { it.isPendingApproval }
            ?: throw ResponseStatusException(HttpStatus.FORBIDDEN, "Pending approval required")
        return service.get(member)
    }
}
```

- [x] **Step 5: Run tests**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.PendingApprovalControllerTest
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/api/PendingApprovalController.kt server/src/main/kotlin/com/readmates/auth/application/PendingApprovalReadService.kt server/src/test/kotlin/com/readmates/auth/api/PendingApprovalControllerTest.kt
git commit -m "feat: add pending approval read api"
```

---

### Task 8: Replace Password Login Surfaces With Google Login

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/api/PasswordAuthController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/PasswordResetController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt`
- Test: existing password tests converted or removed under `server/src/test/kotlin/com/readmates/auth/api/*Password*`
- Modify: `front/features/auth/components/login-card.tsx`
- Modify: `front/features/auth/actions/password-auth.ts`
- Test: `front/tests/unit/login-card.test.tsx`

- [x] **Step 1: Change frontend login-card tests**

In `front/tests/unit/login-card.test.tsx`, keep only Google UI expectations:

```tsx
it("shows only the Google login action", () => {
  render(<LoginCard />);

  expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
    "href",
    "/oauth2/authorization/google",
  );
  expect(screen.queryByLabelText("이메일")).toBeNull();
  expect(screen.queryByLabelText("비밀번호")).toBeNull();
});
```

- [x] **Step 2: Run frontend test and verify failure**

```bash
cd <local-workspace>/ReadMates/front
pnpm test -- login-card.test.tsx
```

Expected: FAIL because password controls still render.

- [x] **Step 3: Replace login UI**

Change `LoginCard` to render one action:

```tsx
export function LoginCard() {
  return (
    <section className="auth-card">
      <p className="eyebrow">Login</p>
      <h1 className="h1 editorial">ReadMates 로그인</h1>
      <p className="body" style={{ color: "var(--text-2)" }}>
        Google 계정으로 로그인하면 기존 Gmail 회원 기록이 자동으로 연결됩니다.
      </p>
      <a className="btn btn-primary btn-lg" href="/oauth2/authorization/google">
        Google로 계속하기
      </a>
    </section>
  );
}
```

- [x] **Step 4: Server endpoints return 410**

For removed password APIs, return 410 Gone:

```kotlin
throw ResponseStatusException(HttpStatus.GONE, "Password login has been removed")
```

Apply to password login, password reset issue/reset, and password invitation acceptance endpoints. Keep logout active because Google session logout still needs it.

- [x] **Step 5: Run tests**

```bash
cd <local-workspace>/ReadMates/front
pnpm test -- login-card.test.tsx

cd <local-workspace>/ReadMates/server
./gradlew test --tests com.readmates.auth.api.PasswordAuthControllerTest --tests com.readmates.auth.api.PasswordResetControllerTest
```

Expected: frontend PASS. Backend password tests either PASS with 410 expectations or are deleted in the same commit with no references from Gradle.

- [x] **Step 6: Commit**

```bash
git add front/features/auth/components/login-card.tsx front/tests/unit/login-card.test.tsx server/src/main/kotlin/com/readmates/auth/api/PasswordAuthController.kt server/src/main/kotlin/com/readmates/auth/api/PasswordResetController.kt server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt server/src/test/kotlin/com/readmates/auth/api
git commit -m "feat: replace password login with google login"
```

Adjustment: Task 8 also preserves Google invitation acceptance after removing password invite acceptance. The OAuth authorization proxy now forwards host/proto to Spring so Spring stores the public callback URI, and backend OAuth success consumes a captured invite token to accept a matching pending invitation.

---

### Task 9: Add Cloudflare Pages Function BFF

**Files:**
- Create: `front/functions/api/bff/[[path]].ts`
- Create: `front/functions/oauth2/authorization/[[registrationId]].ts`
- Create: `front/functions/login/oauth2/code/[[registrationId]].ts`
- Create: `front/tests/unit/cloudflare-bff.test.ts`
- Create: `front/tests/unit/cloudflare-oauth-proxy.test.ts`

- [x] **Step 1: Write BFF tests**

Create tests that import the function handler and assert:

```ts
it("forwards api requests with bff secret", async () => {
  const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const response = await onRequest({
    request: new Request("https://readmates.pages.dev/api/bff/api/auth/me"),
    env: {
      READMATES_API_BASE_URL: "https://api.example.com",
      READMATES_BFF_SECRET: "secret",
    },
    params: { path: ["api", "auth", "me"] },
  } as unknown as EventContext<Env, string, unknown>);

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.example.com/api/auth/me",
    expect.objectContaining({
      headers: expect.any(Headers),
    }),
  );
});
```

Also test non-`/api/**` path returns 404 and cross-origin POST returns 403.

- [x] **Step 2: Implement BFF function**

Implement the same policy as the old Next route:

```ts
type Env = {
  READMATES_API_BASE_URL: string;
  READMATES_BFF_SECRET?: string;
};

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const onRequest: PagesFunction<Env> = async (context) => {
  const request = context.request;
  const path = Array.isArray(context.params.path)
    ? context.params.path
    : [context.params.path].filter(Boolean) as string[];
  const upstreamPath = buildApiUpstreamPath(path);
  if (!upstreamPath) return new Response(null, { status: 404 });
  if (!isSameOriginMutation(request)) return new Response(null, { status: 403 });

  const upstreamUrl = new URL(upstreamPath, context.env.READMATES_API_BASE_URL);
  upstreamUrl.search = new URL(request.url).search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");
  if (contentType) headers.set("Content-Type", contentType);
  if (cookie) headers.set("Cookie", cookie);
  if (context.env.READMATES_BFF_SECRET?.trim()) {
    headers.set("X-Readmates-Bff-Secret", context.env.READMATES_BFF_SECRET.trim());
  }
  if (MUTATING_METHODS.has(request.method)) {
    const origin = new URL(request.url).origin;
    headers.set("Origin", origin);
    headers.set("Referer", origin);
  }

  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
  const upstream = await fetch(upstreamUrl.toString(), {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  });
  return new Response(["HEAD"].includes(request.method) ? null : upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  });
};
```

- [x] **Step 3: Implement OAuth proxy functions**

Both OAuth functions forward to Spring with query string and cookies:

```ts
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const sourceUrl = new URL(request.url);
  const registrationId = Array.isArray(params.registrationId)
    ? params.registrationId.join("/")
    : String(params.registrationId);
  const upstreamUrl = new URL(`/oauth2/authorization/${encodeURIComponent(registrationId)}`, env.READMATES_API_BASE_URL);
  upstreamUrl.search = sourceUrl.search;
  return fetch(upstreamUrl.toString(), {
    headers: request.headers,
    redirect: "manual",
  });
};
```

Use `/login/oauth2/code/${registrationId}` for the callback function.

- [x] **Step 4: Run tests**

```bash
cd <local-workspace>/ReadMates/front
pnpm test -- cloudflare-bff.test.ts cloudflare-oauth-proxy.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add front/functions front/tests/unit/cloudflare-bff.test.ts front/tests/unit/cloudflare-oauth-proxy.test.ts
git commit -m "feat: add cloudflare pages function bff"
```

---

### Task 10: Create Vite SPA Shell And Router

**Files:**
- Create: `front/index.html`
- Create: `front/vite.config.ts`
- Create: `front/src/main.tsx`
- Create: `front/src/app/router.tsx`
- Create: `front/src/app/auth-context.tsx`
- Modify: `front/package.json`
- Modify: `front/vitest.config.ts`
- Test: `front/tests/unit/spa-router.test.tsx`

- [x] **Step 1: Update package scripts and dependencies**

Change `front/package.json`:

```json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview --host 0.0.0.0",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest",
    "react-router-dom": "latest"
  }
}
```

Keep `@playwright/test` in `devDependencies`.

- [x] **Step 2: Add Vite config**

Create `front/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
  },
});
```

Adjustment: this repository already has `front/vitest.config.ts`, so the Vitest `test` block lives there. Keeping it out of `vite.config.ts` avoids duplicate Vite type versions between Vite 8 and the current Vitest dependency graph while preserving the same jsdom setup.

- [x] **Step 3: Add SPA entry**

`front/index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ReadMates</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Copy the current `front/app/globals.css` content into `front/src/styles/globals.css`, then create `front/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "@/src/styles/globals.css";
import { router } from "./app/router";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
```

- [x] **Step 4: Add minimal router**

Create `front/src/app/router.tsx`:

```tsx
import { createBrowserRouter } from "react-router-dom";
import LoginPage from "@/src/pages/login";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
]);
```

- [x] **Step 5: Run build and tests**

```bash
cd <local-workspace>/ReadMates/front
pnpm install
pnpm build
pnpm test spa-router.test.tsx
```

Expected: build succeeds and router test passes after adding the test.

Adjustment: Playwright E2E continues to start the legacy Next dev server in this task because only the SPA shell and `/login` route exist in Vite. Switching E2E to plain Vite before the `/api/bff`, OAuth, and app routes are migrated would serve `index.html` for API/OAuth URLs and invalidate the current E2E suite. The E2E server command is deferred until the full SPA route/function migration gate.

- [x] **Step 6: Commit**

```bash
git add front/package.json front/pnpm-lock.yaml front/index.html front/vite.config.ts front/src
git commit -m "feat: add vite spa shell"
```

---

### Task 11: Migrate Auth Client And Route Guards

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Create: `front/src/app/auth-context.tsx`
- Create: `front/src/app/route-guards.tsx`
- Test: `front/tests/unit/auth-context.test.tsx`

- [x] **Step 1: Extend frontend auth types**

Update `AuthMeResponse`:

```ts
export type MembershipStatus = "INVITED" | "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE";
export type ApprovalState = "ANONYMOUS" | "PENDING_APPROVAL" | "ACTIVE" | "INACTIVE";

export type AuthMeResponse = {
  authenticated: boolean;
  userId: string | null;
  membershipId: string | null;
  clubId: string | null;
  email: string | null;
  displayName: string | null;
  shortName: string | null;
  role: MemberRole | null;
  membershipStatus: MembershipStatus | null;
  approvalState: ApprovalState;
};
```

- [x] **Step 2: Create auth context**

`front/src/app/auth-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { AuthMeResponse } from "@/shared/api/readmates";

type AuthState = { status: "loading" } | { status: "ready"; auth: AuthMeResponse };

const AuthContext = createContext<AuthState>({ status: "loading" });

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/bff/api/auth/me", { cache: "no-store" })
      .then((response) => response.json() as Promise<AuthMeResponse>)
      .then((auth) => {
        if (!cancelled) setState({ status: "ready", auth });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            status: "ready",
            auth: {
              authenticated: false,
              userId: null,
              membershipId: null,
              clubId: null,
              email: null,
              displayName: null,
              shortName: null,
              role: null,
              membershipStatus: null,
              approvalState: "ANONYMOUS",
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => state, [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
```

- [x] **Step 3: Create route guards**

`front/src/app/route-guards.tsx`:

```tsx
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth-context";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const state = useAuth();
  if (state.status === "loading") return <main className="container">불러오는 중</main>;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function RequireActiveMember({ children }: { children: React.ReactNode }) {
  const state = useAuth();
  if (state.status === "loading") return <main className="container">불러오는 중</main>;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (state.auth.approvalState === "PENDING_APPROVAL") return <Navigate to="/app/pending" replace />;
  if (state.auth.approvalState !== "ACTIVE") {
    return <main className="container">활성 멤버만 이용할 수 있습니다.</main>;
  }
  return <>{children}</>;
}

export function RequireHost({ children }: { children: React.ReactNode }) {
  const state = useAuth();
  if (state.status === "loading") return <main className="container">불러오는 중</main>;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (state.auth.role !== "HOST" || state.auth.approvalState !== "ACTIVE") return <Navigate to="/app" replace />;
  return <>{children}</>;
}
```

- [x] **Step 4: Run tests**

```bash
cd <local-workspace>/ReadMates/front
pnpm test -- auth-context.test.tsx
```

Expected: PASS after tests assert pending redirects to `/app/pending`.

Adjustment: `RequireActiveMember` also blocks non-pending, non-active approval states with a terminal restricted view; the unit test covers inactive users so inactive memberships cannot enter active member routes or self-redirect through `/app`.

- [x] **Step 5: Commit**

```bash
git add front/shared/api/readmates.ts front/src/app/auth-context.tsx front/src/app/route-guards.tsx front/tests/unit/auth-context.test.tsx
git commit -m "feat: add spa auth guards"
```

---

### Task 12: Migrate Public And App Routes To React Router

**Files:**
- Create: `front/src/pages/public-home.tsx`
- Create: `front/src/pages/about.tsx`
- Create: `front/src/pages/public-records.tsx`
- Create: `front/src/pages/public-session.tsx`
- Create: `front/src/pages/app-home.tsx`
- Create: `front/src/pages/pending-approval.tsx`
- Create: `front/src/pages/host-members.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: route components under `front/features/**` only where Next APIs are imported.
- Test: migrated frontend tests under `front/tests/unit/*.test.tsx`

- [x] **Step 1: Replace Next imports**

Search:

```bash
cd <local-workspace>/ReadMates/front
rg -n "next/link|next/navigation|next/headers|next/server|server-only" .
```

Replace Next navigation imports with React Router imports:

```tsx
import { Link, useLocation, useNavigate } from "react-router-dom";
```

Use `const pathname = useLocation().pathname` where `usePathname()` was used. Use `const navigate = useNavigate()` where `useRouter().push()` was used.

- [x] **Step 2: Add pending page**

`front/src/pages/pending-approval.tsx`:

```tsx
import { useEffect, useState } from "react";

type PendingApprovalAppResponse = {
  approvalState: "PENDING_APPROVAL";
  clubName: string;
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    date: string;
    locationLabel: string;
  };
};

export default function PendingApprovalPage() {
  const [data, setData] = useState<PendingApprovalAppResponse | null>(null);

  useEffect(() => {
    fetch("/api/bff/api/app/pending", { cache: "no-store" })
      .then((response) => response.json())
      .then(setData);
  }, []);

  return (
    <main className="app-content">
      <section className="page-header-compact">
        <div className="container">
          <p className="eyebrow">가입 승인 대기</p>
          <h1 className="h1 editorial">호스트 승인 후 모든 기능을 사용할 수 있습니다.</h1>
          <p className="body" style={{ color: "var(--text-2)" }}>
            승인 전에는 모임 정보를 읽을 수 있고, 질문 작성과 피드백 리포트 열람은 제한됩니다.
          </p>
        </div>
      </section>
      {data?.currentSession ? (
        <section className="container" style={{ padding: "24px 0 72px" }}>
          <p className="eyebrow">현재 모임</p>
          <h2 className="h2 editorial">{data.currentSession.bookTitle}</h2>
          <p className="body">{data.currentSession.date} · {data.currentSession.locationLabel}</p>
        </section>
      ) : null}
    </main>
  );
}
```

- [x] **Step 3: Register routes**

`front/src/app/router.tsx` must include:

```tsx
{
  path: "/app/pending",
  element: (
    <RequireAuth>
      <PendingApprovalPage />
    </RequireAuth>
  ),
}
```

Active member routes use `RequireActiveMember`; host routes use `RequireHost`.

- [x] **Step 4: Run frontend tests**

```bash
cd <local-workspace>/ReadMates/front
pnpm test
```

Expected: PASS after updating tests that mocked `next/navigation` to use `MemoryRouter`.

Adjustment: Task 12 also adds Vite/Cloudflare SPA `_redirects`, direct `/invite/:token` and `/reset-password/:token` SPA routes, stale-while-revalidate route refresh, and centralized BFF 401 login recovery for migrated browser mutations.

- [x] **Step 5: Commit**

```bash
git add front/src/pages front/src/app/router.tsx front/features front/shared/ui front/tests/unit
git commit -m "feat: migrate routes to react router"
```

---

### Task 13: Convert Feedback PDF To Browser Print

**Files:**
- Delete: `front/app/(app)/app/feedback/[sessionId]/pdf/route.ts`
- Delete: `front/tests/unit/feedback-document-pdf-route.test.ts`
- Modify: `front/features/feedback/components/feedback-document-page.tsx`
- Create: `front/src/pages/feedback-print.tsx`
- Test: `front/tests/unit/feedback-document-page.test.tsx`

- [x] **Step 1: Update feedback tests**

Assert that PDF action points to print route:

```tsx
expect(screen.getByRole("link", { name: "PDF로 저장" })).toHaveAttribute(
  "href",
  "/app/feedback/session-1/print",
);
```

- [x] **Step 2: Change component link**

In `FeedbackDocumentPage`, replace:

```tsx
href={`/app/feedback/${document.sessionId}/pdf`}
```

with:

```tsx
href={`/app/feedback/${document.sessionId}/print`}
```

Adjustment: Task 12 had already updated `FeedbackDocumentPage` to link to `/print`; Task 13 verified that state and added the SPA print page/router wiring.

- [x] **Step 3: Add SPA print page**

`front/src/pages/feedback-print.tsx` loads `/api/sessions/:id/feedback-document`, renders `FeedbackDocumentPage` with `printMode`, and displays `FeedbackDocumentUnavailablePage` on 403/404.

- [x] **Step 4: Remove server PDF route and runtime dependency**

Delete:

```text
front/app/(app)/app/feedback/[sessionId]/pdf/route.ts
front/tests/unit/feedback-document-pdf-route.test.ts
```

Remove `playwright` from `dependencies` in `front/package.json`. Keep `@playwright/test`.

- [x] **Step 5: Run tests**

```bash
cd <local-workspace>/ReadMates/front
pnpm test -- feedback-document-page.test.tsx
pnpm build
```

Expected: PASS and build contains no import from `playwright`.

- [x] **Step 6: Commit**

```bash
git add front/features/feedback/components/feedback-document-page.tsx front/src/pages/feedback-print.tsx front/package.json front/pnpm-lock.yaml
git rm 'front/app/(app)/app/feedback/[sessionId]/pdf/route.ts' front/tests/unit/feedback-document-pdf-route.test.ts
git commit -m "feat: use browser print for feedback pdf"
```

---

### Task 14: Remove Next.js Runtime

**Files:**
- Delete: `front/app/**`
- Delete: `front/next.config.ts`
- Delete: `front/next-env.d.ts`
- Modify: `front/package.json`
- Modify: `front/vitest.config.ts`
- Test: full frontend test suite

- [x] **Step 1: Verify no Next imports remain**

```bash
cd <local-workspace>/ReadMates/front
rg -n "next/|NextRequest|NextResponse|server-only" .
```

Expected: no matches outside deleted files and lockfile before removal.

Result: initial search found expected `front/app/**` Next route/runtime references, plus stale Next/server-only references in Vite/Vitest/ESLint/TS config, `front/AGENTS.md`, `front/shared/api/readmates-server.ts`, `front/src/app/next-link-shim.tsx`, and unit tests that still imported Next route modules. Adapted Step 4 to remove or convert those stale references. Final `rg -n "next/|NextRequest|NextResponse|server-only" front` returned no matches.

- [x] **Step 2: Remove Next files**

```bash
git rm -r front/app
git rm front/next.config.ts front/next-env.d.ts
```

Result: deleted `front/app/**`, `front/next.config.ts`, and `front/next-env.d.ts` from the worktree.

- [x] **Step 3: Remove packages**

```bash
cd <local-workspace>/ReadMates/front
pnpm remove next server-only playwright
pnpm install
```

Result: ran `pnpm remove next server-only eslint-config-next` because runtime `playwright` was not a direct package dependency. Added direct `typescript-eslint` dev dependency for the non-Next ESLint config. Kept `@playwright/test`.

- [x] **Step 4: Run frontend verification**

```bash
cd <local-workspace>/ReadMates/front
pnpm lint
pnpm test
pnpm build
```

Expected: all PASS.

Result:
- `pnpm lint` PASS
- `pnpm test` PASS: 33 test files, 201 tests
- `pnpm build` PASS: Vite build completed, with the existing chunk-size warning for a 514.16 kB JS asset
- `rg -n "next/|NextRequest|NextResponse|server-only" front` PASS: no matches
- Removed generated `front/dist` after build

- [x] **Step 5: Commit**

```bash
git add front/package.json front/pnpm-lock.yaml front/vitest.config.ts
git add -u front
git commit -m "chore: remove next runtime"
```

---

### Task 15: Cloudflare Pages Deployment Documentation

**Files:**
- Create: `docs/deploy/cloudflare-pages-spa.md`
- Modify: `docs/deploy/oci-mysql-heatwave.md`
- Modify: `README.md`
- Delete: `front/vercel.json`
- Modify: `.vercelignore` only if it is intentionally retained as historical cleanup in this branch
- Test: docs review command not required

- [x] **Step 1: Create deployment doc**

Adjustment: Task 15 also updates README and OCI deployment guidance, removes stale `front/vercel.json`, and documents that production BFF secrets must not be reused in Cloudflare Preview deployments.

Create:

```markdown
# Cloudflare Pages SPA Deployment

## Build

- Root directory: `front`
- Build command: `pnpm install --frozen-lockfile && pnpm build`
- Build output directory: `dist` when the Cloudflare Pages root directory is `front`; use `front/dist` only in UIs that ask for a path relative to the repository root.

## Environment

Cloudflare Pages environment variables:

- `READMATES_API_BASE_URL`: OCI Spring Boot origin URL
- `READMATES_BFF_SECRET`: same value as `readmates.bff-secret` on Spring Boot

Spring Boot environment:

- `readmates.app-base-url=https://readmates.pages.dev`
- `readmates.allowed-origins=https://readmates.pages.dev`
- `readmates.bff-secret=<same secret>`
- `spring.security.oauth2.client.registration.google.client-id=<Google OAuth client id>`
- `spring.security.oauth2.client.registration.google.client-secret=<Google OAuth client secret>`
- `spring.security.oauth2.client.registration.google.scope=openid,email,profile`

Google OAuth redirect URI:

- `https://readmates.pages.dev/login/oauth2/code/google`

## Verification

1. Open `https://readmates.pages.dev`.
2. Click Google login.
3. Existing Gmail members land on `/app`.
4. New Google users land on `/app/pending`.
5. Host can approve pending users in `/app/host/members`.
6. Pending users cannot open feedback documents.
7. Feedback `PDF로 저장` opens browser print.
```

- [x] **Step 2: Commit**

```bash
git add docs/deploy/cloudflare-pages-spa.md docs/deploy/oci-mysql-heatwave.md README.md docs/superpowers/plans/2026-04-21-readmates-cloudflare-spa-google-auth-migration-plan.md
git rm front/vercel.json
git commit -m "docs: add cloudflare pages deployment guide"
```

---

### Task 16: End-To-End Verification And Release Gate

**Files:**
- Modify: `front/tests/e2e/readmates-e2e-db.ts`
- Modify: `front/tests/e2e/*.spec.ts`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Test: frontend and backend full suites

- [x] **Step 1: Replace password E2E helper**

Change `loginWithPassword` to a test-only session helper that creates a valid `readmates_session` through backend test fixture or a dev-only endpoint. Name it:

```ts
export async function loginWithGoogleFixture(page: Page, email: string) {
  const response = await page.request.post("/api/bff/api/dev/google-login", {
    data: { email },
  });
  expect(response.status()).toBe(200);
}
```

Create `/api/dev/google-login` only under dev profile if no existing dev login path can issue Google-like sessions.

Adjustment: Task 8 had already replaced password-based E2E helpers with `loginWithGoogleFixture`, implemented as a test fixture that writes Google-backed `auth_sessions` directly against the E2E MySQL database. `rg -n "loginWithPassword" front/tests/e2e front/src front/tests` returned no matches, so no duplicate dev login endpoint was added.

- [x] **Step 2: Update E2E specs**

Replace calls:

```ts
await loginWithPassword(page, "host@example.com");
```

with:

```ts
await loginWithGoogleFixture(page, "host@example.com");
```

Add one pending flow:

```ts
test("new google user waits for host approval", async ({ page }) => {
  await loginWithGoogleFixture(page, "pending.e2e@example.com");
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /가입 승인 대기/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /PDF로 저장/ })).toHaveCount(0);
});
```

Adjustment: Added the missing pending approval UI E2E flow to `google-auth-pending-approval.spec.ts`. Expanded the existing public/host E2E smoke to cover Google-only login and approved print mode, and covered pending route/API restrictions by asserting `/app`, `/app/host`, `/app/host/sessions/new`, and the pending print route redirect to `/app/pending`, direct host dashboard, feedback document, and RSVP mutation API requests return 403, and `window.print` is not called for pending users. Because the suite mutates shared seeded MySQL users and sessions, Playwright E2E now runs with one worker to avoid fixture cleanup races.

Adjustment: Permitted Spring Boot's `/error` dispatch in `SecurityConfig` so authenticated pending-user access denials preserve their original 403 response instead of being overwritten by a protected error dispatch.

- [x] **Step 3: Run full verification**

```bash
cd <local-workspace>/ReadMates/server
./gradlew test

cd <local-workspace>/ReadMates/front
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Expected: all PASS.

Result: PASS on 2026-04-21. `./gradlew test` passed; `pnpm lint` passed with 6 existing Fast Refresh warnings; `pnpm test` passed 33 files / 201 tests; `pnpm build` passed with Vite's existing large chunk warning; `pnpm test:e2e` passed 8 tests using 1 worker.

- [x] **Step 4: Automated local smoke substitute**

Run:

```bash
cd <local-workspace>/ReadMates/front
pnpm dev
```

Open the printed local URL and verify:

- `/login` shows only Google login.
- `/app/pending` renders when the auth fixture is pending.
- `/app/feedback/<sessionId>/print` opens a print dialog for approved users.
- `/app/feedback/<sessionId>/print` shows restricted copy for pending users.

Adjustment: Replaced fully manual browser interaction with automated Playwright smoke checks in the E2E suite. `public-auth-member-host.spec.ts` verifies the login page has only Google login controls, host login reaches `/app/host`, and approved feedback print mode invokes `window.print`. `google-auth-pending-approval.spec.ts` verifies a pending fixture is redirected from active member, host, host session creation, and feedback print routes to `/app/pending`; it also checks the session is still `PENDING_APPROVAL`, direct host dashboard, feedback document, and RSVP mutation API requests return 403, and print is not invoked for pending users.

- [x] **Step 5: Commit final E2E changes**

```bash
git add front/tests/e2e server/src/main/kotlin/com/readmates/auth/api
git commit -m "test: update e2e for google auth migration"
```

---

## Self-Review

Spec coverage:

- Cloudflare Pages SPA hosting: Tasks 9, 10, 14, 15.
- Pages Function BFF and OAuth proxy: Task 9.
- Google-only login: Tasks 3, 4, 8.
- Existing Gmail member auto-link: Task 3.
- New pending approval users: Tasks 1, 2, 3, 5, 7.
- Pending read-only and feedback restriction: Tasks 6, 7, 12, 13.
- Browser PDF: Task 13.
- Next/Vercel removal: Tasks 10, 12, 14, 15.
- Verification: Task 16.

Placeholder scan:

- This plan contains concrete file paths, command lines, response shapes, and code snippets for every task.
- No placeholder markers or open-ended implementation slots are used.

Type consistency:

- Backend status values use `PENDING_APPROVAL`, `ACTIVE`, `INACTIVE`, and `INVITED`.
- Frontend `ApprovalState` mirrors backend values plus `ANONYMOUS`.
- Route paths use `/app/feedback/:sessionId/print`, `/api/app/pending`, and `/api/host/members/pending-approvals` consistently.
