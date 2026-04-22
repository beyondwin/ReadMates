package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.feedback.api.FeedbackDocumentController
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
class PendingApprovalSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val feedbackDocumentController: FeedbackDocumentController,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `pending approval can read auth me`() {
        val cookie = pendingSessionCookie("pending.readonly")

        mockMvc.get("/api/auth/me") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.approvalState") { value("PENDING_APPROVAL") }
        }
    }

    @Test
    fun `pending approval cannot mutate current session`() {
        val cookie = pendingSessionCookie("pending.write")

        mockMvc.post("/api/sessions/current/questions") {
            cookie(cookie)
            contentType = MediaType.APPLICATION_JSON
            content = """{"questions":[{"priority":1,"text":"Question?","draftThought":null}]}"""
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `pending approval cannot read feedback document`() {
        val cookie = pendingSessionCookie("pending.feedback")

        mockMvc.get("/api/sessions/00000000-0000-0000-0000-000000000301/feedback-document") {
            cookie(cookie)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `pending approval cannot access host api`() {
        val cookie = pendingSessionCookie("pending.host")

        mockMvc.get("/api/host/dashboard") {
            cookie(cookie)
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `feedback document controller rejects pending approval before readable lookup`() {
        val email = pendingMemberEmail("pending.feedback.guard")
        pendingSessionCookie(email)

        val exception = assertThrows<ResponseStatusException> {
            feedbackDocumentController.feedbackDocument(
                authentication = UsernamePasswordAuthenticationToken(
                    email,
                    null,
                    listOf(SimpleGrantedAuthority("ROLE_PENDING_APPROVAL")),
                ),
                sessionId = "00000000-0000-0000-0000-000000000301",
            )
        }

        assertEquals(HttpStatus.FORBIDDEN, exception.statusCode)
        assertEquals("Feedback documents require approved membership", exception.reason)
    }

    private fun pendingSessionCookie(emailPrefixOrAddress: String): Cookie {
        val email = if (emailPrefixOrAddress.contains("@")) {
            emailPrefixOrAddress
        } else {
            pendingMemberEmail(emailPrefixOrAddress)
        }
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()

        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, 'Pending Approval', 'Pending', null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-pending-security-$userId",
            email,
        )
        createdUserIds += userId

        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'PENDING_APPROVAL', null)
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId

        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "PendingApprovalSecurityTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun pendingMemberEmail(prefix: String): String =
        "$prefix.${UUID.randomUUID()}@example.com"

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
