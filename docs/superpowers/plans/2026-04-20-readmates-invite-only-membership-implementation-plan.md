# ReadMates Invite-Only Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ReadMates membership truly invite-only by letting hosts create copyable one-time invitation links that activate a member only when the invite email matches the verified Google/dev-auth email.

**Architecture:** Use `invitations` as the permission ledger, store only token hashes, and activate `users`/`memberships` inside a single invitation-acceptance transaction. Keep OAuth success handling separate from acceptance: OAuth preserves the invite token and redirects back to `/invite/{token}`, where the frontend calls the accept endpoint and renders success/failure states.

**Tech Stack:** Kotlin/Spring Boot 4, Spring Security OAuth2 Client, PostgreSQL/Flyway, JdbcTemplate, Next.js App Router, React client components, Vitest/Testing Library, Playwright, Gradle, pnpm.

---

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-20-readmates-invite-only-membership-design.md`
- Existing product baseline: `README.md`
- Existing auth foundation: `server/src/main/resources/db/migration/V1__auth_core.sql`
- Existing invite stub: `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt`
- Existing auth resolver: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Existing invite page: `front/app/(public)/invite/[token]/page.tsx`
- Existing login card: `front/features/auth/components/login-card.tsx`

## File Structure

- Create `server/src/main/resources/db/migration/V8__invite_only_membership_constraints.sql`
  - Adds invitation/membership check constraints and invitation lookup/list indexes.
- Create `server/src/main/kotlin/com/readmates/auth/application/InvitationTokenService.kt`
  - Generates URL-safe random invitation tokens and hashes raw tokens with SHA-256.
- Create `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
  - Owns create/list/revoke/preview/accept/dev-accept invitation use cases.
- Modify `server/src/main/kotlin/com/readmates/auth/application/MemberAccountRepository.kt`
  - Adds small helpers needed by invitation acceptance and stops relying on dev auto-member creation for unknown Google accounts.
- Replace `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt`
  - Replaces fixed sample preview with real preview and authenticated accept endpoints.
- Create `server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt`
  - Host-only create/list/revoke invitation API.
- Create `server/src/main/kotlin/com/readmates/auth/api/DevInvitationController.kt`
  - Dev-only invitation accept shortcut gated by profile/property.
- Create `server/src/main/kotlin/com/readmates/auth/api/InvitationErrorHandler.kt`
  - Maps invitation domain failures to stable HTTP status and JSON error codes.
- Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt`
  - Captures `inviteToken` on `/oauth2/authorization/**` before redirecting to Google.
- Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/InviteAwareAuthenticationSuccessHandler.kt`
  - Redirects OAuth users back to `/invite/{token}` when an invite token was captured.
- Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
  - Wires OAuth invite token capture, invite-aware success redirect, invite CSRF exemptions, and endpoint authorization.
- Modify `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
  - Removes the unknown Google auto-provision path from regular auth resolution.
- Modify `server/src/main/resources/application-dev.yml`
  - Sets `readmates.dev.google-oauth-auto-member-enabled` to false.
- Create backend tests:
  - `server/src/test/kotlin/com/readmates/auth/application/InvitationTokenServiceTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt`
- Modify backend tests:
  - `server/src/test/kotlin/com/readmates/auth/api/DevGoogleOAuthAutoMemberTest.kt`
  - `server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt`
- Modify `front/shared/api/readmates.ts`
  - Adds invitation DTO types.
- Create `front/features/host/actions/invitations.ts`
  - Client-side fetch helpers for host invitation create/revoke/reissue.
- Create `front/features/host/components/host-invitations.tsx`
  - Host invitation form/list/link-copy UI.
- Create `front/app/(app)/app/host/invitations/page.tsx`
  - Server route that fetches host invitations and renders the client component.
- Modify `front/features/host/components/host-dashboard.tsx`
  - Adds `멤버 초대` CTA to host dashboard.
- Create `front/features/auth/google-oauth.ts`
  - Shares Google OAuth URL building between login and invite acceptance UI.
- Modify `front/features/auth/components/login-card.tsx`
  - Uses shared Google OAuth helper.
- Create `front/features/auth/actions/invitations.ts`
  - Client-side fetch helpers for preview/auth/accept/dev accept.
- Create `front/features/auth/components/invite-acceptance-card.tsx`
  - Real invite preview and accept UI.
- Modify `front/app/(public)/invite/[token]/page.tsx`
  - Renders `InviteAcceptanceCard` instead of the static `LoginCard` invite mode.
- Create frontend tests:
  - `front/tests/unit/host-invitations.test.tsx`
  - `front/tests/unit/invite-acceptance-card.test.tsx`
- Modify frontend tests:
  - `front/tests/unit/login-card.test.tsx`
  - `front/tests/unit/host-dashboard.test.tsx`
  - `front/tests/e2e/dev-login-session-flow.spec.ts`
- Modify `README.md`
  - Updates invitation status and dev Google policy.

## Implementation Notes

- The app currently has user changes in unrelated files. Do not revert them.
- Use `V8__invite_only_membership_constraints.sql`; migrations `V1` through `V7` already exist.
- Keep the first implementation single-club-compatible but always scope invitation queries by `club_id`.
- First-party frontend fetches should continue to go through `/api/bff/**`.
- Raw invitation tokens are returned only by create/reissue responses. They are never stored in the database.
- `AuthMeResponse.authenticated` means "has active membership", not merely "has an OAuth session". Invite acceptance must treat `auth.email` as the signal that a Google/dev session exists even when `authenticated` is false.

---

### Task 1: Database And Token Foundation

**Files:**
- Create: `server/src/main/resources/db/migration/V8__invite_only_membership_constraints.sql`
- Create: `server/src/main/kotlin/com/readmates/auth/application/InvitationTokenService.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/application/InvitationTokenServiceTest.kt`

- [x] **Step 1: Write failing token service tests**

Create `server/src/test/kotlin/com/readmates/auth/application/InvitationTokenServiceTest.kt`:

```kotlin
package com.readmates.auth.application

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InvitationTokenServiceTest {
    private val service = InvitationTokenService()

    @Test
    fun `generates url safe one time tokens`() {
        val token = service.generateToken()

        assertTrue(token.length >= 43)
        assertFalse(token.contains("="))
        assertTrue(token.matches(Regex("^[A-Za-z0-9_-]+$")))
    }

    @Test
    fun `hashes tokens deterministically without returning the raw token`() {
        val first = service.hashToken("raw-token")
        val second = service.hashToken("raw-token")
        val third = service.hashToken("other-token")

        assertEquals(first, second)
        assertNotEquals(first, third)
        assertNotEquals("raw-token", first)
        assertTrue(first.matches(Regex("^[0-9a-f]{64}$")))
    }
}
```

- [x] **Step 2: Run the token tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.application.InvitationTokenServiceTest
```

Expected: compilation fails because `InvitationTokenService` does not exist.

- [x] **Step 3: Add the Flyway migration**

Create `server/src/main/resources/db/migration/V8__invite_only_membership_constraints.sql`:

```sql
alter table invitations
  add constraint invitations_status_check check (status in ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  add constraint invitations_role_check check (role in ('MEMBER', 'HOST'));

alter table memberships
  add constraint memberships_status_check check (status in ('INVITED', 'ACTIVE', 'INACTIVE')),
  add constraint memberships_role_check check (role in ('MEMBER', 'HOST'));

create index invitations_club_email_idx
  on invitations (club_id, lower(invited_email));

create index invitations_club_created_idx
  on invitations (club_id, created_at desc);
```

- [x] **Step 4: Implement the token service**

Create `server/src/main/kotlin/com/readmates/auth/application/InvitationTokenService.kt`:

```kotlin
package com.readmates.auth.application

import org.springframework.stereotype.Component
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.HexFormat

@Component
class InvitationTokenService {
    private val secureRandom = SecureRandom()

    fun generateToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun hashToken(rawToken: String): String {
        val normalized = rawToken.trim()
        require(normalized.isNotEmpty()) { "Invitation token must not be blank" }
        val digest = MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest)
    }
}
```

- [x] **Step 5: Run token tests and migration-backed backend smoke tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.application.InvitationTokenServiceTest --tests com.readmates.archive.api.ReadmatesSeedDataTest
```

Expected: PASS. `ReadmatesSeedDataTest` verifies Flyway can migrate and seed the existing dev database.

- [x] **Step 6: Commit**

```bash
git add server/src/main/resources/db/migration/V8__invite_only_membership_constraints.sql \
  server/src/main/kotlin/com/readmates/auth/application/InvitationTokenService.kt \
  server/src/test/kotlin/com/readmates/auth/application/InvitationTokenServiceTest.kt
git commit -m "feat: add invitation token foundation"
```

---

### Task 2: Host Invitation Management API

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/InvitationErrorHandler.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`

- [x] **Step 1: Write failing host API tests**

Create `server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.support.PostgreSqlTestContainer
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [HostInvitationControllerTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class HostInvitationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `host creates a pending member invitation with a one time accept url`() {
        mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":" New.Member@Example.com "}"""
        }
            .andExpect {
                status { isCreated() }
                jsonPath("$.email") { value("new.member@example.com") }
                jsonPath("$.role") { value("MEMBER") }
                jsonPath("$.status") { value("PENDING") }
                jsonPath("$.effectiveStatus") { value("PENDING") }
                jsonPath("$.acceptUrl", startsWith("http://localhost:3000/invite/"))
                jsonPath("$.canRevoke") { value(true) }
                jsonPath("$.canReissue") { value(true) }
            }

        val row = jdbcTemplate.queryForMap(
            """
            select invited_email, role, status, length(token_hash) as token_hash_length
            from invitations
            where invited_email = 'new.member@example.com'
            """.trimIndent(),
        )
        assertEquals("new.member@example.com", row["invited_email"])
        assertEquals("MEMBER", row["role"])
        assertEquals("PENDING", row["status"])
        assertEquals(64, row["token_hash_length"])
    }

    @Test
    fun `member cannot create invitations`() {
        mockMvc.post("/api/host/invitations") {
            with(user("member5@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"blocked@example.com"}"""
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `creating another live pending invitation revokes the previous one and returns a new token`() {
        val firstUrl = createInvitation("repeat@example.com")
        val secondUrl = createInvitation("repeat@example.com")

        assertNotEquals(firstUrl, secondUrl)

        val statuses = jdbcTemplate.queryForList(
            """
            select status
            from invitations
            where invited_email = 'repeat@example.com'
            order by created_at
            """.trimIndent(),
            String::class.java,
        )
        assertEquals(listOf("REVOKED", "PENDING"), statuses)
    }

    @Test
    fun `host lists and revokes invitations`() {
        createInvitation("list.member@example.com")

        val invitationId = mockMvc.get("/api/host/invitations") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].email") { value("list.member@example.com") }
                jsonPath("$[0].effectiveStatus") { value("PENDING") }
                jsonPath("$[0].canRevoke") { value(true) }
            }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"invitationId\":\"")
            .substringBefore("\"")

        mockMvc.post("/api/host/invitations/$invitationId/revoke") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.effectiveStatus") { value("REVOKED") }
                jsonPath("$.canRevoke") { value(false) }
            }
    }

    @Test
    fun `host cannot invite an already active member`() {
        mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"member5@example.com"}"""
        }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("MEMBER_ALREADY_ACTIVE") }
            }
    }

    private fun createInvitation(email: String): String {
        return mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email"}"""
        }
            .andExpect { status { isCreated() } }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"acceptUrl\":\"")
            .substringBefore("\"")
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from invitations
            where invited_email in (
              'new.member@example.com',
              'blocked@example.com',
              'repeat@example.com',
              'list.member@example.com'
            );
        """

        @JvmStatic
        @DynamicPropertySource
        fun postgresProperties(registry: DynamicPropertyRegistry) {
            PostgreSqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Run host API tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.HostInvitationControllerTest
```

Expected: FAIL because `/api/host/invitations` does not exist.

- [x] **Step 3: Create invitation service DTOs, errors, and host use cases**

Create `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt` with these public DTOs and methods:

```kotlin
package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ResponseStatus
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

data class HostInvitationResponse(
    val invitationId: String,
    val email: String,
    val role: MembershipRole,
    val status: InvitationStatus,
    val effectiveStatus: InvitationStatus,
    val expiresAt: String,
    val acceptedAt: String?,
    val createdAt: String,
    val canRevoke: Boolean,
    val canReissue: Boolean,
    val acceptUrl: String? = null,
)

data class InvitationPreviewResponse(
    val clubName: String,
    val emailHint: String,
    val status: InvitationStatus,
    val expiresAt: String,
    val canAccept: Boolean,
)

data class InvitationAcceptanceIdentity(
    val email: String,
    val googleSubjectId: String,
    val displayName: String?,
    val profileImageUrl: String?,
)

@ResponseStatus(HttpStatus.CONFLICT)
class InvitationDomainException(
    val code: String,
    val status: HttpStatus,
    message: String,
) : RuntimeException(message)

@Service
class InvitationService(
    private val jdbcTemplate: JdbcTemplate,
    private val tokenService: InvitationTokenService,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) {
    @Transactional
    fun createInvitation(host: CurrentMember, email: String): HostInvitationResponse {
        requireHost(host)
        val normalizedEmail = normalizeEmail(email)
        rejectActiveMember(host.clubId, normalizedEmail)
        revokeLivePendingInvitation(host.clubId, normalizedEmail)

        val token = tokenService.generateToken()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plusDays(30)
        val invitationId = UUID.randomUUID()

        jdbcTemplate.update(
            """
            insert into invitations (
              id,
              club_id,
              invited_by_membership_id,
              invited_email,
              role,
              token_hash,
              status,
              expires_at
            )
            values (?, ?, ?, ?, 'MEMBER', ?, 'PENDING', ?)
            """.trimIndent(),
            invitationId,
            host.clubId,
            host.membershipId,
            normalizedEmail,
            tokenService.hashToken(token),
            expiresAt,
        )

        return findHostInvitation(host.clubId, invitationId).copy(acceptUrl = acceptUrl(token))
    }

    fun listHostInvitations(host: CurrentMember): List<HostInvitationResponse> {
        requireHost(host)
        return jdbcTemplate.query(
            """
            select id, invited_email, role, status, expires_at, accepted_at, created_at
            from invitations
            where club_id = ?
            order by created_at desc
            """.trimIndent(),
            { resultSet, _ ->
                HostInvitationResponse(
                    invitationId = resultSet.getObject("id", UUID::class.java).toString(),
                    email = resultSet.getString("invited_email"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = InvitationStatus.valueOf(resultSet.getString("status")),
                    effectiveStatus = effectiveStatus(
                        InvitationStatus.valueOf(resultSet.getString("status")),
                        resultSet.getObject("expires_at", OffsetDateTime::class.java),
                    ),
                    expiresAt = resultSet.getObject("expires_at", OffsetDateTime::class.java).toString(),
                    acceptedAt = resultSet.getObject("accepted_at", OffsetDateTime::class.java)?.toString(),
                    createdAt = resultSet.getObject("created_at", OffsetDateTime::class.java).toString(),
                    canRevoke = canRevoke(
                        InvitationStatus.valueOf(resultSet.getString("status")),
                        resultSet.getObject("expires_at", OffsetDateTime::class.java),
                    ),
                    canReissue = true,
                )
            },
            host.clubId,
        )
    }

    @Transactional
    fun revokeInvitation(host: CurrentMember, invitationId: UUID): HostInvitationResponse {
        requireHost(host)
        jdbcTemplate.update(
            """
            update invitations
            set status = 'REVOKED',
                updated_at = now()
            where id = ?
              and club_id = ?
              and status = 'PENDING'
              and expires_at >= now()
            """.trimIndent(),
            invitationId,
            host.clubId,
        )
        return findHostInvitation(host.clubId, invitationId)
    }

    private fun findHostInvitation(clubId: UUID, invitationId: UUID): HostInvitationResponse =
        listHostInvitationsForId(clubId, invitationId).firstOrNull()
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found")

    private fun listHostInvitationsForId(clubId: UUID, invitationId: UUID): List<HostInvitationResponse> =
        jdbcTemplate.query(
            """
            select id, invited_email, role, status, expires_at, accepted_at, created_at
            from invitations
            where club_id = ?
              and id = ?
            """.trimIndent(),
            { resultSet, _ ->
                val status = InvitationStatus.valueOf(resultSet.getString("status"))
                val expiresAt = resultSet.getObject("expires_at", OffsetDateTime::class.java)
                HostInvitationResponse(
                    invitationId = resultSet.getObject("id", UUID::class.java).toString(),
                    email = resultSet.getString("invited_email"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = status,
                    effectiveStatus = effectiveStatus(status, expiresAt),
                    expiresAt = expiresAt.toString(),
                    acceptedAt = resultSet.getObject("accepted_at", OffsetDateTime::class.java)?.toString(),
                    createdAt = resultSet.getObject("created_at", OffsetDateTime::class.java).toString(),
                    canRevoke = canRevoke(status, expiresAt),
                    canReissue = true,
                )
            },
            clubId,
            invitationId,
        )

    private fun rejectActiveMember(clubId: UUID, email: String) {
        val count = jdbcTemplate.queryForObject(
            """
            select count(*)
            from users
            join memberships on memberships.user_id = users.id
            where memberships.club_id = ?
              and lower(users.email) = ?
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
            clubId,
            email,
        ) ?: 0
        if (count > 0) {
            throw InvitationDomainException("MEMBER_ALREADY_ACTIVE", HttpStatus.CONFLICT, "Member is already active")
        }
    }

    private fun revokeLivePendingInvitation(clubId: UUID, email: String) {
        jdbcTemplate.update(
            """
            update invitations
            set status = 'REVOKED',
                updated_at = now()
            where club_id = ?
              and lower(invited_email) = ?
              and status = 'PENDING'
              and expires_at >= now()
            """.trimIndent(),
            clubId,
            email,
        )
    }

    private fun normalizeEmail(email: String): String =
        email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
            ?: throw InvitationDomainException("INVALID_INVITATION_EMAIL", HttpStatus.BAD_REQUEST, "Email is required")

    private fun effectiveStatus(status: InvitationStatus, expiresAt: OffsetDateTime): InvitationStatus =
        if (status == InvitationStatus.PENDING && expiresAt.isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            InvitationStatus.EXPIRED
        } else {
            status
        }

    private fun canRevoke(status: InvitationStatus, expiresAt: OffsetDateTime): Boolean =
        status == InvitationStatus.PENDING && !expiresAt.isBefore(OffsetDateTime.now(ZoneOffset.UTC))

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw InvitationDomainException("HOST_REQUIRED", HttpStatus.FORBIDDEN, "Host role required")
        }
    }

    private fun acceptUrl(token: String): String {
        return "${appBaseUrl.trimEnd('/')}/invite/$token"
    }
}
```

Task 3 will extend this same service with `previewInvitation` and `acceptInvitation`; do not create a second service.

- [x] **Step 4: Add the invitation error handler**

Create `server/src/main/kotlin/com/readmates/auth/api/InvitationErrorHandler.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.InvitationDomainException
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

data class InvitationErrorResponse(
    val code: String,
    val message: String,
)

@RestControllerAdvice
class InvitationErrorHandler {
    @ExceptionHandler(InvitationDomainException::class)
    fun handleInvitationDomainException(error: InvitationDomainException): ResponseEntity<InvitationErrorResponse> {
        return ResponseEntity
            .status(error.status)
            .body(InvitationErrorResponse(code = error.code, message = error.message ?: error.code))
    }
}
```

- [x] **Step 5: Add the host controller**

Create `server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.InvitationService
import com.readmates.auth.application.MemberAccountRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

data class CreateInvitationRequest(
    @field:NotBlank
    @field:Email
    val email: String,
)

@RestController
@RequestMapping("/api/host/invitations")
class HostInvitationController(
    private val memberAccountRepository: MemberAccountRepository,
    private val invitationService: InvitationService,
) {
    @GetMapping
    fun list(authentication: Authentication?) =
        invitationService.listHostInvitations(currentMember(authentication))

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        authentication: Authentication?,
        @Valid @RequestBody request: CreateInvitationRequest,
    ) = invitationService.createInvitation(currentMember(authentication), request.email)

    @PostMapping("/{invitationId}/revoke")
    fun revoke(
        authentication: Authentication?,
        @PathVariable invitationId: String,
    ) = invitationService.revokeInvitation(currentMember(authentication), parseInvitationId(invitationId))

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}

internal fun parseInvitationId(invitationId: String): UUID =
    runCatching { UUID.fromString(invitationId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invitation id") }
```

- [x] **Step 6: Add CSRF exemptions for host invitation writes**

Modify `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`.

Add `"/api/host/invitations"` to the first `csrf.ignoringRequestMatchers(...)` list:

```kotlin
"/api/host/invitations",
```

Add this matcher to the second `csrf.ignoringRequestMatchers(...)` call:

```kotlin
methodAndPath("POST", Regex("^/api/host/invitations/[^/]+/revoke$")),
```

The existing `.requestMatchers("/api/host/**").hasRole("HOST")` authorization rule already protects the route.

- [x] **Step 7: Run host API tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.HostInvitationControllerTest
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt \
  server/src/main/kotlin/com/readmates/auth/api/HostInvitationController.kt \
  server/src/main/kotlin/com/readmates/auth/api/InvitationErrorHandler.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/test/kotlin/com/readmates/auth/api/HostInvitationControllerTest.kt
git commit -m "feat: add host invitation management api"
```

---

### Task 3: Invitation Preview And Acceptance

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`

- [x] **Step 1: Write failing preview and accept tests**

Create `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.support.PostgreSqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.oidcLogin
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [InvitationControllerDbTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class InvitationControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `preview returns masked pending invitation`() {
        val token = createInvitation("preview.member@example.com")

        mockMvc.get("/api/invitations/$token")
            .andExpect {
                status { isOk() }
                jsonPath("$.clubName") { value("읽는사이") }
                jsonPath("$.emailHint") { value("pr****@example.com") }
                jsonPath("$.status") { value("PENDING") }
                jsonPath("$.canAccept") { value(true) }
            }
    }

    @Test
    fun `accept activates matching Google account and adds participant to current open session`() {
        val token = createInvitation("accepted.member@example.com")
        createOpenSession()

        mockMvc.post("/api/invitations/$token/accept") {
            with(localGoogleLogin("accepted.member@example.com", "google-accepted-member", "초대 멤버"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("accepted.member@example.com") }
                jsonPath("$.role") { value("MEMBER") }
                jsonPath("$.displayName") { value("초대 멤버") }
            }

        val memberRow = jdbcTemplate.queryForMap(
            """
            select memberships.status, memberships.role
            from users
            join memberships on memberships.user_id = users.id
            where users.email = 'accepted.member@example.com'
            """.trimIndent(),
        )
        assertEquals("ACTIVE", memberRow["status"])
        assertEquals("MEMBER", memberRow["role"])

        val participantCount = jdbcTemplate.queryForObject(
            """
            select count(*)
            from session_participants
            join memberships on memberships.id = session_participants.membership_id
            join users on users.id = memberships.user_id
            where users.email = 'accepted.member@example.com'
              and session_participants.session_id = '00000000-0000-0000-0000-000000009777'::uuid
              and session_participants.rsvp_status = 'NO_RESPONSE'
              and session_participants.attendance_status = 'UNKNOWN'
            """.trimIndent(),
            Int::class.java,
        )
        assertEquals(1, participantCount)
    }

    @Test
    fun `accept rejects mismatched Google email without creating a membership`() {
        val token = createInvitation("right.member@example.com")

        mockMvc.post("/api/invitations/$token/accept") {
            with(localGoogleLogin("wrong.member@example.com", "google-wrong-member", "Wrong Member"))
        }
            .andExpect {
                status { isForbidden() }
                jsonPath("$.code") { value("INVITATION_EMAIL_MISMATCH") }
            }

        val count = jdbcTemplate.queryForObject(
            """
            select count(*)
            from users
            where email in ('right.member@example.com', 'wrong.member@example.com')
            """.trimIndent(),
            Int::class.java,
        )
        assertEquals(0, count)
    }

    @Test
    fun `invalid token returns not found`() {
        mockMvc.get("/api/invitations/not-a-real-token")
            .andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("INVITATION_NOT_FOUND") }
            }
    }

    @Test
    fun `accept requires authentication`() {
        val token = createInvitation("needs.auth@example.com")

        mockMvc.post("/api/invitations/$token/accept")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    private fun createInvitation(email: String): String {
        val acceptUrl = mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email"}"""
        }
            .andExpect { status { isCreated() } }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"acceptUrl\":\"")
            .substringBefore("\"")

        return acceptUrl.substringAfterLast("/")
    }

    private fun createOpenSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              book_translator,
              book_link,
              book_image_url,
              session_date,
              start_time,
              end_time,
              location_label,
              meeting_url,
              meeting_passcode,
              question_deadline_at,
              state
            )
            values (
              '00000000-0000-0000-0000-000000009777'::uuid,
              '00000000-0000-0000-0000-000000000001'::uuid,
              77,
              '초대 테스트 세션',
              '초대 테스트 책',
              '테스트 저자',
              null,
              null,
              null,
              '2026-05-20'::date,
              '20:00'::time,
              '22:00'::time,
              '온라인',
              null,
              null,
              '2026-05-19 23:59:00+09'::timestamptz,
              'OPEN'
            )
            on conflict (club_id, number) do update set state = excluded.state
            """.trimIndent(),
        )
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from session_participants
            where session_id = '00000000-0000-0000-0000-000000009777'::uuid;
            delete from sessions
            where id = '00000000-0000-0000-0000-000000009777'::uuid;
            delete from invitations
            where invited_email in (
              'preview.member@example.com',
              'accepted.member@example.com',
              'right.member@example.com',
              'needs.auth@example.com'
            );
            delete from memberships
            where user_id in (
              select id
              from users
              where email in (
                'accepted.member@example.com',
                'right.member@example.com',
                'wrong.member@example.com',
                'needs.auth@example.com'
              )
            );
            delete from users
            where email in (
              'accepted.member@example.com',
              'right.member@example.com',
              'wrong.member@example.com',
              'needs.auth@example.com'
            );
        """

        @JvmStatic
        @DynamicPropertySource
        fun postgresProperties(registry: DynamicPropertyRegistry) {
            PostgreSqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

private fun localGoogleLogin(email: String, subject: String, name: String) =
    oidcLogin().idToken { token ->
        token.subject(subject)
        token.claim("email", email)
        token.claim("email_verified", true)
        token.claim("name", name)
        token.claim("picture", "https://example.com/avatar.png")
}
```

- [x] **Step 2: Run preview/accept tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.InvitationControllerDbTest
```

Expected: FAIL because preview is still fixed and accept is missing.

- [x] **Step 3: Extend the invitation service with preview and accept**

Append these methods to `InvitationService` and keep helper methods private in the same class:

```kotlin
fun previewInvitation(rawToken: String): InvitationPreviewResponse {
    val invitation = findInvitationByToken(rawToken)
    val effectiveStatus = effectiveStatus(invitation.status, invitation.expiresAt)
    return InvitationPreviewResponse(
        clubName = invitation.clubName,
        emailHint = maskEmail(invitation.email),
        status = effectiveStatus,
        expiresAt = invitation.expiresAt.toString(),
        canAccept = effectiveStatus == InvitationStatus.PENDING,
    )
}

@Transactional
fun acceptInvitation(rawToken: String, identity: InvitationAcceptanceIdentity): com.readmates.auth.api.AuthMemberResponse {
    val invitation = findInvitationByTokenForUpdate(rawToken)
    val effectiveStatus = effectiveStatus(invitation.status, invitation.expiresAt)
    if (effectiveStatus != InvitationStatus.PENDING) {
        throw InvitationDomainException("INVITATION_${effectiveStatus.name}", HttpStatus.CONFLICT, "Invitation is not pending")
    }

    val normalizedEmail = identity.email.trim().lowercase(Locale.ROOT)
    if (!invitation.email.equals(normalizedEmail, ignoreCase = true)) {
        throw InvitationDomainException(
            "INVITATION_EMAIL_MISMATCH",
            HttpStatus.FORBIDDEN,
            "Invitation email does not match authenticated email",
        )
    }

    val userId = upsertInvitedUser(identity)
    val membershipId = upsertActiveMembership(invitation.clubId, userId, MembershipRole.MEMBER)

    jdbcTemplate.update(
        """
        update invitations
        set status = 'ACCEPTED',
            accepted_at = now(),
            updated_at = now()
        where id = ?
        """.trimIndent(),
        invitation.id,
    )

    addToCurrentOpenSession(invitation.clubId, membershipId)

    val member = findCurrentMember(membershipId)
    return com.readmates.auth.api.AuthMemberResponse.from(member)
}
```

Add this private row type and helpers in the same file:

```kotlin
private data class InvitationRow(
    val id: UUID,
    val clubId: UUID,
    val clubName: String,
    val email: String,
    val status: InvitationStatus,
    val expiresAt: OffsetDateTime,
)

private fun findInvitationByToken(rawToken: String): InvitationRow =
    queryInvitationByToken(rawToken, forUpdate = false)

private fun findInvitationByTokenForUpdate(rawToken: String): InvitationRow =
    queryInvitationByToken(rawToken, forUpdate = true)

private fun queryInvitationByToken(rawToken: String, forUpdate: Boolean): InvitationRow {
    val lockClause = if (forUpdate) "for update of invitations" else ""
    return jdbcTemplate.query(
        """
        select
          invitations.id,
          invitations.club_id,
          clubs.name as club_name,
          invitations.invited_email,
          invitations.status,
          invitations.expires_at
        from invitations
        join clubs on clubs.id = invitations.club_id
        where invitations.token_hash = ?
        $lockClause
        """.trimIndent(),
        { resultSet, _ ->
            InvitationRow(
                id = resultSet.getObject("id", UUID::class.java),
                clubId = resultSet.getObject("club_id", UUID::class.java),
                clubName = resultSet.getString("club_name"),
                email = resultSet.getString("invited_email"),
                status = InvitationStatus.valueOf(resultSet.getString("status")),
                expiresAt = resultSet.getObject("expires_at", OffsetDateTime::class.java),
            )
        },
        tokenService.hashToken(rawToken),
    ).firstOrNull() ?: throw InvitationDomainException("INVITATION_NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found")
}

private fun upsertInvitedUser(identity: InvitationAcceptanceIdentity): UUID {
    val userId = UUID.randomUUID()
    val normalizedEmail = identity.email.trim().lowercase(Locale.ROOT)
    val displayName = identity.displayName?.trim()?.takeIf { it.isNotEmpty() }
        ?: normalizedEmail.substringBefore("@").ifBlank { "ReadMates Member" }
    jdbcTemplate.update(
        """
        insert into users (id, google_subject_id, email, name, profile_image_url)
        values (?, ?, ?, ?, ?)
        on conflict (email) do update set
          google_subject_id = excluded.google_subject_id,
          name = excluded.name,
          profile_image_url = excluded.profile_image_url,
          updated_at = now()
        """.trimIndent(),
        userId,
        identity.googleSubjectId,
        normalizedEmail,
        displayName,
        identity.profileImageUrl?.trim()?.takeIf { it.isNotEmpty() },
    )
    return jdbcTemplate.queryForObject(
        "select id from users where email = ?",
        UUID::class.java,
        normalizedEmail,
    )!!
}

private fun upsertActiveMembership(clubId: UUID, userId: UUID, role: MembershipRole): UUID {
    val membershipId = UUID.randomUUID()
    jdbcTemplate.update(
        """
        insert into memberships (id, club_id, user_id, role, status, joined_at)
        values (?, ?, ?, ?, 'ACTIVE', now())
        on conflict (club_id, user_id) do update set
          role = excluded.role,
          status = 'ACTIVE',
          joined_at = coalesce(memberships.joined_at, now()),
          updated_at = now()
        """.trimIndent(),
        membershipId,
        clubId,
        userId,
        role.name,
    )
    return jdbcTemplate.queryForObject(
        """
        select id
        from memberships
        where club_id = ?
          and user_id = ?
        """.trimIndent(),
        UUID::class.java,
        clubId,
        userId,
    )!!
}

private fun addToCurrentOpenSession(clubId: UUID, membershipId: UUID) {
    jdbcTemplate.update(
        """
        insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
        select gen_random_uuid(), sessions.club_id, sessions.id, ?, 'NO_RESPONSE', 'UNKNOWN'
        from sessions
        where sessions.club_id = ?
          and sessions.state = 'OPEN'
        order by sessions.number desc
        limit 1
        on conflict (session_id, membership_id) do update set
          rsvp_status = session_participants.rsvp_status,
          attendance_status = session_participants.attendance_status,
          updated_at = now()
        """.trimIndent(),
        membershipId,
        clubId,
    )
}

private fun findCurrentMember(membershipId: UUID): CurrentMember {
    return jdbcTemplate.query(
        """
        select
          users.id as user_id,
          memberships.id as membership_id,
          clubs.id as club_id,
          users.email,
          users.name as display_name,
          memberships.role
        from memberships
        join users on users.id = memberships.user_id
        join clubs on clubs.id = memberships.club_id
        where memberships.id = ?
          and memberships.status = 'ACTIVE'
        """.trimIndent(),
        { resultSet, _ ->
            val displayName = resultSet.getString("display_name")
            CurrentMember(
                userId = resultSet.getObject("user_id", UUID::class.java),
                membershipId = resultSet.getObject("membership_id", UUID::class.java),
                clubId = resultSet.getObject("club_id", UUID::class.java),
                email = resultSet.getString("email").lowercase(Locale.ROOT),
                displayName = displayName,
                shortName = displayName,
                role = MembershipRole.valueOf(resultSet.getString("role")),
            )
        },
        membershipId,
    ).firstOrNull() ?: throw InvitationDomainException("MEMBER_NOT_FOUND", HttpStatus.INTERNAL_SERVER_ERROR, "Accepted member not found")
}

private fun maskEmail(email: String): String {
    val normalized = email.trim().lowercase(Locale.ROOT)
    val local = normalized.substringBefore("@")
    val domain = normalized.substringAfter("@", "")
    val prefix = local.take(2).padEnd(2, '*')
    return "$prefix****@$domain"
}
```

Add missing imports to `InvitationService.kt`:

```kotlin
import com.readmates.shared.security.CurrentMember
```

Remove any duplicate imports introduced by the patch.

- [x] **Step 4: Replace the invitation controller stub**

Replace `server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt` with:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.InvitationAcceptanceIdentity
import com.readmates.auth.application.InvitationService
import com.readmates.shared.security.googleOidcIdentityOrNull
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/invitations")
class InvitationController(
    private val invitationService: InvitationService,
) {
    @GetMapping("/{token}")
    fun preview(@PathVariable token: String) = invitationService.previewInvitation(token)

    @PostMapping("/{token}/accept")
    fun accept(
        authentication: Authentication?,
        @PathVariable token: String,
    ): AuthMemberResponse {
        val googleIdentity = authentication.googleOidcIdentityOrNull()
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return invitationService.acceptInvitation(
            token,
            InvitationAcceptanceIdentity(
                email = googleIdentity.email,
                googleSubjectId = googleIdentity.subject,
                displayName = googleIdentity.displayName,
                profileImageUrl = googleIdentity.profileImageUrl,
            ),
        )
    }
}
```

- [x] **Step 5: Add CSRF exemption for authenticated accept**

Modify `SecurityConfig.kt` and add this matcher to the method/path CSRF ignore list:

```kotlin
methodAndPath("POST", Regex("^/api/invitations/[^/]+/accept$")),
```

Keep `/api/invitations/**` in `permitAll`. The controller returns `401` for unauthenticated accept requests.

- [x] **Step 6: Run preview/accept tests**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.InvitationControllerDbTest
```

Expected: PASS.

- [x] **Step 7: Run host tests again**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.HostInvitationControllerTest
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt \
  server/src/main/kotlin/com/readmates/auth/api/InvitationController.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt
git commit -m "feat: accept invitations into active memberships"
```

---

### Task 4: OAuth Invite Redirect And Dev Policy

**Files:**
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/InviteAwareAuthenticationSuccessHandler.kt`
- Create: `server/src/main/kotlin/com/readmates/auth/api/DevInvitationController.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt`
- Modify: `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`
- Modify: `server/src/main/resources/application-dev.yml`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/DevGoogleOAuthAutoMemberTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt`

- [x] **Step 1: Write failing dev shortcut tests**

Create `server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.support.PostgreSqlTestContainer
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/migration,classpath:db/dev",
        "readmates.dev.login-enabled=true",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@ActiveProfiles("dev")
@Sql(statements = [DevInvitationControllerTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class DevInvitationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `dev shortcut accepts a pending invitation and creates a logged in session`() {
        val token = createInvitation("dev.invited@example.com")

        val session = mockMvc.post("/api/dev/invitations/$token/accept")
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("dev.invited@example.com") }
                jsonPath("$.role") { value("MEMBER") }
            }
            .andReturn()
            .request
            .session as MockHttpSession

        mockMvc.get("/api/auth/me") {
            this.session = session
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value("dev.invited@example.com") }
            }
    }

    private fun createInvitation(email: String): String {
        val acceptUrl = mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email"}"""
        }
            .andExpect { status { isCreated() } }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"acceptUrl\":\"")
            .substringBefore("\"")

        return acceptUrl.substringAfterLast("/")
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from invitations where invited_email = 'dev.invited@example.com';
            delete from memberships
            where user_id in (
              select id from users where email = 'dev.invited@example.com'
            );
            delete from users where email = 'dev.invited@example.com';
        """

        @JvmStatic
        @DynamicPropertySource
        fun postgresProperties(registry: DynamicPropertyRegistry) {
            PostgreSqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
```

- [x] **Step 2: Write failing OAuth invite redirect tests**

Create `server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import jakarta.servlet.http.HttpSession
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.TestingAuthenticationToken

class InviteAwareOAuthTest {
    @Test
    fun `capture filter stores invite token from oauth authorization request`() {
        val filter = OAuthInviteTokenCaptureFilter()
        val request = MockHttpServletRequest("GET", "/oauth2/authorization/google")
        val response = MockHttpServletResponse()
        val chain = MockFilterChain()
        request.setParameter("inviteToken", "abc123")

        filter.doFilter(request, response, chain)

        assertEquals("abc123", request.session.getAttribute(InviteAwareAuthenticationSuccessHandler.INVITE_TOKEN_SESSION_ATTRIBUTE))
    }

    @Test
    fun `success handler redirects to invite page when token was captured`() {
        val handler = InviteAwareAuthenticationSuccessHandler("http://localhost:3000")
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        val response = MockHttpServletResponse()
        val session: HttpSession = request.session
        session.setAttribute(InviteAwareAuthenticationSuccessHandler.INVITE_TOKEN_SESSION_ATTRIBUTE, "abc123")

        handler.onAuthenticationSuccess(request, response, TestingAuthenticationToken("user", "n/a"))

        assertEquals("http://localhost:3000/invite/abc123", response.redirectedUrl)
        assertNull(session.getAttribute(InviteAwareAuthenticationSuccessHandler.INVITE_TOKEN_SESSION_ATTRIBUTE))
    }

    @Test
    fun `success handler redirects to app without invite token`() {
        val handler = InviteAwareAuthenticationSuccessHandler("http://localhost:3000")
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        val response = MockHttpServletResponse()

        handler.onAuthenticationSuccess(request, response, TestingAuthenticationToken("user", "n/a"))

        assertEquals("http://localhost:3000/app", response.redirectedUrl)
    }
}
```

- [x] **Step 3: Run new tests and verify they fail**

Run:

```bash
./server/gradlew -p server test --tests com.readmates.auth.api.DevInvitationControllerTest --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest
```

Expected: FAIL because dev shortcut and OAuth invite components do not exist.

- [x] **Step 4: Add OAuth invite token capture filter**

Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class OAuthInviteTokenCaptureFilter : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (request.method == "GET" && request.requestURI.startsWith("/oauth2/authorization/")) {
            val inviteToken = request.getParameter("inviteToken")?.trim()?.takeIf { it.isNotEmpty() }
            if (inviteToken != null) {
                request.session.setAttribute(InviteAwareAuthenticationSuccessHandler.INVITE_TOKEN_SESSION_ATTRIBUTE, inviteToken)
            }
        }

        filterChain.doFilter(request, response)
    }
}
```

- [x] **Step 5: Add invite-aware OAuth success handler**

Create `server/src/main/kotlin/com/readmates/auth/infrastructure/security/InviteAwareAuthenticationSuccessHandler.kt`:

```kotlin
package com.readmates.auth.infrastructure.security

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component

@Component
class InviteAwareAuthenticationSuccessHandler(
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) : AuthenticationSuccessHandler {
    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val normalizedBaseUrl = appBaseUrl.trim().ifEmpty { "http://localhost:3000" }.trimEnd('/')
        val inviteToken = request.session
            .getAttribute(INVITE_TOKEN_SESSION_ATTRIBUTE)
            ?.toString()
            ?.trim()
            ?.takeIf { it.isNotEmpty() }

        request.session.removeAttribute(INVITE_TOKEN_SESSION_ATTRIBUTE)

        val targetUrl = if (inviteToken != null) {
            "$normalizedBaseUrl/invite/$inviteToken"
        } else {
            "$normalizedBaseUrl/app"
        }

        response.sendRedirect(targetUrl)
    }

    companion object {
        const val INVITE_TOKEN_SESSION_ATTRIBUTE = "READMATES_INVITE_TOKEN"
    }
}
```

- [x] **Step 6: Wire OAuth filter and success handler**

Modify constructor parameters in `SecurityConfig.kt`:

```kotlin
private val memberAuthoritiesFilter: MemberAuthoritiesFilter,
private val oAuthInviteTokenCaptureFilter: OAuthInviteTokenCaptureFilter,
private val inviteAwareAuthenticationSuccessHandler: InviteAwareAuthenticationSuccessHandler,
```

Add the filter before the member authorities filter block:

```kotlin
.addFilterBefore(oAuthInviteTokenCaptureFilter, org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter::class.java)
```

Replace:

```kotlin
it.defaultSuccessUrl("$normalizedAppBaseUrl/app", true)
```

with:

```kotlin
it.successHandler(inviteAwareAuthenticationSuccessHandler)
```

The `normalizedAppBaseUrl` local can stay because the failure URL still uses it.

- [x] **Step 7: Remove unknown Google auto-member behavior**

Modify `server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt`.

Replace the body after `findActiveMemberByEmail` with:

```kotlin
return memberAccountRepository.findActiveMemberByEmail(email)
```

Then remove unused constructor dependencies and imports:

```kotlin
import com.readmates.shared.security.googleOidcIdentityOrNull
import org.springframework.beans.factory.annotation.Value
import org.springframework.core.env.Environment
```

Remove constructor parameters:

```kotlin
private val environment: Environment,
@param:Value("\${readmates.dev.google-oauth-auto-member-enabled:false}")
private val googleOAuthAutoMemberEnabled: Boolean,
```

Remove `canAutoProvisionDevGoogleMember()` and `isActiveProfile()`.

Modify `server/src/main/resources/application-dev.yml`:

```yaml
readmates:
  dev:
    login-enabled: true
    google-oauth-auto-member-enabled: false
```

- [x] **Step 8: Add dev invitation accept controller**

Add this method to `InvitationService`:

```kotlin
@Transactional
fun acceptInvitationForDevShortcut(rawToken: String): com.readmates.auth.api.AuthMemberResponse {
    val invitation = findInvitationByToken(rawToken)
    val normalizedEmail = invitation.email.lowercase(Locale.ROOT)
    return acceptInvitation(
        rawToken,
        InvitationAcceptanceIdentity(
            email = normalizedEmail,
            googleSubjectId = "readmates-dev-invite-${sha256Short(normalizedEmail)}",
            displayName = normalizedEmail.substringBefore("@").ifBlank { "Dev Invite" },
            profileImageUrl = null,
        ),
    )
}

private fun sha256Short(value: String): String {
    val digest = java.security.MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return java.util.HexFormat.of().formatHex(digest).take(16)
}
```

Create `server/src/main/kotlin/com/readmates/auth/api/DevInvitationController.kt`:

```kotlin
package com.readmates.auth.api

import com.readmates.auth.application.InvitationService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/dev/invitations")
@Profile("!prod & !production")
@ConditionalOnProperty(prefix = "readmates.dev", name = ["login-enabled"], havingValue = "true")
class DevInvitationController(
    private val invitationService: InvitationService,
) {
    @PostMapping("/{token}/accept")
    fun accept(
        @PathVariable token: String,
        httpRequest: HttpServletRequest,
    ): AuthMemberResponse {
        val response = invitationService.acceptInvitationForDevShortcut(token)
        val authentication = UsernamePasswordAuthenticationToken(
            response.email,
            "N/A",
            listOf(SimpleGrantedAuthority("ROLE_${response.role}")),
        )
        val securityContext = SecurityContextHolder.createEmptyContext()
        securityContext.authentication = authentication
        SecurityContextHolder.setContext(securityContext)
        httpRequest.session.setAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
            securityContext,
        )
        return response
    }
}
```

- [x] **Step 9: Add CSRF exemption for dev shortcut**

Modify `SecurityConfig.kt` and add:

```kotlin
methodAndPath("POST", Regex("^/api/dev/invitations/[^/]+/accept$")),
```

to the method/path CSRF ignore list.

`/api/dev/login` and `/api/dev/logout` are already permit-all; add this route to the permit-all matcher list:

```kotlin
"/api/dev/invitations/**",
```

- [x] **Step 10: Update dev Google auto-member tests**

Modify `server/src/test/kotlin/com/readmates/auth/api/DevGoogleOAuthAutoMemberTest.kt`.

Rename the first test to:

```kotlin
fun `does not auto provision unknown Google user into demo club even when old dev flag is enabled`() {
```

Change expected JSON:

```kotlin
jsonPath("$.authenticated") { value(false) }
jsonPath("$.email") { value("local.google.auth@example.com") }
jsonPath("$.role") { value(null) }
```

Rename the second test to:

```kotlin
fun `unknown Google user cannot reach protected member api without invitation acceptance`() {
```

Change expected status:

```kotlin
status { isForbidden() }
```

Keep the production-profile test as-is; it should continue passing.

- [x] **Step 11: Run OAuth/dev tests**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.DevInvitationControllerTest \
  --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest \
  --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberTest \
  --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberProductionProfileTest \
  --tests com.readmates.auth.api.OAuthAuthorizationControllerTest
```

Expected: PASS.

- [x] **Step 12: Commit**

```bash
git add server/src/main/kotlin/com/readmates/auth/infrastructure/security/OAuthInviteTokenCaptureFilter.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/InviteAwareAuthenticationSuccessHandler.kt \
  server/src/main/kotlin/com/readmates/auth/api/DevInvitationController.kt \
  server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt \
  server/src/main/kotlin/com/readmates/auth/application/AuthenticatedMemberResolver.kt \
  server/src/main/kotlin/com/readmates/auth/application/InvitationService.kt \
  server/src/main/resources/application-dev.yml \
  server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt \
  server/src/test/kotlin/com/readmates/auth/infrastructure/security/InviteAwareOAuthTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/DevGoogleOAuthAutoMemberTest.kt \
  server/src/test/kotlin/com/readmates/auth/api/OAuthAuthorizationControllerTest.kt
git commit -m "feat: route oauth invitations through accept flow"
```

---

### Task 5: Host Invitation Frontend

**Files:**
- Modify: `front/shared/api/readmates.ts`
- Create: `front/features/host/actions/invitations.ts`
- Create: `front/features/host/components/host-invitations.tsx`
- Create: `front/app/(app)/app/host/invitations/page.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Create: `front/tests/unit/host-invitations.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`

- [x] **Step 1: Write failing host invitation UI tests**

Create `front/tests/unit/host-invitations.test.tsx`:

```tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import HostInvitations from "@/features/host/components/host-invitations";
import type { HostInvitationListItem } from "@/shared/api/readmates";

const invitations: HostInvitationListItem[] = [
  {
    invitationId: "invite-1",
    email: "pending@example.com",
    role: "MEMBER",
    status: "PENDING",
    effectiveStatus: "PENDING",
    expiresAt: "2026-05-20T12:00:00Z",
    acceptedAt: null,
    createdAt: "2026-04-20T12:00:00Z",
    canRevoke: true,
    canReissue: true,
  },
  {
    invitationId: "invite-2",
    email: "accepted@example.com",
    role: "MEMBER",
    status: "ACCEPTED",
    effectiveStatus: "ACCEPTED",
    expiresAt: "2026-05-20T12:00:00Z",
    acceptedAt: "2026-04-21T12:00:00Z",
    createdAt: "2026-04-20T12:00:00Z",
    canRevoke: false,
    canReissue: true,
  },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HostInvitations", () => {
  it("renders invitation list statuses and actions", () => {
    render(<HostInvitations initialInvitations={invitations} />);

    expect(screen.getByText("멤버 초대")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.getByText("accepted@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "pending@example.com 초대 취소" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "accepted@example.com 새 링크 발급" })).toBeEnabled();
  });

  it("creates an invitation and copies the returned link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            invitationId: "invite-3",
            email: "new@example.com",
            role: "MEMBER",
            status: "PENDING",
            effectiveStatus: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            acceptedAt: null,
            createdAt: "2026-04-20T12:00:00Z",
            canRevoke: true,
            canReissue: true,
            acceptUrl: "http://localhost:3000/invite/raw-token",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      );
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(navigator, { clipboard: { writeText } });
    const user = userEvent.setup();

    render(<HostInvitations initialInvitations={[]} />);
    await user.type(screen.getByLabelText("초대 이메일"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "초대 링크 만들기" }));

    await waitFor(() => expect(screen.getByDisplayValue("http://localhost:3000/invite/raw-token")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "초대 링크 복사" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/host/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com" }),
    });
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/invite/raw-token");
  });
});
```

Modify `front/tests/unit/host-dashboard.test.tsx` and add this assertion to `renders API dashboard counts and the new session action`:

```tsx
expect(screen.getByRole("link", { name: "멤버 초대" })).toHaveAttribute("href", "/app/host/invitations");
```

- [x] **Step 2: Run failing frontend tests**

Run:

```bash
pnpm --dir front test -- host-invitations.test.tsx host-dashboard.test.tsx
```

Expected: FAIL because host invitation component and dashboard CTA do not exist.

- [x] **Step 3: Add invitation types**

Modify `front/shared/api/readmates.ts` near the auth types:

```ts
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export type HostInvitationListItem = {
  invitationId: string;
  email: string;
  role: MemberRole;
  status: InvitationStatus;
  effectiveStatus: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  canRevoke: boolean;
  canReissue: boolean;
};

export type HostInvitationResponse = HostInvitationListItem & {
  acceptUrl: string | null;
};

export type CreateInvitationRequest = {
  email: string;
};

export type InvitationPreviewResponse = {
  clubName: string;
  emailHint: string;
  status: InvitationStatus;
  expiresAt: string;
  canAccept: boolean;
};

export type InvitationErrorResponse = {
  code: string;
  message: string;
};
```

- [x] **Step 4: Add host invitation fetch helpers**

Create `front/features/host/actions/invitations.ts`:

```ts
import type { CreateInvitationRequest, HostInvitationResponse } from "@/shared/api/readmates";

export async function createInvitation(request: CreateInvitationRequest) {
  return fetch("/api/bff/api/host/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
}

export async function revokeInvitation(invitationId: string) {
  return fetch(`/api/bff/api/host/invitations/${encodeURIComponent(invitationId)}/revoke`, {
    method: "POST",
  });
}

export async function parseHostInvitationResponse(response: Response): Promise<HostInvitationResponse> {
  return (await response.json()) as HostInvitationResponse;
}
```

- [x] **Step 5: Add host invitation component**

Create `front/features/host/components/host-invitations.tsx`:

```tsx
"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { createInvitation, parseHostInvitationResponse, revokeInvitation } from "@/features/host/actions/invitations";
import type { HostInvitationListItem, HostInvitationResponse, InvitationStatus } from "@/shared/api/readmates";

const statusLabels: Record<InvitationStatus, string> = {
  PENDING: "대기",
  ACCEPTED: "수락됨",
  EXPIRED: "만료됨",
  REVOKED: "취소됨",
};

export default function HostInvitations({ initialInvitations }: { initialInvitations: HostInvitationListItem[] }) {
  const [email, setEmail] = useState("");
  const [invitations, setInvitations] = useState(initialInvitations);
  const [lastCreated, setLastCreated] = useState<HostInvitationResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const response = await createInvitation({ email: email.trim() });
    if (!response.ok) {
      setMessage(response.status === 409 ? "이미 활성 멤버인 이메일입니다." : "초대 생성에 실패했습니다.");
      return;
    }
    const created = await parseHostInvitationResponse(response);
    setLastCreated(created);
    setInvitations((current) => [created, ...current.filter((item) => item.invitationId !== created.invitationId)]);
    setEmail("");
  };

  const copyLastCreated = async () => {
    if (!lastCreated?.acceptUrl) {
      return;
    }
    await navigator.clipboard.writeText(lastCreated.acceptUrl);
    setMessage("초대 링크를 복사했습니다.");
  };

  const revoke = async (invitation: HostInvitationListItem) => {
    const response = await revokeInvitation(invitation.invitationId);
    if (!response.ok) {
      setMessage("초대 취소에 실패했습니다.");
      return;
    }
    const updated = await parseHostInvitationResponse(response);
    setInvitations((current) => current.map((item) => (item.invitationId === updated.invitationId ? updated : item)));
  };

  const reissue = async (invitation: HostInvitationListItem) => {
    setEmail(invitation.email);
    const response = await createInvitation({ email: invitation.email });
    if (!response.ok) {
      setMessage("새 링크 발급에 실패했습니다.");
      return;
    }
    const created = await parseHostInvitationResponse(response);
    setLastCreated(created);
    setInvitations((current) => [created, ...current.filter((item) => item.email !== created.email)]);
  };

  return (
    <main>
      <section className="page-header-compact">
        <div className="container">
          <Link href="/app/host" className="btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: "10px" }}>
            ← 운영 대시보드
          </Link>
          <div className="eyebrow">Host invitations</div>
          <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
            멤버 초대
          </h1>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            초대받은 이메일의 Google 계정만 멤버십을 활성화할 수 있습니다.
          </p>
        </div>
      </section>

      <section style={{ padding: "36px 0 80px" }}>
        <div className="container">
          <form className="surface" onSubmit={submit} style={{ padding: 24, marginBottom: 24 }}>
            <label className="label" htmlFor="invite-email">
              초대 이메일
            </label>
            <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                id="invite-email"
                className="input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="member@example.com"
                style={{ maxWidth: 360 }}
              />
              <button className="btn btn-primary" type="submit">
                초대 링크 만들기
              </button>
            </div>
            {lastCreated?.acceptUrl ? (
              <div className="surface-quiet" style={{ padding: 16, marginTop: 16 }}>
                <label className="label" htmlFor="created-invite-url">
                  생성된 초대 링크
                </label>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <input id="created-invite-url" className="input" readOnly value={lastCreated.acceptUrl} style={{ maxWidth: 520 }} />
                  <button className="btn btn-ghost" type="button" onClick={() => void copyLastCreated()}>
                    초대 링크 복사
                  </button>
                </div>
              </div>
            ) : null}
            {message ? <p className="small" style={{ margin: "12px 0 0" }}>{message}</p> : null}
          </form>

          <div className="surface" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>
              Invitation list
            </div>
            <div className="stack" style={{ "--stack": "12px" } as React.CSSProperties}>
              {invitations.length === 0 ? (
                <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                  아직 만든 초대가 없습니다.
                </p>
              ) : (
                invitations.map((invitation) => (
                  <div key={invitation.invitationId} className="row-between" style={{ gap: 16, flexWrap: "wrap" }}>
                    <div>
                      <div className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                        {invitation.email}
                      </div>
                      <div className="tiny">
                        {statusLabels[invitation.effectiveStatus]} · 만료 {invitation.expiresAt.slice(0, 10)}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      {invitation.canRevoke ? (
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => void revoke(invitation)}>
                          {invitation.email} 초대 취소
                        </button>
                      ) : null}
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => void reissue(invitation)}>
                        {invitation.email} 새 링크 발급
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
```

- [x] **Step 6: Add the host invitations route**

Create `front/app/(app)/app/host/invitations/page.tsx`:

```tsx
import HostInvitations from "@/features/host/components/host-invitations";
import type { HostInvitationListItem } from "@/shared/api/readmates";
import { fetchBff } from "../../bff";

export default async function HostInvitationsPage() {
  const invitations = await fetchBff<HostInvitationListItem[]>("/api/host/invitations");

  return <HostInvitations initialInvitations={invitations} />;
}
```

- [x] **Step 7: Add host dashboard CTA**

Modify `front/features/host/components/host-dashboard.tsx`.

In the header action row next to the new session link, add:

```tsx
<Link href="/app/host/invitations" className="btn btn-ghost">
  멤버 초대
</Link>
```

- [x] **Step 8: Run host frontend tests**

Run:

```bash
pnpm --dir front test -- host-invitations.test.tsx host-dashboard.test.tsx
```

Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add front/shared/api/readmates.ts \
  front/features/host/actions/invitations.ts \
  front/features/host/components/host-invitations.tsx \
  'front/app/(app)/app/host/invitations/page.tsx' \
  front/features/host/components/host-dashboard.tsx \
  front/tests/unit/host-invitations.test.tsx \
  front/tests/unit/host-dashboard.test.tsx
git commit -m "feat: add host invitation screen"
```

---

### Task 6: Invite Acceptance Frontend

**Files:**
- Create: `front/features/auth/google-oauth.ts`
- Modify: `front/features/auth/components/login-card.tsx`
- Create: `front/features/auth/actions/invitations.ts`
- Create: `front/features/auth/components/invite-acceptance-card.tsx`
- Modify: `front/app/(public)/invite/[token]/page.tsx`
- Create: `front/tests/unit/invite-acceptance-card.test.tsx`
- Modify: `front/tests/unit/login-card.test.tsx`

- [x] **Step 1: Write failing invite acceptance tests**

Create `front/tests/unit/invite-acceptance-card.test.tsx`:

```tsx
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import InviteAcceptanceCard from "@/features/auth/components/invite-acceptance-card";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("InviteAcceptanceCard", () => {
  it("shows Google continuation for a pending invite when there is no auth email", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ clubName: "읽는사이", emailHint: "ne****@example.com", status: "PENDING", expiresAt: "2026-05-20T12:00:00Z", canAccept: true }))
        .mockResolvedValueOnce(jsonResponse({ authenticated: false, email: null })),
    );

    render(<InviteAcceptanceCard token="raw-token" />);

    expect(await screen.findByText("읽는사이 초대")).toBeInTheDocument();
    expect(screen.getByText("ne****@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?inviteToken=raw-token",
    );
  });

  it("accepts the invitation when an authenticated email exists", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ clubName: "읽는사이", emailHint: "ne****@example.com", status: "PENDING", expiresAt: "2026-05-20T12:00:00Z", canAccept: true }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false, email: "new@example.com" }))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, email: "new@example.com", role: "MEMBER" }));
    const location = { href: "" };
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);
    const user = userEvent.setup();

    render(<InviteAcceptanceCard token="raw-token" />);
    await user.click(await screen.findByRole("button", { name: "초대 수락" }));

    expect(fetchMock).toHaveBeenLastCalledWith("/api/bff/api/invitations/raw-token/accept", {
      method: "POST",
    });
    await waitFor(() => expect(location.href).toBe("/app"));
  });

  it("shows dev shortcut only when enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_LOGIN", "true");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ clubName: "읽는사이", emailHint: "de****@example.com", status: "PENDING", expiresAt: "2026-05-20T12:00:00Z", canAccept: true }))
        .mockResolvedValueOnce(jsonResponse({ authenticated: false, email: null })),
    );

    render(<InviteAcceptanceCard token="raw-token" />);

    expect(await screen.findByRole("button", { name: "Dev: 초대 이메일로 수락" })).toBeInTheDocument();
  });

  it("renders expired invitation state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse({ clubName: "읽는사이", emailHint: "ex****@example.com", status: "EXPIRED", expiresAt: "2026-04-01T12:00:00Z", canAccept: false }))
        .mockResolvedValueOnce(jsonResponse({ authenticated: false, email: null })),
    );

    render(<InviteAcceptanceCard token="raw-token" />);

    expect(await screen.findByText("초대가 만료되었습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Google로 계속하기" })).not.toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run failing invite frontend tests**

Run:

```bash
pnpm --dir front test -- invite-acceptance-card.test.tsx login-card.test.tsx
```

Expected: FAIL because `InviteAcceptanceCard` and shared OAuth helper do not exist.

- [x] **Step 3: Extract shared Google OAuth helper**

Create `front/features/auth/google-oauth.ts`:

```ts
export function buildGoogleOAuthHref(mode: "login" | "invite", inviteToken?: string) {
  const configuredPath = process.env.NEXT_PUBLIC_AUTH_GOOGLE_URL?.trim() || "/oauth2/authorization/google";
  const [path, queryString = ""] = configuredPath.split("?");
  const query = new URLSearchParams(queryString);

  if (mode === "invite" && inviteToken) {
    query.set("inviteToken", inviteToken);
  }

  const serialized = query.toString();

  return serialized ? `${path}?${serialized}` : path;
}
```

Modify `front/features/auth/components/login-card.tsx`:

```tsx
import { buildGoogleOAuthHref } from "@/features/auth/google-oauth";
```

Delete the local `buildGoogleOAuthHref` function from `login-card.tsx`.

- [x] **Step 4: Add invite frontend fetch helpers**

Create `front/features/auth/actions/invitations.ts`:

```ts
import type { AuthMeResponse, InvitationPreviewResponse } from "@/shared/api/readmates";

export async function fetchInvitationPreview(token: string): Promise<Response> {
  return fetch(`/api/bff/api/invitations/${encodeURIComponent(token)}`);
}

export async function fetchAuthMe(): Promise<AuthMeResponse> {
  const response = await fetch("/api/bff/api/auth/me");
  return (await response.json()) as AuthMeResponse;
}

export async function acceptInvitation(token: string): Promise<Response> {
  return fetch(`/api/bff/api/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
}

export async function acceptInvitationWithDevShortcut(token: string): Promise<Response> {
  return fetch(`/api/bff/api/dev/invitations/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
}

export async function parseInvitationPreview(response: Response): Promise<InvitationPreviewResponse> {
  return (await response.json()) as InvitationPreviewResponse;
}
```

- [x] **Step 5: Add invite acceptance card**

Create `front/features/auth/components/invite-acceptance-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  acceptInvitation,
  acceptInvitationWithDevShortcut,
  fetchAuthMe,
  fetchInvitationPreview,
  parseInvitationPreview,
} from "@/features/auth/actions/invitations";
import { buildGoogleOAuthHref } from "@/features/auth/google-oauth";
import type { AuthMeResponse, InvitationPreviewResponse, InvitationStatus } from "@/shared/api/readmates";

const statusCopy: Record<InvitationStatus, { title: string; body: string }> = {
  PENDING: {
    title: "읽는사이 초대",
    body: "초대받은 이메일의 Google 계정으로 로그인하면 멤버십이 활성화됩니다.",
  },
  ACCEPTED: {
    title: "이미 사용된 초대입니다.",
    body: "이미 수락된 링크입니다. 멤버라면 로그인해서 내 공간으로 이동해 주세요.",
  },
  EXPIRED: {
    title: "초대가 만료되었습니다.",
    body: "호스트에게 새 초대 링크를 요청해 주세요.",
  },
  REVOKED: {
    title: "사용할 수 없는 초대입니다.",
    body: "취소된 초대 링크입니다. 호스트에게 확인해 주세요.",
  },
};

export default function InviteAcceptanceCard({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitationPreviewResponse | null>(null);
  const [auth, setAuth] = useState<AuthMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchInvitationPreview(token), fetchAuthMe()])
      .then(async ([previewResponse, authResponse]) => {
        if (!active) {
          return;
        }
        if (!previewResponse.ok) {
          setError("초대 링크를 찾을 수 없습니다.");
          return;
        }
        setPreview(await parseInvitationPreview(previewResponse));
        setAuth(authResponse);
      })
      .catch(() => {
        if (active) {
          setError("초대 정보를 불러오지 못했습니다.");
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const runAccept = async () => {
    const response = await acceptInvitation(token);
    if (response.ok) {
      globalThis.location.href = "/app";
      return;
    }
    if (response.status === 403) {
      setError("초대된 이메일과 로그인한 Google 이메일이 다릅니다.");
      return;
    }
    setError("초대를 수락하지 못했습니다.");
  };

  const runDevAccept = async () => {
    const response = await acceptInvitationWithDevShortcut(token);
    if (response.ok) {
      globalThis.location.href = "/app";
      return;
    }
    setError("Dev 초대 수락에 실패했습니다.");
  };

  const copy = preview ? statusCopy[preview.status] : null;
  const canAccept = preview?.canAccept === true;
  const hasAuthenticatedEmail = Boolean(auth?.email);

  return (
    <section className="auth-shell">
      <div className="container" style={{ maxWidth: 520 }}>
        <Link href="/" className="btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: 24 }}>
          ← 공개 화면으로
        </Link>
        <div className="surface auth-card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Invitation verification
          </div>
          <h1 className="h2 editorial" style={{ margin: 0 }}>
            {error ?? copy?.title ?? "초대 확인 중"}
          </h1>
          {copy ? (
            <p className="body" style={{ color: "var(--text-2)", marginTop: 16 }}>
              {copy.body}
            </p>
          ) : null}
          {preview ? (
            <div className="surface-quiet" style={{ padding: 16, marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                초대 대상
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--text-2)" }}>
                {preview.emailHint}
              </div>
              <div className="tiny" style={{ marginTop: 8 }}>
                만료 {preview.expiresAt.slice(0, 10)}
              </div>
            </div>
          ) : null}
          {canAccept ? (
            <div className="auth-card__actions">
              {hasAuthenticatedEmail ? (
                <button className="btn btn-primary btn-lg" type="button" onClick={() => void runAccept()}>
                  초대 수락
                </button>
              ) : (
                <a className="btn btn-primary btn-lg" href={buildGoogleOAuthHref("invite", token)}>
                  Google로 계속하기
                </a>
              )}
              {process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true" ? (
                <button className="btn btn-ghost btn-lg" type="button" onClick={() => void runDevAccept()}>
                  Dev: 초대 이메일로 수락
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
```

- [x] **Step 6: Replace invite page**

Modify `front/app/(public)/invite/[token]/page.tsx`:

```tsx
import InviteAcceptanceCard from "@/features/auth/components/invite-acceptance-card";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;

  return <InviteAcceptanceCard token={token} />;
}
```

- [x] **Step 7: Run invite frontend tests**

Run:

```bash
pnpm --dir front test -- invite-acceptance-card.test.tsx login-card.test.tsx
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add front/features/auth/google-oauth.ts \
  front/features/auth/components/login-card.tsx \
  front/features/auth/actions/invitations.ts \
  front/features/auth/components/invite-acceptance-card.tsx \
  'front/app/(public)/invite/[token]/page.tsx' \
  front/tests/unit/invite-acceptance-card.test.tsx \
  front/tests/unit/login-card.test.tsx
git commit -m "feat: add real invitation acceptance UI"
```

---

### Task 7: E2E, Docs, And Final Verification

**Files:**
- Modify: `front/tests/e2e/dev-login-session-flow.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-04-20-readmates-invite-only-membership-implementation-plan.md`

- [x] **Step 1: Add e2e cleanup for invited users and invitations**

Modify `front/tests/e2e/dev-login-session-flow.spec.ts`.

Append this SQL to `cleanupGeneratedSessionsSql`:

```ts
delete from invitations
where club_id = '00000000-0000-0000-0000-000000000001'::uuid
  and invited_email = 'e2e.invited@example.com';

delete from memberships
using users
where memberships.user_id = users.id
  and memberships.club_id = '00000000-0000-0000-0000-000000000001'::uuid
  and users.email = 'e2e.invited@example.com';

delete from users
where email = 'e2e.invited@example.com'
  and not exists (
    select 1
    from memberships
    where memberships.user_id = users.id
  );
```

- [x] **Step 2: Add e2e invitation acceptance flow**

Append this test to `front/tests/e2e/dev-login-session-flow.spec.ts`:

```ts
test("host invites a new member who accepts through the dev invitation shortcut", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /김호스트 · HOST/ }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto("/app/host/sessions/new");
  await page.getByLabel("세션 제목").fill("7회차 모임 · 초대 테스트 책");
  await page.getByLabel("책 제목").fill("초대 테스트 책");
  await page.getByLabel("저자").fill("초대 테스트 저자");
  await page.getByLabel("모임 날짜").fill("2026-05-20");
  await page.getByRole("button", { name: "변경 사항 저장" }).click();
  await expect(page).toHaveURL(/\/app\/session\/current/);

  await page.goto("/app/host/invitations");
  await page.getByLabel("초대 이메일").fill("e2e.invited@example.com");
  await page.getByRole("button", { name: "초대 링크 만들기" }).click();
  const inviteUrl = await page.getByLabel("생성된 초대 링크").inputValue();
  const invitePath = new URL(inviteUrl).pathname;

  await page.goto(invitePath);
  await page.getByRole("button", { name: "Dev: 초대 이메일로 수락" }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto("/app/session/current");
  await expect(page.getByText("초대 테스트 책").first()).toBeVisible();
  const rsvpResponse = page.waitForResponse(
    (response) => response.url().includes("/api/bff/api/sessions/current/rsvp") && response.status() === 200,
  );
  await page.getByRole("button", { name: "참석" }).click();
  await rsvpResponse;
});
```

- [x] **Step 3: Update README**

Modify `README.md`.

Replace the partial invitation bullet:

```md
- Invitation preview remains a fixed sample response; full invitation acceptance is not wired to a controller.
```

with:

```md
- Invitation creation, preview, revocation, and acceptance are DB-backed. Hosts create copyable 30-day invite links, and invited users become active members only when the invite email matches their verified Google email or the dev invitation shortcut.
```

Replace the dev Google auto-member paragraph:

```md
When the backend runs with the `dev` profile, a verified Google account that is not already in the seed data is automatically added to the demo `읽는사이` club as a `MEMBER`. This keeps local Google login testable with a real personal Google account. Host-only screens still require the seeded host account or the dev login chooser.
```

with:

```md
Unknown Google accounts are not auto-added to the demo club. To test a new account locally, the host creates an invitation link and the invitee accepts it with the matching Google account. When `NEXT_PUBLIC_ENABLE_DEV_LOGIN=true`, `/invite/{token}` also shows a dev-only shortcut that accepts the pending invitation and signs in as the invited email without sending email.
```

Add these API bullets under current DB-backed auth endpoints:

```md
- `GET /api/host/invitations`
- `POST /api/host/invitations`
- `POST /api/host/invitations/{invitationId}/revoke`
- `GET /api/invitations/{token}`
- `POST /api/invitations/{token}/accept`
- `POST /api/dev/invitations/{token}/accept` when the `dev` profile enables dev login
```

- [x] **Step 4: Run focused verification**

Run:

```bash
./server/gradlew -p server test \
  --tests com.readmates.auth.api.HostInvitationControllerTest \
  --tests com.readmates.auth.api.InvitationControllerDbTest \
  --tests com.readmates.auth.api.DevInvitationControllerTest \
  --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest \
  --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberTest \
  --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberProductionProfileTest
```

Expected: PASS.

Run:

```bash
pnpm --dir front test -- host-invitations.test.tsx invite-acceptance-card.test.tsx host-dashboard.test.tsx login-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
./server/gradlew -p server test
```

Expected: PASS.

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. If e2e cannot run because local PostgreSQL or browser dependencies are unavailable, run the focused unit/backend suites above and record the exact environment blocker in the final response.

Actual verification log:

- `./server/gradlew -p server test --tests com.readmates.auth.api.HostInvitationControllerTest --tests com.readmates.auth.api.InvitationControllerDbTest --tests com.readmates.auth.api.DevInvitationControllerTest --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberTest --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberProductionProfileTest`: PASS, BUILD SUCCESSFUL.
- `pnpm --dir front test -- host-invitations.test.tsx invite-acceptance-card.test.tsx host-dashboard.test.tsx login-card.test.tsx`: PASS, 24 files / 134 tests.
- `./server/gradlew -p server test`: PASS, BUILD SUCCESSFUL.
- `pnpm --dir front test`: PASS, 24 files / 134 tests.
- `pnpm --dir front exec playwright test tests/e2e/dev-login-session-flow.spec.ts -g "host invites a new member who accepts through the dev invitation shortcut"`: BLOCKED before test execution because another `next dev` process is already running in `front`, PID `53795`, and Playwright config uses `reuseExistingServer: false`.
- `pnpm --dir front test:e2e`: BLOCKED for the same Next dev server lock.

Code-quality fix verification:

- `./server/gradlew -p server test --tests com.readmates.auth.api.HostInvitationControllerTest --tests com.readmates.auth.api.InvitationControllerDbTest --tests com.readmates.auth.api.DevInvitationControllerTest --tests com.readmates.auth.infrastructure.security.InviteAwareOAuthTest --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberTest --tests com.readmates.auth.api.DevGoogleOAuthAutoMemberProductionProfileTest`: PASS, BUILD SUCCESSFUL.
- `pnpm --dir front test -- host-invitations.test.tsx invite-acceptance-card.test.tsx host-dashboard.test.tsx login-card.test.tsx`: PASS, 24 files / 135 tests.
- `pnpm --dir front exec playwright test tests/e2e/dev-login-session-flow.spec.ts -g "host invites a new member who accepts through the dev invitation shortcut"`: BLOCKED before test execution because another `next dev` process is already running in `front`, PID `53795`, and Playwright config uses `reuseExistingServer: false`.

- [x] **Step 6: Update plan checkboxes**

After each task has been implemented, update this plan file so completed steps use `- [x]`. Keep unchecked boxes only for work that truly remains.

- [x] **Step 7: Commit docs and e2e**

```bash
git add front/tests/e2e/dev-login-session-flow.spec.ts README.md docs/superpowers/plans/2026-04-20-readmates-invite-only-membership-implementation-plan.md
git commit -m "test: cover invite-only membership flow"
```

---

## Final Verification Checklist

- [x] `./server/gradlew -p server test`
- [x] `pnpm --dir front test`
- [ ] `pnpm --dir front test:e2e`
- [ ] Manual local smoke, if dev servers are already running:
  - [ ] Host dev login works.
  - [ ] Host can create an invitation at `/app/host/invitations`.
  - [ ] Invite page shows masked email and dev shortcut in dev.
  - [ ] Dev shortcut signs in the invited email.
  - [ ] Invited member can see current session and RSVP.

## Self-Review Notes

- Spec coverage:
  - Host create/list/revoke/reissue is covered in Tasks 2 and 5.
  - Public preview and authenticated acceptance are covered in Tasks 3 and 6.
  - One-time 30-day token, hash storage, and no raw DB token are covered in Tasks 1 and 2.
  - Open-session participant auto-add is covered in Task 3 and Task 7 e2e.
  - Dev/prod policy and dev shortcut are covered in Task 4.
  - README sync and final verification are covered in Task 7.
- Scope boundary:
  - This plan does not add email delivery, signup application queues, role-changing UI, member deletion, or multi-club UI.
- Known implementation risk:
  - The dev shortcut needs the service to expose invited email internally without exposing it through public preview. Keep that helper service-only and do not add raw email to `GET /api/invitations/{token}`.
