package com.readmates.club.api

import com.jayway.jsonpath.JsonPath
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubDomainIds = linkedSetOf<String>()
    private val createdClubIds = linkedSetOf<String>()
    private val createdInvitationIds = linkedSetOf<String>()

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
            createdClubIds.clear()
            createdInvitationIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `admin domain bff request without secret is rejected`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "missing-secret-${UUID.randomUUID()}.example.test"

        mockMvc
            .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                cookie(sessionCookieForUser(owner))
                header("Origin", "http://localhost:3000")
            }.andExpect {
                status { isUnauthorized() }
            }

        assertEquals(0, countDomainRows(hostname))
    }

    @Test
    fun `admin domain bff request without allowed origin is rejected`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "missing-origin-${UUID.randomUUID()}.example.test"

        mockMvc
            .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                cookie(sessionCookieForUser(owner))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isForbidden() }
            }

        assertEquals(0, countDomainRows(hostname))
    }

    @Test
    fun `admin domain bff request reaches controller without spring csrf token`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostname = "bff-${UUID.randomUUID()}.example.test"
        val preview =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """{"expectedAdminRevision":0,"hostname":"$hostname","kind":"SUBDOMAIN"}"""
                    cookie(sessionCookieForUser(operator))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                }.andExpect { status { isOk() } }
                .andReturn()
        val previewId = JsonPath.read<String>(preview.response.contentAsString, "$.previewId")

        val result =
            mockMvc
                .post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "previewId":"$previewId",
                          "idempotencyKey":"bff-domain-${UUID.randomUUID()}",
                          "expectedAdminRevision":0,
                          "hostname":"$hostname",
                          "kind":"SUBDOMAIN",
                          "confirmed":true
                        }
                        """.trimIndent()
                    cookie(sessionCookieForUser(operator))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.commandType") { value("club.domain.create") }
                }.andReturn()
        createdClubDomainIds += JsonPath.read<String>(result.response.contentAsString, "$.targetId")

        assertEquals(1, countDomainRows(hostname))
    }

    @Test
    fun `admin onboarding preview bff request reaches controller without spring csrf token`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")

        mockMvc
            .post("/api/admin/clubs/onboarding/preview") {
                contentType = MediaType.APPLICATION_JSON
                content = onboardingRequestJson("bff.preview.${UUID.randomUUID()}@example.com")
                cookie(sessionCookieForUser(operator))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("Origin", "http://localhost:3000")
            }.andExpect {
                status { isOk() }
                jsonPath("$.firstHostKind") { value("NEW_USER") }
            }
    }

    @Test
    fun `admin onboarding commit bff request reaches controller without spring csrf token`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val command = onboardingRequestJson("bff.commit.${UUID.randomUUID()}@example.com")
        val preview =
            mockMvc
                .post("/api/admin/clubs/onboarding/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = command
                    cookie(sessionCookieForUser(operator))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                }.andExpect { status { isOk() } }
                .andReturn()
        val previewId = JsonPath.read<String>(preview.response.contentAsString, "$.previewId")

        val result =
            mockMvc
                .post("/api/admin/clubs/onboarding") {
                    contentType = MediaType.APPLICATION_JSON
                    content = confirmationBody(command, previewId, "bff-onboarding-${UUID.randomUUID()}")
                    cookie(sessionCookieForUser(operator))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                    header("Origin", "http://localhost:3000")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.firstHostKind") { value("INVITATION_CREATED") }
                    jsonPath("$.invitationDelivery") { value("PENDING") }
                    jsonPath("$.token") { doesNotExist() }
                    jsonPath("$.email") { doesNotExist() }
                }.andReturn()
        val clubId = JsonPath.read<String>(result.response.contentAsString, "$.club.clubId")
        createdClubIds += clubId
        createdInvitationIds +=
            jdbcTemplate
                .queryForList("select id from invitations where club_id = ?", String::class.java, clubId)
                .filterNotNull()
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

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminBffSecurityTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun countDomainRows(hostname: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from club_domains where hostname = ?",
            Int::class.java,
            hostname,
        ) ?: 0

    private fun onboardingRequestJson(hostEmail: String): String {
        val slug = "bff-club-${UUID.randomUUID().toString().take(8)}"
        return """
            {
              "club": {
                "name": "BFF Platform Club",
                "slug": "$slug",
                "tagline": "A private reading club",
                "about": "A new club created through the platform BFF boundary."
              },
              "firstHost": {
                "email": "$hostEmail",
                "name": "First Host"
              }
            }
            """.trimIndent()
    }

    private fun confirmationBody(
        command: String,
        previewId: String,
        idempotencyKey: String,
    ): String =
        command.replaceFirst(
            "{",
            "{\"previewId\":\"$previewId\",\"idempotencyKey\":\"$idempotencyKey\",\"confirmed\":true,",
        )

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
