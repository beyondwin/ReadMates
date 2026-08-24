package com.readmates.auth.api

import com.readmates.admin.takedown.adapter.`in`.web.PlatformAdminPublicTakedownController
import com.readmates.admin.takedown.adapter.`in`.web.PlatformAdminPublicTakedownErrorHandler
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.port.`in`.ConfirmPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.auth.adapter.`in`.security.CurrentMemberWebConfig
import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.model.AuthoritySynthesisRequest
import com.readmates.auth.application.model.AuthoritySynthesisResult
import com.readmates.auth.application.model.IssuedAuthSession
import com.readmates.auth.application.model.JoinedClubSummary
import com.readmates.auth.application.model.StoredAuthSession
import com.readmates.auth.application.port.`in`.ManageAuthSessionUseCase
import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.application.port.`in`.SynthesizeAuthoritiesUseCase
import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.auth.application.port.out.RateLimitPort
import com.readmates.auth.infrastructure.security.BffSecretFilter
import com.readmates.auth.infrastructure.security.GoogleOidcUserService
import com.readmates.auth.infrastructure.security.MemberAuthoritiesFilter
import com.readmates.auth.infrastructure.security.OAuthFlowContextRepository
import com.readmates.auth.infrastructure.security.PlatformAdminAuthoritiesFilter
import com.readmates.auth.infrastructure.security.RateLimitFilter
import com.readmates.auth.infrastructure.security.ReadmatesOAuthSuccessHandler
import com.readmates.auth.infrastructure.security.SecurityConfig
import com.readmates.auth.infrastructure.security.SessionCookieAuthenticationFilter
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.PlatformCapability
import com.readmatesharness.PlatformAdminBffSecurityHarnessApplication
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.EnableAutoConfiguration
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

@SpringBootTest(
    classes = [PlatformAdminBffSecurityHarnessApplication::class],
    properties = [
        "readmates.security.bff.secrets=test-bff-secret",
        "readmates.bff-secret-required=true",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
class PlatformAdminBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val identities: PlatformAdminSecurityIdentities,
) {
    @BeforeEach
    fun resetIdentities() {
        identities.reset()
    }

    @Test
    fun `missing or wrong bff secret rejects exact admin post`() {
        identities.admin(PlatformAdminRole.OWNER)

        listOf<String?>(null, "wrong-secret").forEach { secret ->
            exactRequest(secret = secret).andExpect { status { isUnauthorized() } }
        }
    }

    @Test
    fun `cross site origin or referer rejects exact admin post`() {
        identities.admin(PlatformAdminRole.OWNER)

        exactRequest(origin = "https://attacker.example").andExpect { status { isForbidden() } }
        exactRequest(origin = null, referer = "https://attacker.example/path").andExpect { status { isForbidden() } }
    }

    @Test
    fun `inactive session and active non admin reject at distinct resolver boundaries`() {
        identities.inactiveSession()
        exactRequest().andExpect { status { isUnauthorized() } }
        assertThat(identities.platformAdminLookups).isEmpty()

        identities.nonAdmin()
        exactRequest().andExpect { status { isForbidden() } }
        assertThat(identities.platformAdminLookups).contains(NON_ADMIN_ID)
    }

    @Test
    fun `support lacks emergency capability`() {
        identities.admin(PlatformAdminRole.SUPPORT)

        exactRequest().andExpect { status { isForbidden() } }
    }

    @Test
    fun `same origin owner and same referer operator reach the real controller chain`() {
        identities.admin(PlatformAdminRole.OWNER)
        exactRequest().andExpect {
            status { isOk() }
            jsonPath("$.schema") { value("admin.public_takedown.preview.v1") }
        }

        identities.admin(PlatformAdminRole.OPERATOR)
        exactRequest(origin = null, referer = "http://localhost:3000/admin").andExpect { status { isOk() } }
    }

    @Test
    fun `near miss method and path remain csrf protected`() {
        identities.admin(PlatformAdminRole.OWNER)

        mockMvc
            .put(EXACT_PATH) {
                contentType = MediaType.APPLICATION_JSON
                content = REQUEST_JSON
                cookie(Cookie(SESSION_COOKIE, SESSION_TOKEN))
                header(BffSecretFilter.BFF_SECRET_HEADER, "test-bff-secret")
                header("Origin", "http://localhost:3000")
            }.andExpect { status { isForbidden() } }
        mockMvc
            .post("$EXACT_PATH/near-miss") {
                contentType = MediaType.APPLICATION_JSON
                content = REQUEST_JSON
                cookie(Cookie(SESSION_COOKIE, SESSION_TOKEN))
                header(BffSecretFilter.BFF_SECRET_HEADER, "test-bff-secret")
                header("Origin", "http://localhost:3000")
            }.andExpect { status { isForbidden() } }
    }

    private fun exactRequest(
        secret: String? = "test-bff-secret",
        origin: String? = "http://localhost:3000",
        referer: String? = null,
    ) = mockMvc.post(EXACT_PATH) {
        contentType = MediaType.APPLICATION_JSON
        content = REQUEST_JSON
        cookie(Cookie(SESSION_COOKIE, SESSION_TOKEN))
        secret?.let { header(BffSecretFilter.BFF_SECRET_HEADER, it) }
        origin?.let { header("Origin", it) }
        referer?.let { header("Referer", it) }
    }

    private companion object {
        val USER_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060001")
        val NON_ADMIN_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060006")
        const val EMAIL = "platform-admin-security@example.test"
        const val SESSION_COOKIE = "READMATES_SECURITY_SESSION"
        const val SESSION_TOKEN = "task4-session-token"
        const val EXACT_PATH = "/api/admin/public-takedowns/preview"
        val CLUB_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060002")
        val SESSION_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060003")
        val PUBLICATION_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060004")
        val REQUEST_JSON =
            """{"clubId":"$CLUB_ID","sessionId":"$SESSION_ID","publicationId":"$PUBLICATION_ID"}"""
    }
}

@TestConfiguration(proxyBeanMethods = false)
@EnableAutoConfiguration(exclude = [DataSourceAutoConfiguration::class, FlywayAutoConfiguration::class])
@Import(
    SecurityConfig::class,
    CurrentMemberWebConfig::class,
    PlatformAdminPublicTakedownController::class,
    PlatformAdminPublicTakedownErrorHandler::class,
)
class PlatformAdminBffSecurityHarnessConfiguration {
    @Bean
    fun identities() = PlatformAdminSecurityIdentities()

    @Bean
    fun manageSessions(identities: PlatformAdminSecurityIdentities): ManageAuthSessionUseCase =
        object : ManageAuthSessionUseCase {
            override val sessionCookieName: String = "READMATES_SECURITY_SESSION"

            override fun findValidSession(rawToken: String): StoredAuthSession? = identities.session(rawToken)

            override fun issueSession(
                userId: String,
                userAgent: String?,
                ipAddress: String?,
            ): IssuedAuthSession = error("unused")

            override fun sessionCookie(rawToken: String): String = error("unused")

            override fun clearedSessionCookie(): String = error("unused")
        }

    @Bean
    fun authenticatedPrincipals(identities: PlatformAdminSecurityIdentities): ResolveAuthenticatedPrincipalUseCase =
        object : ResolveAuthenticatedPrincipalUseCase {
            override fun resolveUserById(userId: String): CurrentUser? = identities.user(userId)

            override fun resolveByEmail(
                email: String?,
                clubContext: ResolvedClubContext?,
            ): AuthenticatedMemberSnapshot? = null

            override fun resolveByUserId(
                userId: String,
                clubContext: ResolvedClubContext?,
            ): AuthenticatedMemberSnapshot? = null

            override fun resolveProfileByUserId(userId: String): AuthenticatedMemberSnapshot? = null
        }

    @Bean
    fun currentMembers(identities: PlatformAdminSecurityIdentities): ResolveCurrentMemberUseCase =
        object : ResolveCurrentMemberUseCase {
            override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = identities.platformAdmin(userId)

            override fun resolveByEmail(email: String): CurrentMember? = null

            override fun findUserIdByEmail(email: String): UUID? = null

            override fun resolveByUserAndClub(
                userId: UUID,
                clubId: UUID,
            ): CurrentMember? = null

            override fun resolveByEmailAndClub(
                email: String,
                clubId: UUID,
            ): CurrentMember? = null

            override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()
        }

    @Bean
    fun clubContexts(): ResolveClubContextUseCase =
        object : ResolveClubContextUseCase {
            override fun resolveBySlug(slug: String): ResolvedClubContext? = null

            override fun resolveByHost(host: String?): ResolvedClubContext? = null
        }

    @Bean
    fun supportAccess(): CheckSupportAccessGrantUseCase =
        object : CheckSupportAccessGrantUseCase {
            override fun synthesizeHostCurrentMember(
                userId: UUID,
                email: String,
                clubId: UUID,
                clubSlug: String,
                clubName: String,
            ): SupportMemberSynthesis? = null
        }

    @Bean
    fun synthesizeAuthorities(): SynthesizeAuthoritiesUseCase =
        object : SynthesizeAuthoritiesUseCase {
            override fun synthesize(request: AuthoritySynthesisRequest): AuthoritySynthesisResult =
                AuthoritySynthesisResult(request.incomingAuthorities, request.supportSynthesis)
        }

    @Bean
    fun allowedOrigin(): AllowedOriginPort =
        object : AllowedOriginPort {
            override fun isAllowed(origin: String): Boolean = origin == "http://localhost:3000"
        }

    @Bean
    fun bffSecretFilter(allowedOrigin: AllowedOriginPort) =
        BffSecretFilter(
            configuredSecretsRaw = "test-bff-secret",
            legacyExpectedSecret = "",
            bffSecretRequired = true,
            allowedOriginPort = allowedOrigin,
        )

    @Bean
    fun sessionCookieAuthenticationFilter(
        sessions: ManageAuthSessionUseCase,
        principals: ResolveAuthenticatedPrincipalUseCase,
        clubs: ResolveClubContextUseCase,
    ) = SessionCookieAuthenticationFilter(sessions, principals, clubs)

    @Bean
    fun platformAdminAuthoritiesFilter(currentMembers: ResolveCurrentMemberUseCase) = PlatformAdminAuthoritiesFilter(currentMembers)

    @Bean
    fun memberAuthoritiesFilter(
        synthesize: SynthesizeAuthoritiesUseCase,
        principals: ResolveAuthenticatedPrincipalUseCase,
        clubs: ResolveClubContextUseCase,
        support: CheckSupportAccessGrantUseCase,
    ) = MemberAuthoritiesFilter(synthesize, principals, clubs, support)

    @Bean
    fun rateLimitFilter() =
        RateLimitFilter(
            RateLimitPort.InMemoryForTest(),
            RateLimitProperties(enabled = false),
            configuredBffSecretsRaw = "test-bff-secret",
        )

    @Bean
    fun previewPublicTakedown(): PreviewPublicTakedownUseCase =
        object : PreviewPublicTakedownUseCase {
            override fun preview(
                actor: com.readmates.shared.security.PlatformActor,
                actorRoleSnapshot: String,
                command: PreviewPublicTakedownCommand,
            ): PublicTakedownPreview {
                if (!actor.can(PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN)) {
                    throw PublicTakedownException(PublicTakedownError.PERMISSION_DENIED)
                }
                return PublicTakedownPreview(
                    previewId = UUID.fromString("dddddddd-0000-4000-8000-000000060005"),
                    actorAdminId = actor.adminId,
                    actorRoleSnapshot = actorRoleSnapshot,
                    expiresAt = Instant.parse("2026-08-24T01:00:00Z"),
                    clubId = command.clubId,
                    sessionId = command.sessionId,
                    publicationId = command.publicationId,
                    targetGeneration = 1,
                    currentSurfaces = setOf("PUBLIC_DETAIL"),
                    confirmEnabled = false,
                )
            }
        }

    @Bean
    fun confirmPublicTakedown(): ConfirmPublicTakedownUseCase = mock(ConfirmPublicTakedownUseCase::class.java)

    @Bean
    fun oauthFlowContextRepository(): OAuthFlowContextRepository = mock(OAuthFlowContextRepository::class.java)

    @Bean
    fun googleOidcUserService() = GoogleOidcUserService()

    @Bean
    fun readmatesOAuthSuccessHandler(): ReadmatesOAuthSuccessHandler = mock(ReadmatesOAuthSuccessHandler::class.java)
}

class PlatformAdminSecurityIdentities {
    var admin: CurrentPlatformAdmin? = null
    var sessionUserId: UUID = USER_ID
    var sessionActive: Boolean = true
    val platformAdminLookups = mutableListOf<UUID>()

    fun reset() {
        admin = null
        sessionUserId = USER_ID
        sessionActive = true
        platformAdminLookups.clear()
    }

    fun admin(role: PlatformAdminRole) {
        sessionUserId = USER_ID
        sessionActive = true
        admin = CurrentPlatformAdmin(USER_ID, EMAIL, role)
    }

    fun inactiveSession() {
        sessionUserId = USER_ID
        sessionActive = false
        admin = null
    }

    fun nonAdmin() {
        sessionUserId = NON_ADMIN_ID
        sessionActive = true
        admin = null
    }

    fun session(rawToken: String): StoredAuthSession? =
        rawToken.takeIf { sessionActive && it == SESSION_TOKEN }?.let {
            StoredAuthSession(
                id = "task4-session",
                userId = sessionUserId.toString(),
                sessionTokenHash = "safe-test-hash",
                createdAt = OffsetDateTime.parse("2026-08-24T00:00:00Z"),
                lastSeenAt = OffsetDateTime.parse("2026-08-24T00:00:00Z"),
                expiresAt = OffsetDateTime.parse("2026-08-25T00:00:00Z"),
                userAgent = "test",
                ipHash = "safe-test-ip-hash",
            )
        }

    fun user(userId: String): CurrentUser? = UUID.fromString(userId).takeIf { it == sessionUserId }?.let { CurrentUser(it, EMAIL) }

    fun platformAdmin(userId: UUID): CurrentPlatformAdmin? {
        platformAdminLookups += userId
        return admin?.takeIf { userId == USER_ID }
    }

    private companion object {
        val USER_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060001")
        val NON_ADMIN_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060006")
        const val EMAIL = "platform-admin-security@example.test"
        const val SESSION_TOKEN = "task4-session-token"
    }
}
