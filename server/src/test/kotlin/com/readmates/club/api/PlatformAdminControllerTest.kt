package com.readmates.club.api

import com.jayway.jsonpath.JsonPath
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.model.NormalizedClubDomainHostname
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class)
@Tag("integration")
class PlatformAdminControllerTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired authSessionService: AuthSessionService,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired domainActualStateChecker: FakeClubDomainActualStateChecker,
) : PlatformAdminControllerDbSupport(mockMvc, authSessionService, jdbcTemplate, domainActualStateChecker) {
    @Test
    fun `host without platform admin cannot access admin API`() {
        mockMvc
            .get("/api/admin/summary") {
                cookie(sessionCookieForUser("00000000-0000-0000-0000-000000000101"))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `active owner can access admin summary`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")

        // Seed guarantees at least the two ACTIVE clubs (reading-sai + sample-book-club).
        // Use ≥ rather than == so the test is robust to other integration tests that
        // share the MySQL container and may have left ACTIVE clubs behind.
        mockMvc
            .get("/api/admin/summary") {
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isOk() }
                jsonPath("$.platformRole") { value("OWNER") }
                jsonPath("$.activeClubCount") { value(Matchers.greaterThanOrEqualTo(2)) }
                jsonPath("$.domainActionRequiredCount") { value(Matchers.greaterThanOrEqualTo(0)) }
            }
    }

    @Test
    fun `disabled owner cannot access admin API`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "DISABLED")

        mockMvc
            .get("/api/admin/summary") {
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `operator can create action required subdomain row`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val hostname = "task14-${UUID.randomUUID()}.example.test"

        val result = createDomain(operator, clubId, hostname, 0)
        val domainId = checkNotNull(result.response.jsonPathValue<String>("$.targetId"))
        createdClubDomainIds += domainId
        assertThat(result.response.jsonPathValue<String>("$.commandType")).isEqualTo("club.domain.create")
        assertThat(result.response.jsonPathValue<String>("$.convergenceState")).isIn("PENDING", "FAILED")
    }

    @Test
    fun `created domain hostnames are normalized to lowercase`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val token = UUID.randomUUID().toString().replace("-", "")
        val expectedHostname = "task14-$token.example.test"

        val result = createDomain(owner, clubId, "Task14-$token.Example.Test.", 0)
        val domainId = checkNotNull(result.response.jsonPathValue<String>("$.targetId"))
        createdClubDomainIds += domainId
        assertThat(
            jdbcTemplate.queryForObject("select hostname from club_domains where id = ?", String::class.java, domainId),
        ).isEqualTo(expectedHostname)
    }

    @Test
    fun `cannot create platform fallback hostname as club domain`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val clubId = createDomainTestClub()

        mockMvc
            .post("/api/admin/clubs/$clubId/domains/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedAdminRevision":0,"hostname":"readmates.pages.dev","kind":"SUBDOMAIN"}"""
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `pending club domain cannot be created as primary`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val hostname = "primary-${UUID.randomUUID()}.example.test"

        mockMvc
            .post("/api/admin/clubs/$clubId/domains/preview") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"expectedAdminRevision":0,"hostname":"$hostname","kind":"SUBDOMAIN","isPrimary":true}"""
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `cannot create duplicate club domain hostname`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val hostname = "duplicate-${UUID.randomUUID()}.example.test"

        val result = createDomain(owner, clubId, hostname, 0)
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.targetId"))
        createDomain(owner, clubId, hostname, 1, expectedStatus = 409)
    }

    @Test
    fun `summary lists action required domains for admin UI`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "summary-${UUID.randomUUID()}.example.test"
        val domainId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            values (?, ?, ?, 'SUBDOMAIN', 'ACTION_REQUIRED', false)
            """.trimIndent(),
            domainId,
            READING_SAI_CLUB_ID,
            hostname,
        )
        createdClubDomainIds += domainId

        mockMvc
            .get("/api/admin/summary") {
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isOk() }
                jsonPath("$.domainActionRequiredCount") { value(Matchers.greaterThanOrEqualTo(1)) }
                jsonPath("$.domainsRequiringAction[?(@.hostname == '$hostname')]") { isNotEmpty() }
            }
    }

    @Test
    fun `summary lists failed and provisioning domain statuses for admin UI`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val actionRequiredId = UUID.randomUUID().toString()
        val failedId = UUID.randomUUID().toString()
        val provisioningId = UUID.randomUUID().toString()
        val actionRequiredHostname = "action-${UUID.randomUUID()}.example.test"
        val failedHostname = "failed-${UUID.randomUUID()}.example.test"
        val provisioningHostname = "provisioning-${UUID.randomUUID()}.example.test"
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary, provisioning_error_code, updated_at)
            values
              (?, ?, ?, 'SUBDOMAIN', 'ACTION_REQUIRED', false, null, timestampadd(second, 3, utc_timestamp(6))),
              (?, ?, ?, 'SUBDOMAIN', 'FAILED', false, 'DNS_NOT_CONNECTED', timestampadd(second, 2, utc_timestamp(6))),
              (?, ?, ?, 'SUBDOMAIN', 'PROVISIONING', false, null, timestampadd(second, 1, utc_timestamp(6)))
            """.trimIndent(),
            actionRequiredId,
            READING_SAI_CLUB_ID,
            actionRequiredHostname,
            failedId,
            READING_SAI_CLUB_ID,
            failedHostname,
            provisioningId,
            READING_SAI_CLUB_ID,
            provisioningHostname,
        )
        createdClubDomainIds += actionRequiredId
        createdClubDomainIds += failedId
        createdClubDomainIds += provisioningId

        mockMvc
            .get("/api/admin/summary") {
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isOk() }
                jsonPath("$.domainActionRequiredCount") { value(1) }
                jsonPath("$.domainsRequiringAction[0].hostname") { value(actionRequiredHostname) }
                jsonPath("$.domainsRequiringAction[0].status") { value("ACTION_REQUIRED") }
                jsonPath("$.domainsRequiringAction[0].manualAction") { value("CLOUDFLARE_PAGES_CUSTOM_DOMAIN") }
                jsonPath("$.domains[0].hostname") { value(actionRequiredHostname) }
                jsonPath("$.domains[0].status") { value("ACTION_REQUIRED") }
                jsonPath("$.domains[1].hostname") { value(failedHostname) }
                jsonPath("$.domains[1].status") { value("FAILED") }
                jsonPath("$.domains[1].errorCode") { value("DNS_NOT_CONNECTED") }
                jsonPath("$.domains[2].hostname") { value(provisioningHostname) }
                jsonPath("$.domains[2].status") { value("PROVISIONING") }
            }
    }

    @Test
    fun `support platform admin cannot create club domain`() {
        val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val hostname = "support-${UUID.randomUUID()}.example.test"

        mockMvc
            .post("/api/admin/clubs/$clubId/domains/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedAdminRevision":0,"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                cookie(sessionCookieForUser(support))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `operator can list platform admin clubs`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")

        mockMvc
            .get("/api/admin/clubs") {
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].clubId") { exists() }
                jsonPath("$.items[0].slug") { exists() }
                jsonPath("$.items[0].publicVisibility") { exists() }
                jsonPath("$.items[0].firstHostOnboardingState") { exists() }
            }
    }

    @Test
    fun `operator can make setup club public when active host exists`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val clubId = createSetupClubWithActiveHost()
        val preview =
            mockMvc
                .post("/api/admin/clubs/$clubId/visibility/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedAdminRevision":0,"targetVisibility":"PUBLIC"}"""
                    cookie(sessionCookieForUser(operator))
                }.andExpect { status { isOk() } }
                .andReturn()
        val previewId = checkNotNull(preview.response.jsonPathValue<String>("$.previewId"))

        mockMvc
            .post("/api/admin/clubs/$clubId/visibility/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId":"$previewId",
                      "idempotencyKey":"visibility-${UUID.randomUUID()}",
                      "expectedAdminRevision":0,
                      "targetVisibility":"PUBLIC",
                      "confirmed":true
                    }
                    """.trimIndent()
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.clubId") { value(clubId) }
                jsonPath("$.commandType") { value("club.visibility.change") }
            }
        assertThat(
            jdbcTemplate.queryForObject("select public_visibility from clubs where id = ?", String::class.java, clubId),
        ).isEqualTo("PUBLIC")
    }

    @Test
    fun `support admin cannot make a club public`() {
        val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")
        val clubId = createSetupClubWithActiveHost()

        mockMvc
            .post("/api/admin/clubs/$clubId/visibility/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedAdminRevision":0,"targetVisibility":"PUBLIC"}"""
                cookie(sessionCookieForUser(support))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `preview reports existing first host user and required confirmation`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostUserId = createGoogleUser("existing.host.${UUID.randomUUID()}@example.com", "Existing Host")

        mockMvc
            .post("/api/admin/clubs/onboarding/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = onboardingRequestJson(hostEmail = emailForUser(hostUserId))
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.firstHostKind") { value("EXISTING_USER") }
                jsonPath("$.requiredConfirmation") { value("ASSIGN_EXISTING_USER_AS_HOST") }
                jsonPath("$.firstHost.email") { doesNotExist() }
                jsonPath("$.existingUserId") { doesNotExist() }
            }
    }

    @Test
    fun `operator creates private setup club and assigns existing user as host after confirmation`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostUserId = createGoogleUser("assign.host.${UUID.randomUUID()}@example.com", "Assign Host")
        val hostEmail = emailForUser(hostUserId)
        val slug = "club-${UUID.randomUUID().toString().take(8)}"
        val preview =
            mockMvc
                .post("/api/admin/clubs/onboarding/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = onboardingRequestJson(hostEmail = hostEmail, slug = slug)
                    cookie(sessionCookieForUser(operator))
                }.andExpect { status { isOk() } }
                .andReturn()
        val previewId = checkNotNull(preview.response.jsonPathValue<String>("$.previewId"))

        val result =
            mockMvc
                .post("/api/admin/clubs/onboarding") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        onboardingRequestJson(
                            hostEmail = hostEmail,
                            slug = slug,
                            existingUserConfirmation = "ASSIGN_EXISTING_USER_AS_HOST",
                            previewId = previewId,
                            idempotencyKey = "onboarding-${UUID.randomUUID()}",
                        )
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.club.publicVisibility") { value("PRIVATE") }
                    jsonPath("$.club.status") { value("SETUP_REQUIRED") }
                    jsonPath("$.originStatus") { value("SUCCEEDED") }
                    jsonPath("$.firstHostKind") { value("EXISTING_USER_ASSIGNED") }
                    jsonPath("$.invitationDelivery") { value("NOT_REQUIRED") }
                }.andReturn()
        val clubId = checkNotNull(result.response.jsonPathValue<String>("$.club.clubId"))
        createdClubIds += clubId
        createdMembershipIds += membershipIdsForClub(clubId)
        assertNotNull(BookClubAvatarKey.fromWireValue(avatarKeyForClub(clubId)))
    }

    @Test
    fun `operator creates durable host invitation without returning a capability`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostEmail = "new.host.${UUID.randomUUID()}@example.com"
        val slug = "club-${UUID.randomUUID().toString().take(8)}"
        val preview =
            mockMvc
                .post("/api/admin/clubs/onboarding/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = onboardingRequestJson(hostEmail = hostEmail, slug = slug)
                    cookie(sessionCookieForUser(operator))
                }.andExpect { status { isOk() } }
                .andReturn()
        val previewId = checkNotNull(preview.response.jsonPathValue<String>("$.previewId"))

        val result =
            mockMvc
                .post("/api/admin/clubs/onboarding") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        onboardingRequestJson(
                            hostEmail = hostEmail,
                            slug = slug,
                            previewId = previewId,
                            idempotencyKey = "onboarding-${UUID.randomUUID()}",
                        )
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.firstHostKind") { value("INVITATION_CREATED") }
                    jsonPath("$.invitationDelivery") { value("PENDING") }
                    jsonPath("$.acceptUrl") { doesNotExist() }
                    jsonPath("$.email") { doesNotExist() }
                    jsonPath("$.token") { doesNotExist() }
                }.andReturn()
        val clubId = checkNotNull(result.response.jsonPathValue<String>("$.club.clubId"))
        createdClubIds += clubId
        createdInvitationIds +=
            jdbcTemplate
                .queryForList("select id from invitations where club_id = ?", String::class.java, clubId)
                .filterNotNull()
    }
}

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class)
@Tag("integration")
class PlatformAdminDomainControllerTest(
    @param:Autowired mockMvc: MockMvc,
    @param:Autowired authSessionService: AuthSessionService,
    @param:Autowired jdbcTemplate: JdbcTemplate,
    @param:Autowired domainActualStateChecker: FakeClubDomainActualStateChecker,
) : PlatformAdminControllerDbSupport(mockMvc, authSessionService, jdbcTemplate, domainActualStateChecker) {
    @Test
    fun `operator can check custom domain provisioning and activate verified domain`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val hostname = "verified-${UUID.randomUUID()}.example.test"
        val domainId = insertDomain(clubId, hostname)
        domainActualStateChecker.nextResult =
            ClubDomainActualCheckResult(
                status = ClubDomainStatus.ACTIVE,
                errorCode = null,
            )

        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"idempotencyKey":"recheck-${UUID.randomUUID()}","expectedStatus":"ACTION_REQUIRED"}"""
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.targetId") { value(domainId) }
                jsonPath("$.convergenceState") { value("SUCCEEDED") }
            }
        assertThat(
            jdbcTemplate.queryForObject("select status from club_domains where id = ?", String::class.java, domainId),
        ).isEqualTo("ACTIVE")
    }

    @Test
    fun `operator can check custom domain provisioning and store failure code`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val clubId = createDomainTestClub()
        val hostname = "failed-check-${UUID.randomUUID()}.example.test"
        val domainId = insertDomain(clubId, hostname)
        domainActualStateChecker.nextResult =
            ClubDomainActualCheckResult(
                status = ClubDomainStatus.FAILED,
                errorCode = "DOMAIN_CHECK_MARKER_MISMATCH",
            )

        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """{"idempotencyKey":"recheck-${UUID.randomUUID()}","expectedStatus":"ACTION_REQUIRED"}"""
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.targetId") { value(domainId) }
                jsonPath("$.convergenceState") { value("PENDING") }
            }
        val stored =
            jdbcTemplate.queryForMap(
                "select status, provisioning_error_code from club_domains where id = ?",
                domainId,
            )
        assertThat(stored["status"]).isEqualTo("FAILED")
        assertThat(stored["provisioning_error_code"]).isEqualTo("DOMAIN_CHECK_MARKER_MISMATCH")
    }

    @Test
    fun `support platform admin cannot check custom domain provisioning`() {
        val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        mockMvc
            .post("/api/admin/domains/${UUID.randomUUID()}/check") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"idempotencyKey":"support-${UUID.randomUUID()}","expectedStatus":"ACTION_REQUIRED"}"""
                cookie(sessionCookieForUser(support))
            }.andExpect {
                status { isForbidden() }
            }
    }
}

abstract class PlatformAdminControllerDbSupport(
    protected val mockMvc: MockMvc,
    private val authSessionService: AuthSessionService,
    protected val jdbcTemplate: JdbcTemplate,
    protected val domainActualStateChecker: FakeClubDomainActualStateChecker,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    protected val createdClubDomainIds = linkedSetOf<String>()
    protected val createdMembershipIds = linkedSetOf<String>()
    protected val createdClubIds = linkedSetOf<String>()
    protected val createdInvitationIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            jdbcTemplate.update("delete from platform_admin_club_command_convergence_events where event_seq = 1")
            jdbcTemplate.update("delete from platform_admin_club_command_convergence_events where event_seq = 0")
            jdbcTemplate.update("delete from platform_admin_club_command_convergence")
            jdbcTemplate.update("delete from platform_admin_command_idempotency_keys")
            jdbcTemplate.update("delete from platform_admin_command_idempotency")
            jdbcTemplate.update("delete from platform_admin_club_command_previews")
            jdbcTemplate.update("delete from platform_admin_club_command_receipts")
            jdbcTemplate.update("delete from platform_audit_events where event_type like 'ADMIN_CLUB_%'")
            deleteWhereIn("invitations", "id", createdInvitationIds)
            deleteWhereIn("club_domains", "id", createdClubDomainIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("club_audit_events", "club_id", createdClubIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("platform_admins", "user_id", createdPlatformAdminUserIds)
            deleteWhereIn("users", "id", createdUserIds)
            deleteWhereIn("clubs", "id", createdClubIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdPlatformAdminUserIds.clear()
            createdUserIds.clear()
            createdClubDomainIds.clear()
            createdMembershipIds.clear()
            createdClubIds.clear()
            createdInvitationIds.clear()
            SecurityContextHolder.clearContext()
            domainActualStateChecker.reset()
        }
    }

    protected fun createPlatformAdminUser(
        role: String,
        status: String,
    ): String {
        val userId = UUID.randomUUID().toString()
        val email = "platform.${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Platform Admin', 'Admin', 'GOOGLE')
            """.trimIndent(),
            userId,
            email,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into platform_admins (user_id, role, status)
            values (?, ?, ?)
            """.trimIndent(),
            userId,
            role,
            status,
        )
        createdPlatformAdminUserIds += userId
        return userId
    }

    protected fun createSetupClubWithActiveHost(): String {
        val clubId = UUID.randomUUID().toString()
        val hostUserId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val slug = "setup-${UUID.randomUUID().toString().take(8)}"

        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, 'Setup Club', 'Setup tagline', 'Setup about', 'SETUP_REQUIRED', 'PRIVATE')
            """.trimIndent(),
            clubId,
            slug,
        )
        createdClubIds += clubId
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Setup Host', 'Host', 'GOOGLE')
            """.trimIndent(),
            hostUserId,
            "setup.host.${UUID.randomUUID()}@example.com",
        )
        createdUserIds += hostUserId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Host', 'mushroom-green-book')
            """.trimIndent(),
            membershipId,
            clubId,
            hostUserId,
        )
        createdMembershipIds += membershipId
        return clubId
    }

    protected fun createDomainTestClub(): String {
        val clubId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility, admin_revision)
            values (?, ?, 'Domain Club', 'Safe tagline', 'Safe public description', 'ACTIVE', 'PRIVATE', 0)
            """.trimIndent(),
            clubId,
            "domain-${UUID.randomUUID().toString().take(8)}",
        )
        createdClubIds += clubId
        return clubId
    }

    protected fun insertDomain(
        clubId: String,
        hostname: String,
    ): String {
        val domainId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            values (?, ?, ?, 'SUBDOMAIN', 'ACTION_REQUIRED', false)
            """.trimIndent(),
            domainId,
            clubId,
            hostname,
        )
        createdClubDomainIds += domainId
        return domainId
    }

    protected fun createDomain(
        adminUserId: String,
        clubId: String,
        hostname: String,
        expectedRevision: Long,
        expectedStatus: Int = 200,
    ): org.springframework.test.web.servlet.MvcResult {
        val preview =
            mockMvc
                .post("/api/admin/clubs/$clubId/domains/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "expectedAdminRevision":$expectedRevision,
                          "hostname":"$hostname",
                          "kind":"SUBDOMAIN",
                          "isPrimary":false
                        }
                        """.trimIndent()
                    cookie(sessionCookieForUser(adminUserId))
                }.andExpect { status { isOk() } }
                .andReturn()
        val previewId = checkNotNull(preview.response.jsonPathValue<String>("$.previewId"))
        return mockMvc
            .post("/api/admin/clubs/$clubId/domains") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId":"$previewId",
                      "idempotencyKey":"domain-${UUID.randomUUID()}",
                      "expectedAdminRevision":$expectedRevision,
                      "hostname":"$hostname",
                      "kind":"SUBDOMAIN",
                      "isPrimary":false,
                      "confirmed":true
                    }
                    """.trimIndent()
                cookie(sessionCookieForUser(adminUserId))
            }.andExpect { status { isEqualTo(expectedStatus) } }
            .andReturn()
    }

    protected fun onboardingRequestJson(
        hostEmail: String,
        slug: String = "club-${UUID.randomUUID().toString().take(8)}",
        existingUserConfirmation: String? = null,
        previewId: String? = null,
        idempotencyKey: String? = null,
    ): String {
        val confirmationJson =
            existingUserConfirmation?.let { ""","existingUserConfirmation":"$it"""" } ?: ""
        val confirmJson =
            if (previewId == null || idempotencyKey == null) {
                ""
            } else {
                """"previewId":"$previewId","idempotencyKey":"$idempotencyKey","confirmed":true,"""
            }
        return """
            {
              $confirmJson
              "club": {
                "name": "New Platform Club",
                "slug": "$slug",
                "tagline": "A private reading club",
                "about": "A new club created from the platform admin console."
              },
              "firstHost": {
                "email": "$hostEmail",
                "name": "First Host"
              }
              $confirmationJson
            }
            """.trimIndent()
    }

    protected fun createGoogleUser(
        email: String,
        name: String,
    ): String {
        val userId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, ?, ?, 'GOOGLE')
            """.trimIndent(),
            userId,
            email,
            name,
            name.take(20),
        )
        createdUserIds += userId
        return userId
    }

    protected fun emailForUser(userId: String): String =
        jdbcTemplate.queryForObject("select email from users where id = ?", String::class.java, userId)
            ?: error("Missing user email")

    protected fun membershipIdsForClub(clubId: String): Set<String> =
        jdbcTemplate
            .queryForList("select id from memberships where club_id = ?", String::class.java, clubId)
            .filterNotNull()
            .toSet()

    protected fun avatarKeyForClub(clubId: String): String =
        jdbcTemplate.queryForObject(
            "select avatar_key from memberships where club_id = ?",
            String::class.java,
            clubId,
        ) ?: error("Expected avatar key for club $clubId")

    protected fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) {
            return
        }
        val placeholders = values.joinToString(",") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }
}

private const val READING_SAI_CLUB_ID = "00000000-0000-0000-0000-000000000001"

private inline fun <reified T> MockHttpServletResponse.jsonPathValue(expression: String): T? =
    JsonPath
        .read(contentAsString, expression)

@TestConfiguration
class PlatformAdminDomainCheckTestConfiguration {
    @Bean
    @Primary
    fun fakeClubDomainActualStateChecker(): FakeClubDomainActualStateChecker = FakeClubDomainActualStateChecker()
}

class FakeClubDomainActualStateChecker : CheckClubDomainActualStatePort {
    private val callCount = AtomicInteger()

    @Volatile private var checkStarted: CountDownLatch? = null

    @Volatile private var checkRelease: CountDownLatch? = null

    @Volatile var observedTransaction: Boolean = false
        private set

    @Volatile private var crashOnNextCheck: Boolean = false

    val calls: Int
        get() = callCount.get()

    @Volatile
    var nextResult: ClubDomainActualCheckResult =
        ClubDomainActualCheckResult(
            status = ClubDomainStatus.FAILED,
            errorCode = "DOMAIN_CHECK_UNCONFIGURED",
        )

    override fun check(hostname: NormalizedClubDomainHostname): ClubDomainActualCheckResult {
        callCount.incrementAndGet()
        observedTransaction = TransactionSynchronizationManager.isActualTransactionActive()
        checkStarted?.countDown()
        checkRelease?.await(10, TimeUnit.SECONDS)
        if (crashOnNextCheck) {
            crashOnNextCheck = false
            throw SimulatedDomainCheckCrash()
        }
        return nextResult
    }

    fun crashNextCheck() {
        crashOnNextCheck = true
    }

    fun blockNextCheck() {
        checkStarted = CountDownLatch(1)
        checkRelease = CountDownLatch(1)
    }

    fun awaitCheckStarted(): Boolean = checkStarted?.await(10, TimeUnit.SECONDS) ?: false

    fun releaseCheck() {
        checkRelease?.countDown()
    }

    fun reset() {
        releaseCheck()
        checkStarted = null
        checkRelease = null
        callCount.set(0)
        observedTransaction = false
        crashOnNextCheck = false
        nextResult =
            ClubDomainActualCheckResult(
                status = ClubDomainStatus.FAILED,
                errorCode = "DOMAIN_CHECK_UNCONFIGURED",
            )
    }
}

class SimulatedDomainCheckCrash : Error()
