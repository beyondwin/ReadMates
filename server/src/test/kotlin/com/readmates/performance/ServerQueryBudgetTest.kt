package com.readmates.performance

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.QueryCounter
import com.readmates.support.QueryCountingDataSourcePostProcessor
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.config.BeanPostProcessor
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

private const val CLEANUP_QUERY_BUDGET_SESSION_SQL = """
    delete from feedback_reports where session_id = '00000000-0000-0000-0000-000000009777';
    delete from session_feedback_documents where session_id = '00000000-0000-0000-0000-000000009777';
    delete from public_session_publications where session_id = '00000000-0000-0000-0000-000000009777';
    delete from highlights where session_id = '00000000-0000-0000-0000-000000009777';
    delete from long_reviews where session_id = '00000000-0000-0000-0000-000000009777';
    delete from one_line_reviews where session_id = '00000000-0000-0000-0000-000000009777';
    delete from questions where session_id = '00000000-0000-0000-0000-000000009777';
    delete from reading_checkins where session_id = '00000000-0000-0000-0000-000000009777';
    delete from session_participants where session_id = '00000000-0000-0000-0000-000000009777';
    delete from sessions where id = '00000000-0000-0000-0000-000000009777';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [CLEANUP_QUERY_BUDGET_SESSION_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_QUERY_BUDGET_SESSION_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class ServerQueryBudgetTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val largeFixture by lazy { LargeReadPathFixture(jdbcTemplate) }

    @AfterEach
    fun cleanupAuthSessions() {
        largeFixture.cleanupNotesFeed()
        if (createdSessionTokenHashes.isEmpty()) {
            return
        }
        val bindMarkers = createdSessionTokenHashes.joinToString(",") { "?" }
        jdbcTemplate.update(
            "delete from auth_sessions where session_token_hash in ($bindMarkers)",
            *createdSessionTokenHashes.toTypedArray(),
        )
        createdSessionTokenHashes.clear()
    }

    @Test
    fun `current session stays within observed empty-state query budget`() {
        assertQueryBudget(
            budget = 5,
            reason = "current-session empty state should remain a small fixed number of DB round trips",
        ) {
            mockMvc
                .get("/api/sessions/current") {
                    with(user("member5@example.com"))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                }
        }
    }

    @Test
    fun `archive session detail stays within hydrated-detail query budget`() {
        assertQueryBudget(
            budget = 14,
            reason = "archive detail currently hydrates several independent detail sections without batching",
        ) {
            mockMvc
                .get("/api/archive/sessions/00000000-0000-0000-0000-000000000306") {
                    with(user("member5@example.com"))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                }
        }
    }

    @Test
    fun `public club page stays within summary query budget`() {
        assertQueryBudget(
            budget = 5,
            reason = "public club page loads club metadata, stats, and recent public sessions",
        ) {
            mockMvc
                .get("/api/public/clubs/reading-sai") {
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                }
        }
    }

    @Test
    fun `public session detail stays within public-detail query budget`() {
        assertQueryBudget(
            budget = 3,
            reason = "public session detail loads the session plus public highlights and one-liners",
        ) {
            mockMvc
                .get("/api/public/clubs/reading-sai/sessions/00000000-0000-0000-0000-000000000306") {
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                }
        }
    }

    @Test
    fun `admin analytics overview stays within aggregate query budget`() {
        val ownerCookie = sessionCookieForUser(OWNER_USER_ID)

        assertQueryBudget(
            budget = 33,
            reason = "admin analytics overview issues fixed aggregate plus one grouped query per series metric",
        ) {
            mockMvc
                .get("/api/admin/analytics/overview?window=30d") {
                    cookie(ownerCookie)
                }.andExpect {
                    status { isOk() }
                }
        }
    }

    @Test
    fun `host deletion preview stays within count-query budget`() {
        insertOpenSessionForDeletionPreview()

        assertQueryBudget(
            budget = 15,
            reason = "deletion preview intentionally issues separate count queries for each owned table",
        ) {
            mockMvc
                .get("/api/host/sessions/00000000-0000-0000-0000-000000009777/deletion-preview") {
                    with(user("host@example.com"))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                }
        }
    }

    @Test
    fun `host session closing status stays within read-model query budget`() {
        assertQueryBudget(
            budget = 6,
            reason = "host closing status should stay a small bounded read model without accidental N+1 queries",
        ) {
            mockMvc
                .get("/api/host/sessions/00000000-0000-0000-0000-000000000306/closing-status") {
                    with(user("host@example.com"))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("host.session_closing_status.v1") }
                    jsonPath("$.session.sessionId") { value("00000000-0000-0000-0000-000000000306") }
                }
        }
    }

    @Test
    fun `notes feed large fixture stays within fixed query budget`() {
        largeFixture.seedNotesFeed(sessionCount = 80)

        assertQueryBudget(
            budget = 6,
            reason = "notes feed should remain a bounded cursor query under large synthetic history",
        ) {
            mockMvc
                .get("/api/notes/feed?limit=60") {
                    with(user("member5@example.com"))
                    header("X-Readmates-Bff-Secret", "test-bff-secret")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(60) }
                }
        }
    }

    @Test
    fun `notes feed large fixture returns first page under duration smoke threshold`() {
        largeFixture.seedNotesFeed(sessionCount = 80)

        val startedAt = System.nanoTime()
        mockMvc
            .get("/api/notes/feed?limit=60") {
                with(user("member5@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(60) }
            }
        val elapsedMs = (System.nanoTime() - startedAt) / 1_000_000

        assertThat(elapsedMs)
            .describedAs("notes feed first page should stay below a local integration smoke threshold")
            .isLessThan(1_500)
    }

    private fun assertQueryBudget(
        budget: Int,
        reason: String,
        request: () -> Unit,
    ) {
        QueryCounter.reset()
        request()
        assertThat(QueryCounter.count())
            .describedAs("$reason; prepareStatement count should stay <= $budget")
            .isLessThanOrEqualTo(budget)
    }

    private fun insertOpenSessionForDeletionPreview() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state
            )
            values (
              '00000000-0000-0000-0000-000000009777',
              '00000000-0000-0000-0000-000000000001',
              8,
              '8회차 · 삭제 예산 테스트 책',
              '삭제 예산 테스트 책',
              '테스트 저자',
              '2026-05-20',
              '20:00:00',
              '22:00:00',
              '온라인',
              '2026-05-19 14:59:00.000000',
              'OPEN'
            )
            """.trimIndent(),
        )
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "ServerQueryBudgetTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
    }

    @TestConfiguration
    class QueryBudgetConfig {
        @Bean
        fun queryCountingDataSourcePostProcessor(): BeanPostProcessor = QueryCountingDataSourcePostProcessor()
    }
}
