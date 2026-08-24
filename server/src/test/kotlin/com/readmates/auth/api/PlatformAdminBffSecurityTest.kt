package com.readmates.auth.api

import com.readmates.admin.takedown.adapter.`in`.web.PlatformAdminPublicTakedownController
import com.readmates.admin.takedown.adapter.`in`.web.PlatformAdminPublicTakedownErrorHandler
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.port.`in`.ConfirmPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.aigen.adapter.`in`.web.AiGenerationErrorHandler
import com.readmates.aigen.adapter.`in`.web.AiGenerationOpsController
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsAdminCommandPreview
import com.readmates.aigen.application.model.AiOpsAdminCommandReceipt
import com.readmates.aigen.application.model.ConfirmAiOpsAdminCommand
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ConfirmAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.application.port.`in`.PreviewAiOpsAdminCommandUseCase
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
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
import com.readmates.club.adapter.`in`.web.PlatformAdminClubController
import com.readmates.club.adapter.`in`.web.PlatformAdminController
import com.readmates.club.adapter.`in`.web.PlatformAdminErrorHandler
import com.readmates.club.adapter.`in`.web.PlatformAdminSupportWorkbenchController
import com.readmates.club.application.model.AdminSupportGrantLedgerPage
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.model.ConfirmCreateClubDomainCommand
import com.readmates.club.application.model.ConfirmPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubCommandPreview
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminDomainCommandPreview
import com.readmates.club.application.model.PreviewCreateClubDomainCommand
import com.readmates.club.application.model.PreviewPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.RecheckClubDomainCommand
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.model.SupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandReceipt
import com.readmates.club.application.model.SupportGrantCommandType
import com.readmates.club.application.model.SupportGrantReasonCategory
import com.readmates.club.application.model.UpdatePlatformAdminClubCommand
import com.readmates.club.application.port.`in`.AdminSupportWorkbenchUseCase
import com.readmates.club.application.port.`in`.CheckClubDomainProvisioningUseCase
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.CommitPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.ConfirmPlatformAdminClubVisibilityUseCase
import com.readmates.club.application.port.`in`.ConfirmSupportGrantCommandUseCase
import com.readmates.club.application.port.`in`.CreateClubDomainUseCase
import com.readmates.club.application.port.`in`.CreateSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.GetPlatformAdminClubUseCase
import com.readmates.club.application.port.`in`.ListPlatformAdminClubsUseCase
import com.readmates.club.application.port.`in`.PlatformAdminSummaryUseCase
import com.readmates.club.application.port.`in`.PreviewClubDomainUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubOnboardingUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubVisibilityUseCase
import com.readmates.club.application.port.`in`.PreviewSupportGrantCommandUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.`in`.RevokeSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.club.application.port.`in`.UpdatePlatformAdminClubUseCase
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.adapter.`in`.web.SharedApplicationErrorHandler
import com.readmates.shared.cache.RateLimitProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmatesharness.PlatformAdminBffSecurityHarnessApplication
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
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
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.put
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

@SpringBootTest(
    classes = [PlatformAdminBffSecurityHarnessApplication::class],
    properties = [
        "readmates.security.bff.secrets=test-bff-secret",
        "readmates.bff-secret-required=true",
        "readmates.app-base-url=http://localhost:3000",
        "readmates.aigen.enabled=true",
    ],
)
@AutoConfigureMockMvc
class PlatformAdminBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val identities: PlatformAdminSecurityIdentities,
    @param:Autowired private val aiCommandInvocations: PlatformAdminAiCommandInvocations,
    @param:Autowired private val supportCommandInvocations: PlatformAdminSupportCommandInvocations,
) {
    @BeforeEach
    fun resetIdentities() {
        identities.reset()
        aiCommandInvocations.reset()
        supportCommandInvocations.reset()
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

    @ParameterizedTest(name = "{0}")
    @MethodSource("clubCommandRoutes")
    fun `exact club command routes require trusted bff same origin active capable admin`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OPERATOR)
        commandRequest(route).andExpect(status().isOk)

        listOf<String?>(null, "wrong-secret").forEach { secret ->
            commandRequest(route, secret = secret).andExpect(status().isUnauthorized)
        }
        commandRequest(route, origin = "https://attacker.example").andExpect(status().isForbidden)
        commandRequest(route, origin = null, referer = "https://attacker.example/path")
            .andExpect(status().isForbidden)

        identities.inactiveSession()
        commandRequest(route).andExpect(status().isUnauthorized)
        identities.nonAdmin()
        commandRequest(route).andExpect(status().isForbidden)
        identities.admin(PlatformAdminRole.SUPPORT)
        commandRequest(route).andExpect(status().isForbidden)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("clubCommandRoutes")
    fun `club command route method suffix and encoded slash near misses stay protected`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OPERATOR)

        commandRequest(route, method = HttpMethod.PUT).andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}/near-miss").andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}%2Fnear-miss").andExpect(status().isBadRequest)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("aiSafeCommandRoutes")
    fun `exact ai safe command routes require trusted bff same origin active capable admin`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OPERATOR)
        commandRequest(route).andExpect(status().isOk)

        listOf<String?>(null, "wrong-secret").forEach { secret ->
            commandRequest(route, secret = secret).andExpect(status().isUnauthorized)
        }
        commandRequest(route, origin = "https://attacker.example").andExpect(status().isForbidden)
        commandRequest(route, origin = null, referer = "https://attacker.example/path")
            .andExpect(status().isForbidden)

        identities.inactiveSession()
        commandRequest(route).andExpect(status().isUnauthorized)
        identities.nonAdmin()
        commandRequest(route).andExpect(status().isForbidden)
        identities.admin(PlatformAdminRole.SUPPORT)
        commandRequest(route).andExpect(status().isForbidden)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("aiSafeCommandRoutes")
    fun `ai safe command method suffix and encoded slash near misses stay protected`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OWNER)

        commandRequest(route, method = HttpMethod.PUT).andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}/near-miss").andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}%2Fnear-miss").andExpect(status().isBadRequest)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("legacyAiOneClickRoutes")
    fun `legacy ai one click commands return safe confirm required only after the full trust chain`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OWNER)

        commandRequest(route)
            .andExpect(status().isGone)
            .andExpect(jsonPath("$.code").value("SAFE_CONFIRM_REQUIRED"))
        identities.admin(PlatformAdminRole.OPERATOR)
        commandRequest(route)
            .andExpect(status().isGone)
            .andExpect(jsonPath("$.code").value("SAFE_CONFIRM_REQUIRED"))
        identities.admin(PlatformAdminRole.OWNER)

        listOf<String?>(null, "wrong-secret").forEach { secret ->
            commandRequest(route, secret = secret).andExpect(status().isUnauthorized)
        }
        commandRequest(route, origin = "https://attacker.example").andExpect(status().isForbidden)
        commandRequest(route, origin = null, referer = "https://attacker.example/path")
            .andExpect(status().isForbidden)

        identities.inactiveSession()
        commandRequest(route).andExpect(status().isUnauthorized)
        identities.nonAdmin()
        commandRequest(route).andExpect(status().isForbidden)
        identities.admin(PlatformAdminRole.SUPPORT)
        commandRequest(route).andExpect(status().isForbidden)

        assertThat(aiCommandInvocations.total()).isZero()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("legacyAiOneClickRoutes")
    fun `legacy ai method suffix and encoded slash near misses stay protected`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OWNER)

        commandRequest(route, method = HttpMethod.PUT).andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}/near-miss").andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}%2Fnear-miss").andExpect(status().isBadRequest)
        assertThat(aiCommandInvocations.total()).isZero()
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("supportCommandRoutes")
    fun `exact support command routes require trusted bff same origin active owner capability`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OWNER)
        commandRequest(route).andExpect(status().isOk)

        listOf<String?>(null, "wrong-secret").forEach { secret ->
            commandRequest(route, secret = secret).andExpect(status().isUnauthorized)
        }
        commandRequest(route, origin = "https://attacker.example").andExpect(status().isForbidden)
        commandRequest(route, origin = null, referer = "https://attacker.example/path")
            .andExpect(status().isForbidden)

        identities.inactiveSession()
        commandRequest(route).andExpect(status().isUnauthorized)
        identities.nonAdmin()
        commandRequest(route).andExpect(status().isForbidden)
        identities.admin(PlatformAdminRole.OPERATOR)
        commandRequest(route).andExpect(status().isForbidden)
        identities.admin(PlatformAdminRole.SUPPORT)
        commandRequest(route).andExpect(status().isForbidden)
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("supportCommandRoutes")
    fun `support command wrong method suffix and encoded slash near misses stay protected`(route: ClubCommandRoute) {
        identities.admin(PlatformAdminRole.OWNER)

        commandRequest(route, method = HttpMethod.PUT).andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}/near-miss").andExpect(status().isForbidden)
        commandRequest(route, path = "${route.path}%2Fnear-miss").andExpect(status().isBadRequest)
    }

    private fun commandRequest(
        route: ClubCommandRoute,
        method: HttpMethod = route.method,
        path: String = route.path,
        secret: String? = "test-bff-secret",
        origin: String? = "http://localhost:3000",
        referer: String? = null,
    ) = mockMvc.perform(
        request(method, path)
            .contentType(MediaType.APPLICATION_JSON)
            .content(route.body)
            .cookie(Cookie(SESSION_COOKIE, SESSION_TOKEN))
            .apply { secret?.let { header(BffSecretFilter.BFF_SECRET_HEADER, it) } }
            .apply { origin?.let { header("Origin", it) } }
            .apply { referer?.let { header("Referer", it) } },
    )

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

        @JvmStatic
        fun clubCommandRoutes(): List<Arguments> {
            val previewId = "dddddddd-0000-4000-8000-000000060005"
            val domainId = "dddddddd-0000-4000-8000-000000060007"
            return listOf(
                ClubCommandRoute(
                    "metadata patch",
                    HttpMethod.PATCH,
                    "/api/admin/clubs/$CLUB_ID/metadata",
                    """{"expectedAdminRevision":0,"name":"Safe Club"}""",
                ),
                ClubCommandRoute(
                    "visibility preview",
                    HttpMethod.POST,
                    "/api/admin/clubs/$CLUB_ID/visibility/preview",
                    """{"expectedAdminRevision":0,"targetVisibility":"PUBLIC"}""",
                ),
                ClubCommandRoute(
                    "visibility confirm",
                    HttpMethod.POST,
                    "/api/admin/clubs/$CLUB_ID/visibility/confirm",
                    """{"previewId":"$previewId","idempotencyKey":"safe-key",""" +
                        """"expectedAdminRevision":0,"targetVisibility":"PUBLIC","confirmed":true}""",
                ),
                ClubCommandRoute(
                    "domain preview",
                    HttpMethod.POST,
                    "/api/admin/clubs/$CLUB_ID/domains/preview",
                    """{"expectedAdminRevision":0,"hostname":"club.example.test","kind":"SUBDOMAIN"}""",
                ),
                ClubCommandRoute(
                    "domain confirm",
                    HttpMethod.POST,
                    "/api/admin/clubs/$CLUB_ID/domains",
                    """{"previewId":"$previewId","idempotencyKey":"safe-key",""" +
                        """"expectedAdminRevision":0,"hostname":"club.example.test",""" +
                        """"kind":"SUBDOMAIN","confirmed":true}""",
                ),
                ClubCommandRoute(
                    "domain recheck",
                    HttpMethod.POST,
                    "/api/admin/domains/$domainId/check",
                    """{"idempotencyKey":"safe-key","expectedStatus":"ACTION_REQUIRED"}""",
                ),
            ).map(Arguments::of)
        }

        @JvmStatic
        fun aiSafeCommandRoutes(): List<Arguments> {
            val jobId = "dddddddd-0000-4000-8000-000000060009"
            val previewId = "dddddddd-0000-4000-8000-000000060010"
            return listOf(
                ClubCommandRoute(
                    "ai force cancel preview",
                    HttpMethod.POST,
                    "/api/admin/ai-generation/jobs/$jobId/force-cancel/preview",
                    "{}",
                ),
                ClubCommandRoute(
                    "ai force cancel confirm",
                    HttpMethod.POST,
                    "/api/admin/ai-generation/jobs/$jobId/force-cancel/confirm",
                    safeAiConfirmBody(previewId),
                ),
                ClubCommandRoute(
                    "ai retry commit preview",
                    HttpMethod.POST,
                    "/api/admin/ai-generation/jobs/$jobId/retry-commit/preview",
                    "{}",
                ),
                ClubCommandRoute(
                    "ai retry commit confirm",
                    HttpMethod.POST,
                    "/api/admin/ai-generation/jobs/$jobId/retry-commit/confirm",
                    safeAiConfirmBody(previewId),
                ),
            ).map(Arguments::of)
        }

        @JvmStatic
        fun legacyAiOneClickRoutes(): List<Arguments> {
            val jobId = "dddddddd-0000-4000-8000-000000060009"
            return listOf(
                ClubCommandRoute(
                    "legacy ai force cancel",
                    HttpMethod.POST,
                    "/api/admin/ai-generation/jobs/$jobId/force-cancel",
                    "{}",
                ),
                ClubCommandRoute(
                    "legacy ai retry commit",
                    HttpMethod.POST,
                    "/api/admin/ai-generation/jobs/$jobId/retry-commit",
                    "{}",
                ),
            ).map(Arguments::of)
        }

        @JvmStatic
        fun supportCommandRoutes(): List<Arguments> {
            val grantId = "dddddddd-0000-4000-8000-000000060012"
            val previewId = "dddddddd-0000-4000-8000-000000060013"
            val expiry = "2026-08-25T12:00:00Z"
            return listOf(
                ClubCommandRoute(
                    "support body search",
                    HttpMethod.POST,
                    "/api/admin/support/search",
                    """{"query":"masked subject","clubId":"$CLUB_ID"}""",
                ),
                ClubCommandRoute(
                    "support create preview",
                    HttpMethod.POST,
                    "/api/admin/support/grants/preview",
                    supportCreateBody(expiry),
                ),
                ClubCommandRoute(
                    "support create confirm",
                    HttpMethod.POST,
                    "/api/admin/support/grants/confirm",
                    supportCreateConfirmBody(previewId, expiry),
                ),
                ClubCommandRoute(
                    "support revoke preview",
                    HttpMethod.POST,
                    "/api/admin/support/grants/$grantId/revoke/preview",
                    """{"reasonCategory":"SECURITY_REVIEW","note":null}""",
                ),
                ClubCommandRoute(
                    "support revoke confirm",
                    HttpMethod.POST,
                    "/api/admin/support/grants/$grantId/revoke/confirm",
                    supportRevokeConfirmBody(previewId, expiry),
                ),
            ).map(Arguments::of)
        }

        private fun supportCreateBody(expiry: String): String =
            """
            {
              "clubId":"$CLUB_ID",
              "granteeSubjectId":"$USER_ID",
              "scope":"HOST_SUPPORT_READ",
              "expiresAt":"$expiry",
              "reasonCategory":"MEMBER_ASSISTANCE",
              "note":null
            }
            """.trimIndent()

        private fun supportCreateConfirmBody(
            previewId: String,
            expiry: String,
        ): String =
            supportCreateBody(expiry).dropLast(1) +
                ",\"previewId\":\"$previewId\",\"idempotencyKey\":\"support-key-0001\",\"confirmed\":true}"

        private fun supportRevokeConfirmBody(
            previewId: String,
            expiry: String,
        ): String =
            """
            {
              "previewId":"$previewId",
              "idempotencyKey":"support-key-0002",
              "clubId":"$CLUB_ID",
              "scope":"HOST_SUPPORT_READ",
              "expiresAt":"$expiry",
              "reasonCategory":"SECURITY_REVIEW",
              "note":null,
              "confirmed":true
            }
            """.trimIndent()

        private fun safeAiConfirmBody(previewId: String): String =
            """
            {
              "previewId":"$previewId",
              "idempotencyKey":"safe-key",
              "expectedJobRevision":7,
              "confirmed":true
            }
            """.trimIndent()
    }
}

data class ClubCommandRoute(
    val label: String,
    val method: HttpMethod,
    val path: String,
    val body: String,
) {
    override fun toString(): String = label
}

class PlatformAdminAiCommandInvocations {
    var forceCancel: Int = 0
    var retryCommit: Int = 0
    var preview: Int = 0
    var confirm: Int = 0

    fun reset() {
        forceCancel = 0
        retryCommit = 0
        preview = 0
        confirm = 0
    }

    fun total(): Int = forceCancel + retryCommit + preview + confirm
}

class PlatformAdminSupportCommandInvocations {
    var calls: Int = 0

    fun reset() {
        calls = 0
    }
}

@TestConfiguration(proxyBeanMethods = false)
@EnableAutoConfiguration(exclude = [DataSourceAutoConfiguration::class, FlywayAutoConfiguration::class])
@Import(
    SecurityConfig::class,
    CurrentMemberWebConfig::class,
    PlatformAdminPublicTakedownController::class,
    PlatformAdminPublicTakedownErrorHandler::class,
    PlatformAdminController::class,
    PlatformAdminClubController::class,
    PlatformAdminSupportWorkbenchController::class,
    AiGenerationOpsController::class,
    AiGenerationErrorHandler::class,
    PlatformAdminErrorHandler::class,
    SharedApplicationErrorHandler::class,
)
class PlatformAdminBffSecurityHarnessConfiguration {
    @Bean
    fun aiCommandInvocations() = PlatformAdminAiCommandInvocations()

    @Bean
    fun supportCommandInvocations() = PlatformAdminSupportCommandInvocations()

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
    fun adminSupportWorkbench(invocations: PlatformAdminSupportCommandInvocations): AdminSupportWorkbenchUseCase =
        object : AdminSupportWorkbenchUseCase {
            override fun search(
                admin: CurrentPlatformAdmin,
                query: String,
                clubId: UUID?,
            ) = requireSupportOwner(admin) {
                invocations.calls += 1
                emptyList<AdminSupportSearchResult>()
            }

            override fun listGrantLedger(
                admin: CurrentPlatformAdmin,
                clubId: UUID?,
                status: String?,
                cursor: String?,
            ) = requireSupportOwner(admin) { AdminSupportGrantLedgerPage(emptyList(), null) }
        }

    @Bean
    fun legacyCreateSupportGrant(): CreateSupportAccessGrantUseCase = mock(CreateSupportAccessGrantUseCase::class.java)

    @Bean
    fun legacyRevokeSupportGrant(): RevokeSupportAccessGrantUseCase = mock(RevokeSupportAccessGrantUseCase::class.java)

    @Bean
    fun previewSupportCommand(invocations: PlatformAdminSupportCommandInvocations): PreviewSupportGrantCommandUseCase =
        object : PreviewSupportGrantCommandUseCase {
            override fun previewCreate(
                admin: PlatformActor,
                command: PreviewSupportGrantCreateCommand,
            ) = admin.withCapability(PlatformCapability.MANAGE_SUPPORT_ACCESS) {
                invocations.calls += 1
                supportPreview(SupportGrantCommandType.CREATE, null, command.clubId, command.expiresAt)
            }

            override fun previewRevoke(
                admin: PlatformActor,
                grantId: UUID,
                command: PreviewSupportGrantRevokeCommand,
            ) = admin.withCapability(PlatformCapability.MANAGE_SUPPORT_ACCESS) {
                invocations.calls += 1
                supportPreview(SupportGrantCommandType.REVOKE, grantId, SECURITY_CLUB_ID, SUPPORT_EXPIRY)
            }
        }

    @Bean
    fun confirmSupportCommand(invocations: PlatformAdminSupportCommandInvocations): ConfirmSupportGrantCommandUseCase =
        object : ConfirmSupportGrantCommandUseCase {
            override fun confirmCreate(
                admin: PlatformActor,
                command: ConfirmSupportGrantCreateCommand,
            ) = admin.withCapability(PlatformCapability.MANAGE_SUPPORT_ACCESS) {
                invocations.calls += 1
                supportReceipt(SupportGrantCommandType.CREATE, command.previewId, SUPPORT_GRANT_ID, command.clubId, command.expiresAt)
            }

            override fun confirmRevoke(
                admin: PlatformActor,
                grantId: UUID,
                command: ConfirmSupportGrantRevokeCommand,
            ) = admin.withCapability(PlatformCapability.MANAGE_SUPPORT_ACCESS) {
                invocations.calls += 1
                supportReceipt(SupportGrantCommandType.REVOKE, command.previewId, grantId, command.clubId, command.expiresAt)
            }
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
    fun platformAdminAuthoritiesFilter(currentMembers: ResolveCurrentMemberUseCase): PlatformAdminAuthoritiesFilter {
        val filter = PlatformAdminAuthoritiesFilter(currentMembers)
        return filter
    }

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
    fun aiOpsSummary(): GetAiOpsSummaryUseCase = mock(GetAiOpsSummaryUseCase::class.java)

    @Bean
    fun aiOpsJobs(): ListAiOpsJobsUseCase = mock(ListAiOpsJobsUseCase::class.java)

    @Bean
    fun aiOpsJob(): GetAiOpsJobUseCase = mock(GetAiOpsJobUseCase::class.java)

    @Bean
    fun forceCancelAiOpsJob(invocations: PlatformAdminAiCommandInvocations): ForceCancelAiOpsJobUseCase =
        object : ForceCancelAiOpsJobUseCase {
            override fun forceCancel(
                admin: CurrentPlatformAdmin,
                jobId: UUID,
            ): com.readmates.aigen.application.model.AiOpsAdminActionResult {
                invocations.forceCancel += 1
                error("legacy force cancel invoked")
            }
        }

    @Bean
    fun retryAiOpsJobCommit(invocations: PlatformAdminAiCommandInvocations): RetryAiOpsJobCommitUseCase =
        object : RetryAiOpsJobCommitUseCase {
            override fun retryCommit(
                admin: CurrentPlatformAdmin,
                jobId: UUID,
            ): com.readmates.aigen.application.model.AiOpsAdminActionResult {
                invocations.retryCommit += 1
                error("legacy retry commit invoked")
            }
        }

    @Bean
    fun previewAiOpsAdminCommand(invocations: PlatformAdminAiCommandInvocations): PreviewAiOpsAdminCommandUseCase =
        object : PreviewAiOpsAdminCommandUseCase {
            override fun previewAdminCommand(
                admin: PlatformActor,
                jobId: UUID,
                action: AiOpsAction,
            ): AiOpsAdminCommandPreview =
                admin.withCapability(PlatformCapability.MANAGE_AI_OPERATIONS) {
                    invocations.preview += 1
                    AiOpsAdminCommandPreview(
                        previewId = UUID.fromString("dddddddd-0000-4000-8000-000000060010"),
                        jobId = jobId,
                        action = action,
                        jobStatus =
                            if (action == AiOpsAction.FORCE_CANCEL) {
                                JobStatus.RUNNING
                            } else {
                                JobStatus.COMMIT_RETRY
                            },
                        jobRevision = 7,
                        effectType = if (action == AiOpsAction.FORCE_CANCEL) "AI_JOB_CANCEL" else "AI_COMMIT_RETRY",
                        impactCodes = listOf("SAFE_EFFECT"),
                        expiresAt = Instant.parse("2026-08-24T02:00:00Z"),
                        fingerprintPrefix = "00112233",
                    )
                }
        }

    @Bean
    fun confirmAiOpsAdminCommand(invocations: PlatformAdminAiCommandInvocations): ConfirmAiOpsAdminCommandUseCase =
        object : ConfirmAiOpsAdminCommandUseCase {
            override fun confirmAdminCommand(
                admin: PlatformActor,
                jobId: UUID,
                action: AiOpsAction,
                command: ConfirmAiOpsAdminCommand,
            ): AiOpsAdminCommandReceipt =
                admin.withCapability(PlatformCapability.MANAGE_AI_OPERATIONS) {
                    invocations.confirm += 1
                    val status = if (action == AiOpsAction.FORCE_CANCEL) JobStatus.RUNNING else JobStatus.COMMIT_RETRY
                    AiOpsAdminCommandReceipt(
                        receiptId = UUID.fromString("dddddddd-0000-4000-8000-000000060011"),
                        previewId = command.previewId,
                        jobId = jobId,
                        action = action,
                        beforeJobStatus = status,
                        beforeJobRevision = command.expectedJobRevision,
                        afterJobStatus = status,
                        afterJobRevision = command.expectedJobRevision,
                        originStatus = "ACCEPTED",
                        effectStatus = "PENDING",
                        safeErrorCode = null,
                    )
                }
        }

    @Bean
    fun platformAdminSummary(): PlatformAdminSummaryUseCase = mock(PlatformAdminSummaryUseCase::class.java)

    @Bean
    fun listPlatformAdminClubs(): ListPlatformAdminClubsUseCase = mock(ListPlatformAdminClubsUseCase::class.java)

    @Bean
    fun getPlatformAdminClub(): GetPlatformAdminClubUseCase = mock(GetPlatformAdminClubUseCase::class.java)

    @Bean
    fun previewPlatformAdminOnboarding(): PreviewPlatformAdminClubOnboardingUseCase =
        mock(PreviewPlatformAdminClubOnboardingUseCase::class.java)

    @Bean
    fun commitPlatformAdminOnboarding(): CommitPlatformAdminClubOnboardingUseCase =
        mock(CommitPlatformAdminClubOnboardingUseCase::class.java)

    @Bean
    fun updatePlatformAdminClub(): UpdatePlatformAdminClubUseCase =
        object : UpdatePlatformAdminClubUseCase {
            override fun updateClub(
                admin: PlatformActor,
                clubId: UUID,
                command: UpdatePlatformAdminClubCommand,
            ): PlatformAdminClubDetail {
                admin.requireCapability(PlatformCapability.MANAGE_CLUBS)
                return securityClubDetail(clubId, command.expectedAdminRevision + 1)
            }
        }

    @Bean
    fun previewPlatformAdminClubVisibility(): PreviewPlatformAdminClubVisibilityUseCase =
        object : PreviewPlatformAdminClubVisibilityUseCase {
            override fun previewVisibility(
                admin: PlatformActor,
                clubId: UUID,
                command: PreviewPlatformAdminClubVisibilityCommand,
            ): PlatformAdminClubCommandPreview =
                admin.withCapability(PlatformCapability.MANAGE_CLUBS) {
                    PlatformAdminClubCommandPreview(
                        SECURITY_PREVIEW_ID,
                        Instant.parse("2026-08-24T01:00:00Z"),
                        ClubPublicVisibility.PRIVATE,
                        command.targetVisibility,
                        listOf("ENABLE_PUBLIC_ACCESS"),
                        "a1b2c3d4",
                    )
                }
        }

    @Bean
    fun confirmPlatformAdminClubVisibility(): ConfirmPlatformAdminClubVisibilityUseCase =
        object : ConfirmPlatformAdminClubVisibilityUseCase {
            override fun confirmVisibility(
                admin: PlatformActor,
                clubId: UUID,
                command: ConfirmPlatformAdminClubVisibilityCommand,
            ): PlatformAdminClubCommandReceipt =
                admin.withCapability(PlatformCapability.MANAGE_CLUBS) {
                    securityReceipt("club.visibility.change", clubId, null)
                }
        }

    @Bean
    fun previewClubDomain(): PreviewClubDomainUseCase =
        object : PreviewClubDomainUseCase {
            override fun previewClubDomain(
                admin: PlatformActor,
                clubId: UUID,
                command: PreviewCreateClubDomainCommand,
            ): PlatformAdminDomainCommandPreview =
                admin.withCapability(PlatformCapability.MANAGE_CLUB_DOMAINS) {
                    PlatformAdminDomainCommandPreview(
                        SECURITY_PREVIEW_ID,
                        Instant.parse("2026-08-24T01:00:00Z"),
                        command.kind,
                        false,
                        listOf("CREATE_DOMAIN"),
                        "a1b2c3d4",
                    )
                }
        }

    @Bean
    fun createClubDomain(): CreateClubDomainUseCase =
        object : CreateClubDomainUseCase {
            override fun createClubDomain(
                admin: PlatformActor,
                clubId: UUID,
                command: ConfirmCreateClubDomainCommand,
            ): PlatformAdminClubCommandReceipt =
                admin.withCapability(PlatformCapability.MANAGE_CLUB_DOMAINS) {
                    securityReceipt("club.domain.create", clubId, SECURITY_DOMAIN_ID)
                }
        }

    @Bean
    fun checkClubDomain(): CheckClubDomainProvisioningUseCase =
        object : CheckClubDomainProvisioningUseCase {
            override fun checkClubDomainProvisioning(
                admin: PlatformActor,
                domainId: UUID,
                command: RecheckClubDomainCommand,
            ): PlatformAdminClubCommandReceipt =
                admin.withCapability(PlatformCapability.MANAGE_CLUB_DOMAINS) {
                    securityReceipt("club.domain.recheck", SECURITY_CLUB_ID, domainId)
                }
        }

    @Bean
    fun oauthFlowContextRepository(): OAuthFlowContextRepository = mock(OAuthFlowContextRepository::class.java)

    @Bean
    fun googleOidcUserService() = GoogleOidcUserService()

    @Bean
    fun readmatesOAuthSuccessHandler(): ReadmatesOAuthSuccessHandler = mock(ReadmatesOAuthSuccessHandler::class.java)

    private companion object {
        val SECURITY_CLUB_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060002")
        val SECURITY_PREVIEW_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060005")
        val SECURITY_DOMAIN_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060007")
        val SUPPORT_GRANT_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060012")
        val SUPPORT_PREVIEW_ID: UUID = UUID.fromString("dddddddd-0000-4000-8000-000000060013")
        val SUPPORT_EXPIRY: OffsetDateTime = OffsetDateTime.parse("2026-08-25T12:00:00Z")

        inline fun <T> requireSupportOwner(
            admin: CurrentPlatformAdmin,
            block: () -> T,
        ): T {
            if (!admin.canManageSupportAccess) {
                throw AccessDeniedException("Platform admin role cannot manage support access")
            }
            return block()
        }

        fun supportPreview(
            commandType: SupportGrantCommandType,
            grantId: UUID?,
            clubId: UUID,
            grantExpiresAt: OffsetDateTime,
        ) = SupportGrantCommandPreview(
            previewId = SUPPORT_PREVIEW_ID,
            commandType = commandType,
            grantId = grantId,
            clubId = clubId,
            scope = com.readmates.club.domain.SupportAccessGrantScope.HOST_SUPPORT_READ,
            grantExpiresAt = grantExpiresAt,
            reasonCategory = SupportGrantReasonCategory.MEMBER_ASSISTANCE,
            notePresent = false,
            impactCodes = listOf("SAFE_SUPPORT_EFFECT"),
            expiresAt = Instant.parse("2026-08-25T01:00:00Z"),
            fingerprintPrefix = "00112233",
        )

        fun supportReceipt(
            commandType: SupportGrantCommandType,
            previewId: UUID,
            grantId: UUID,
            clubId: UUID,
            grantExpiresAt: OffsetDateTime,
        ) = SupportGrantCommandReceipt(
            receiptId = UUID.fromString("dddddddd-0000-4000-8000-000000060014"),
            previewId = previewId,
            commandType = commandType,
            grantId = grantId,
            clubId = clubId,
            scope = com.readmates.club.domain.SupportAccessGrantScope.HOST_SUPPORT_READ,
            grantExpiresAt = grantExpiresAt,
            reasonCategory = SupportGrantReasonCategory.MEMBER_ASSISTANCE,
            notePresent = false,
            beforeStatus = if (commandType == SupportGrantCommandType.CREATE) "ABSENT" else "ACTIVE",
            afterStatus = if (commandType == SupportGrantCommandType.CREATE) "ACTIVE" else "REVOKED",
            outcome = "SUCCEEDED",
            createdAt = Instant.parse("2026-08-25T00:00:00Z"),
        )

        fun securityClubDetail(
            clubId: UUID,
            revision: Long,
        ) = PlatformAdminClubDetail(
            clubId = clubId,
            slug = "safe-club",
            name = "Safe Club",
            tagline = "Safe tagline",
            about = "Safe public description",
            adminRevision = revision,
            status = ClubStatus.ACTIVE,
            publicVisibility = ClubPublicVisibility.PRIVATE,
            domains = emptyList(),
            firstHostOnboardingState = FirstHostOnboardingState.ASSIGNED,
            domainCount = 0,
            domainActionRequiredCount = 0,
            notificationFailureCount = 0,
            aiFailureCount = 0,
        )

        fun securityReceipt(
            commandType: String,
            clubId: UUID,
            targetId: UUID?,
        ) = PlatformAdminClubCommandReceipt(
            receiptId = UUID.fromString("dddddddd-0000-4000-8000-000000060008"),
            commandType = commandType,
            clubId = clubId,
            beforeAdminRevision = 0,
            afterAdminRevision = 1,
            outcome = "SUCCEEDED",
            resultCode = "SECURITY_CHAIN_ACCEPTED",
            targetId = targetId,
        )

        fun PlatformActor.requireCapability(capability: PlatformCapability) {
            if (!can(capability)) {
                throw AccessDeniedException("Platform admin role cannot execute this club command")
            }
        }

        inline fun <T> PlatformActor.withCapability(
            capability: PlatformCapability,
            block: () -> T,
        ): T {
            requireCapability(capability)
            return block()
        }
    }
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

    fun user(userId: String): CurrentUser? =
        UUID
            .fromString(userId)
            .takeIf { it == sessionUserId }
            ?.let { CurrentUser(it, EMAIL) }

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
