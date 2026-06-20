package com.readmates.club.api

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

private const val ADMIN_TODAY_CLOSING_RISK_CLUB_ID = "00000000-0000-0000-0000-0000000ca001"
private const val ADMIN_TODAY_CLOSING_RISK_SESSION_ID = "00000000-0000-0000-0000-0000000ca101"
private const val ADMIN_TODAY_CLOSING_RISK_CLEANUP_SQL = """
    delete from notification_event_outbox where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from session_feedback_documents where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from public_session_publications where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from sessions where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from clubs where id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Sql(statements = [ADMIN_TODAY_CLOSING_RISK_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [ADMIN_TODAY_CLOSING_RISK_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class PlatformAdminClubOperationsControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val objectMapper = ObjectMapper()

    @AfterEach
    fun cleanup() {
        if (createdSessionTokenHashes.isNotEmpty()) {
            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        createdSessionTokenHashes.clear()
    }

    @Test
    fun `owner can read aggregate club operations snapshot`() {
        val body =
            mockMvc
                .get("/api/admin/clubs/$READING_SAI_CLUB_ID/operations") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.club_operations_snapshot.v1") }
                    jsonPath("$.club.clubId") { value(READING_SAI_CLUB_ID) }
                    jsonPath("$.readiness.state") { exists() }
                    jsonPath("$.memberActivity.activeCount") { exists() }
                    jsonPath("$.notificationHealth.failureClusters") { exists() }
                    jsonPath("$.safeLinks[0].href") { exists() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain("@example.com")
        assertThat(body.lowercase()).doesNotContain("review body")
        assertThat(body.lowercase()).doesNotContain("note body")
    }

    @Test
    fun `support can read aggregate club operations snapshot`() {
        mockMvc
            .get("/api/admin/clubs/$READING_SAI_CLUB_ID/operations") {
                cookie(sessionCookieForUser(SUPPORT_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("admin.club_operations_snapshot.v1") }
            }
    }

    @Test
    fun `missing club returns not found`() {
        mockMvc
            .get("/api/admin/clubs/${UUID.randomUUID()}/operations") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isNotFound() }
            }
    }

    @Test
    fun `owner can read admin today closing risk projection with safe item contract`() {
        seedAdminTodayClosingRisk()

        val body =
            mockMvc
                .get("/api/admin/today/closing-risks") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.today_closing_risks.v1") }
                    jsonPath("$.generatedAt") { exists() }
                    jsonPath("$.items") { isArray() }
                }.andReturn()
                .response
                .contentAsString

        val root = objectMapper.readTree(body)
        val item =
            root.get("items").first {
                it.get("clubId").asText() == ADMIN_TODAY_CLOSING_RISK_CLUB_ID
            }
        assertThat(item.fieldNames().asSequence().toList())
            .containsExactlyInAnyOrder(
                "clubId",
                "clubSlug",
                "clubName",
                "sessionId",
                "sessionNumber",
                "bookTitle",
                "meetingDate",
                "overallState",
                "primaryBlocker",
                "hostClosingHref",
            )
        assertThat(item.get("clubSlug").asText()).isEqualTo("admin-today-closing-risk")
        assertThat(item.get("sessionId").asText()).isEqualTo(ADMIN_TODAY_CLOSING_RISK_SESSION_ID)
        assertThat(item.get("overallState").asText()).isEqualTo("BLOCKED")
        assertThat(item.get("primaryBlocker").asText()).isEqualTo("FEEDBACK_DOCUMENT_INVALID")
        assertThat(item.get("hostClosingHref").asText())
            .isEqualTo("/clubs/admin-today-closing-risk/app/host/sessions/$ADMIN_TODAY_CLOSING_RISK_SESSION_ID/closing")
        assertThat(body).doesNotContain("RAW_ADMIN_TODAY_PRIVATE_FEEDBACK")
    }

    @Test
    fun `admin today closing risks require platform admin authentication`() {
        mockMvc
            .get("/api/admin/today/closing-risks")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminClubOperationsControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun seedAdminTodayClosingRisk() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) " +
                "values (?, 'admin-today-closing-risk', 'Admin Today Closing Risk', '', '', 'ACTIVE', 'PRIVATE')",
            ADMIN_TODAY_CLOSING_RISK_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, ?, 41, 'Admin today risk session', 'Admin Today Risk Book', 'Author',
              '2026-06-20', '19:30:00', '21:30:00', '2026-06-20 12:00:00', 'Online', 'CLOSED', 'MEMBER')
            """.trimIndent(),
            ADMIN_TODAY_CLOSING_RISK_SESSION_ID,
            ADMIN_TODAY_CLOSING_RISK_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, visibility, is_public, published_at
            )
            values (
              '00000000-0000-0000-0000-0000000ca201',
              ?,
              ?,
              'Safe public summary.',
              'MEMBER',
              false,
              null
            )
            """.trimIndent(),
            ADMIN_TODAY_CLOSING_RISK_CLUB_ID,
            ADMIN_TODAY_CLOSING_RISK_SESSION_ID,
        )
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size
            )
            values (
              '00000000-0000-0000-0000-0000000ca301',
              ?,
              ?,
              1,
              'RAW_ADMIN_TODAY_PRIVATE_FEEDBACK without template marker',
              'feedback.md',
              'text/markdown',
              58
            )
            """.trimIndent(),
            ADMIN_TODAY_CLOSING_RISK_CLUB_ID,
            ADMIN_TODAY_CLOSING_RISK_SESSION_ID,
        )
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val READING_SAI_CLUB_ID = "00000000-0000-0000-0000-000000000001"
    }
}
