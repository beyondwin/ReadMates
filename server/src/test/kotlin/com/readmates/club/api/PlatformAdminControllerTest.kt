package com.readmates.club.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.http.MediaType
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Import(PlatformAdminDomainCheckTestConfiguration::class)
class PlatformAdminControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val domainActualStateChecker: FakeClubDomainActualStateChecker,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubDomainIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("club_domains", "id", createdClubDomainIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("platform_admins", "user_id", createdPlatformAdminUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdPlatformAdminUserIds.clear()
            createdUserIds.clear()
            createdClubDomainIds.clear()
            SecurityContextHolder.clearContext()
            domainActualStateChecker.reset()
        }
    }

    @Test
    fun `host without platform admin cannot access admin API`() {
        mockMvc.get("/api/admin/summary") {
            cookie(sessionCookieForUser("00000000-0000-0000-0000-000000000101"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `active owner can access admin summary`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")

        mockMvc.get("/api/admin/summary") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$.platformRole") { value("OWNER") }
            jsonPath("$.activeClubCount") { value(2) }
            jsonPath("$.domainActionRequiredCount") { value(0) }
        }
    }

    @Test
    fun `disabled owner cannot access admin API`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "DISABLED")

        mockMvc.get("/api/admin/summary") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `operator can create action required subdomain row`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostname = "task14-${UUID.randomUUID()}.example.test"

        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
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

        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
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

        mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
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

        mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
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

        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
        }.andReturn()
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))

        mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
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
        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
        }.andReturn()
        createdClubDomainIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))

        mockMvc.get("/api/admin/summary") {
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

        mockMvc.get("/api/admin/summary") {
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

        mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(support))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `operator can check custom domain provisioning and activate verified domain`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostname = "verified-${UUID.randomUUID()}.example.test"
        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
        }.andReturn()
        val domainId = checkNotNull(result.response.jsonPathValue<String>("$.id"))
        createdClubDomainIds += domainId
        domainActualStateChecker.nextResult = ClubDomainActualCheckResult(
            status = ClubDomainStatus.ACTIVE,
            errorCode = null,
        )

        mockMvc.post("/api/admin/domains/$domainId/check") {
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
        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(operator))
        }.andExpect {
            status { isOk() }
        }.andReturn()
        val domainId = checkNotNull(result.response.jsonPathValue<String>("$.id"))
        createdClubDomainIds += domainId
        domainActualStateChecker.nextResult = ClubDomainActualCheckResult(
            status = ClubDomainStatus.FAILED,
            errorCode = "DOMAIN_CHECK_MARKER_MISMATCH",
        )

        mockMvc.post("/api/admin/domains/$domainId/check") {
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

        mockMvc.post("/api/admin/domains/${UUID.randomUUID()}/check") {
            cookie(sessionCookieForUser(support))
        }.andExpect {
            status { isForbidden() }
        }
    }

    private fun createPlatformAdminUser(role: String, status: String): String {
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

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession = authSessionService.issueSession(
            userId = UUID.fromString(userId).toString(),
            userAgent = "PlatformAdminControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
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

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

private inline fun <reified T> org.springframework.mock.web.MockHttpServletResponse.jsonPathValue(expression: String): T? =
    com.jayway.jsonpath.JsonPath.read(contentAsString, expression)

@TestConfiguration
class PlatformAdminDomainCheckTestConfiguration {
    @Bean
    @Primary
    fun fakeClubDomainActualStateChecker(): FakeClubDomainActualStateChecker = FakeClubDomainActualStateChecker()
}

class FakeClubDomainActualStateChecker : CheckClubDomainActualStatePort {
    var nextResult: ClubDomainActualCheckResult = ClubDomainActualCheckResult(
        status = ClubDomainStatus.FAILED,
        errorCode = "DOMAIN_CHECK_UNCONFIGURED",
    )

    override fun check(hostname: String): ClubDomainActualCheckResult = nextResult

    fun reset() {
        nextResult = ClubDomainActualCheckResult(
            status = ClubDomainStatus.FAILED,
            errorCode = "DOMAIN_CHECK_UNCONFIGURED",
        )
    }
}
