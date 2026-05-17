package com.readmates.club.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.hamcrest.Matchers
import org.junit.jupiter.api.AfterEach
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
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class)
@Tag("integration")
class PlatformAdminControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val domainActualStateChecker: FakeClubDomainActualStateChecker,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubDomainIds = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdClubIds = linkedSetOf<String>()
    private val createdInvitationIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("invitations", "id", createdInvitationIds)
            deleteWhereIn("club_domains", "id", createdClubDomainIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
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
        val hostname = "task14-${UUID.randomUUID()}.example.test"

        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.clubId") { value(READING_SAI_CLUB_ID) }
                    jsonPath("$.hostname") { value(hostname) }
                    jsonPath("$.kind") { value("SUBDOMAIN") }
                    jsonPath("$.status") { value("ACTION_REQUIRED") }
                    jsonPath("$.isPrimary") { value(false) }
                }.andReturn()
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))
    }

    @Test
    fun `created domain hostnames are normalized to lowercase`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val token = UUID.randomUUID().toString().replace("-", "")
        val expectedHostname = "task14-$token.example.test"

        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"hostname":"Task14-$token.Example.Test.","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(owner))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.hostname") { value(expectedHostname) }
                    jsonPath("$.status") { value("ACTION_REQUIRED") }
                }.andReturn()
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))
    }

    @Test
    fun `cannot create platform fallback hostname as club domain`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")

        mockMvc
            .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"hostname":"readmates.pages.dev","kind":"SUBDOMAIN"}"""
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `pending club domain cannot be created as primary`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "primary-${UUID.randomUUID()}.example.test"

        mockMvc
            .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"hostname":"$hostname","kind":"SUBDOMAIN","isPrimary":true}"""
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isBadRequest() }
            }
    }

    @Test
    fun `cannot create duplicate club domain hostname`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "duplicate-${UUID.randomUUID()}.example.test"

        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(owner))
                }.andExpect {
                    status { isOk() }
                }.andReturn()
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))

        mockMvc
            .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isConflict() }
            }
    }

    @Test
    fun `summary lists action required domains for admin UI`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "summary-${UUID.randomUUID()}.example.test"
        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(owner))
                }.andExpect {
                    status { isOk() }
                }.andReturn()
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))

        mockMvc
            .get("/api/admin/summary") {
                cookie(sessionCookieForUser(owner))
            }.andExpect {
                status { isOk() }
                jsonPath("$.domainActionRequiredCount") { value(1) }
                jsonPath("$.domainsRequiringAction[0].hostname") { value(hostname) }
                jsonPath("$.domainsRequiringAction[0].status") { value("ACTION_REQUIRED") }
                jsonPath("$.domainsRequiringAction[0].manualAction") { value("CLOUDFLARE_PAGES_CUSTOM_DOMAIN") }
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
        val hostname = "support-${UUID.randomUUID()}.example.test"

        mockMvc
            .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
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

        mockMvc
            .patch("/api/admin/clubs/$clubId") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"publicVisibility":"PUBLIC"}"""
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.clubId") { value(clubId) }
                jsonPath("$.status") { value("ACTIVE") }
                jsonPath("$.publicVisibility") { value("PUBLIC") }
            }
    }

    @Test
    fun `support admin cannot make a club public`() {
        val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")
        val clubId = createSetupClubWithActiveHost()

        mockMvc
            .patch("/api/admin/clubs/$clubId") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"publicVisibility":"PUBLIC"}"""
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
                jsonPath("$.firstHost.kind") { value("EXISTING_USER") }
                jsonPath("$.firstHost.existingUserId") { value(hostUserId) }
                jsonPath("$.firstHost.requiredConfirmation") { value("ASSIGN_EXISTING_USER_AS_HOST") }
            }
    }

    @Test
    fun `operator creates private setup club and assigns existing user as host after confirmation`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostUserId = createGoogleUser("assign.host.${UUID.randomUUID()}@example.com", "Assign Host")
        val hostEmail = emailForUser(hostUserId)

        val result =
            mockMvc
                .post("/api/admin/clubs/onboarding") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        onboardingRequestJson(
                            hostEmail = hostEmail,
                            existingUserConfirmation = "ASSIGN_EXISTING_USER_AS_HOST",
                        )
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.club.publicVisibility") { value("PRIVATE") }
                    jsonPath("$.club.status") { value("SETUP_REQUIRED") }
                    jsonPath("$.hostOnboarding.kind") { value("EXISTING_USER_ASSIGNED") }
                    jsonPath("$.hostOnboarding.emailDelivery.status") { value("SKIPPED") }
                }.andReturn()
        val clubId = checkNotNull(result.response.jsonPathValue<String>("$.club.clubId"))
        createdClubIds += clubId
        createdMembershipIds += membershipIdsForClub(clubId)
    }

    @Test
    fun `operator creates host invitation and returns accept url for new host email`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostEmail = "new.host.${UUID.randomUUID()}@example.com"

        val result =
            mockMvc
                .post("/api/admin/clubs/onboarding") {
                    contentType = MediaType.APPLICATION_JSON
                    content = onboardingRequestJson(hostEmail = hostEmail)
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.hostOnboarding.kind") { value("INVITATION_CREATED") }
                    jsonPath("$.hostOnboarding.acceptUrl") { exists() }
                    jsonPath("$.hostOnboarding.emailDelivery.status") { exists() }
                }.andReturn()
        createdInvitationIds += checkNotNull(result.response.jsonPathValue<String>("$.hostOnboarding.invitationId"))
        createdClubIds += checkNotNull(result.response.jsonPathValue<String>("$.club.clubId"))
    }

    @Test
    fun `operator can check custom domain provisioning and activate verified domain`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostname = "verified-${UUID.randomUUID()}.example.test"
        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                }.andReturn()
        val domainId = checkNotNull(result.response.jsonPathValue<String>("$.id"))
        createdClubDomainIds += domainId
        domainActualStateChecker.nextResult =
            ClubDomainActualCheckResult(
                status = ClubDomainStatus.ACTIVE,
                errorCode = null,
            )

        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(domainId) }
                jsonPath("$.hostname") { value(hostname) }
                jsonPath("$.status") { value("ACTIVE") }
                jsonPath("$.manualAction") { value("NONE") }
                jsonPath("$.errorCode") { doesNotExist() }
                jsonPath("$.verifiedAt") { exists() }
                jsonPath("$.lastCheckedAt") { exists() }
            }
    }

    @Test
    fun `operator can check custom domain provisioning and store failure code`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostname = "failed-check-${UUID.randomUUID()}.example.test"
        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(operator))
                }.andExpect {
                    status { isOk() }
                }.andReturn()
        val domainId = checkNotNull(result.response.jsonPathValue<String>("$.id"))
        createdClubDomainIds += domainId
        domainActualStateChecker.nextResult =
            ClubDomainActualCheckResult(
                status = ClubDomainStatus.FAILED,
                errorCode = "DOMAIN_CHECK_MARKER_MISMATCH",
            )

        mockMvc
            .post("/api/admin/domains/$domainId/check") {
                cookie(sessionCookieForUser(operator))
            }.andExpect {
                status { isOk() }
                jsonPath("$.id") { value(domainId) }
                jsonPath("$.status") { value("FAILED") }
                jsonPath("$.manualAction") { value("NONE") }
                jsonPath("$.errorCode") { value("DOMAIN_CHECK_MARKER_MISMATCH") }
                jsonPath("$.verifiedAt") { doesNotExist() }
                jsonPath("$.lastCheckedAt") { exists() }
            }
    }

    @Test
    fun `support platform admin cannot check custom domain provisioning`() {
        val support = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        mockMvc
            .post("/api/admin/domains/${UUID.randomUUID()}/check") {
                cookie(sessionCookieForUser(support))
            }.andExpect {
                status { isForbidden() }
            }
    }

    private fun createPlatformAdminUser(
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

    private fun createSetupClubWithActiveHost(): String {
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Host')
            """.trimIndent(),
            membershipId,
            clubId,
            hostUserId,
        )
        createdMembershipIds += membershipId
        return clubId
    }

    private fun onboardingRequestJson(
        hostEmail: String,
        existingUserConfirmation: String? = null,
    ): String {
        val slug = "club-${UUID.randomUUID().toString().take(8)}"
        val confirmationJson =
            existingUserConfirmation?.let { ""","existingUserConfirmation":"$it"""" } ?: ""
        return """
            {
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

    private fun createGoogleUser(
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

    private fun emailForUser(userId: String): String =
        jdbcTemplate.queryForObject("select email from users where id = ?", String::class.java, userId)
            ?: error("Missing user email")

    private fun membershipIdsForClub(clubId: String): Set<String> =
        jdbcTemplate
            .queryForList("select id from memberships where club_id = ?", String::class.java, clubId)
            .toSet()

    private fun sessionCookieForUser(userId: String): Cookie {
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

    companion object {
        private const val READING_SAI_CLUB_ID = "00000000-0000-0000-0000-000000000001"
    }
}

private inline fun <reified T> org.springframework.mock.web.MockHttpServletResponse.jsonPathValue(expression: String): T? =
    com.jayway.jsonpath.JsonPath
        .read(contentAsString, expression)

@TestConfiguration
class PlatformAdminDomainCheckTestConfiguration {
    @Bean
    @Primary
    fun fakeClubDomainActualStateChecker(): FakeClubDomainActualStateChecker = FakeClubDomainActualStateChecker()
}

class FakeClubDomainActualStateChecker : CheckClubDomainActualStatePort {
    var nextResult: ClubDomainActualCheckResult =
        ClubDomainActualCheckResult(
            status = ClubDomainStatus.FAILED,
            errorCode = "DOMAIN_CHECK_UNCONFIGURED",
        )

    override fun check(hostname: String): ClubDomainActualCheckResult = nextResult

    fun reset() {
        nextResult =
            ClubDomainActualCheckResult(
                status = ClubDomainStatus.FAILED,
                errorCode = "DOMAIN_CHECK_UNCONFIGURED",
            )
    }
}
