package com.readmates.session.api

import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
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
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post

private const val CLEANUP_BFF_DELETE_SESSION_SQL = """
    delete from session_participants
    where session_id = '00000000-0000-0000-0000-000000009888';
    delete from sessions
    where id = '00000000-0000-0000-0000-000000009888';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        CLEANUP_BFF_DELETE_SESSION_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        CLEANUP_BFF_DELETE_SESSION_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class HostSessionBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `host delete bff request reaches controller without spring csrf token`() {
        createOpenSession()

        mockMvc.delete("/api/host/sessions/00000000-0000-0000-0000-000000009888") {
            with(user("host@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
            jsonPath("$.sessionNumber") { value(88) }
            jsonPath("$.deleted") { value(true) }
            jsonPath("$.counts.participants") { value(6) }
        }

        assertEquals(0, countRows("sessions", "id = '00000000-0000-0000-0000-000000009888'"))
        assertEquals(0, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009888'"))
    }

    @Test
    fun `host visibility bff request reaches controller without spring csrf token`() {
        createDraftSession()

        mockMvc.patch("/api/host/sessions/00000000-0000-0000-0000-000000009888/visibility") {
            with(user("host@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            contentType = MediaType.APPLICATION_JSON
            content = """{"visibility":"MEMBER"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
            jsonPath("$.visibility") { value("MEMBER") }
        }
    }

    @Test
    fun `host open bff request reaches controller without spring csrf token`() {
        createDraftSession()

        mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009888/open") {
            with(user("host@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
            jsonPath("$.state") { value("OPEN") }
        }

        assertEquals(6, countRows("session_participants", "session_id = '00000000-0000-0000-0000-000000009888'"))
    }

    @Test
    fun `host close bff request reaches controller without spring csrf token`() {
        createOpenSession()

        mockMvc.post("/api/host/sessions/00000000-0000-0000-0000-000000009888/close") {
            with(user("host@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isOk() }
            jsonPath("$.sessionId") { value("00000000-0000-0000-0000-000000009888") }
            jsonPath("$.state") { value("CLOSED") }
        }
    }

    private fun createDraftSession() {
        createSession(state = "DRAFT", visibility = "HOST_ONLY")
    }

    private fun createOpenSession() {
        createSession(state = "OPEN", visibility = "HOST_ONLY")
        jdbcTemplate.update(
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status)
            select uuid(), memberships.club_id, '00000000-0000-0000-0000-000000009888', memberships.id, 'NO_RESPONSE', 'UNKNOWN'
            from memberships
            where memberships.club_id = '00000000-0000-0000-0000-000000000001'
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
        )
    }

    private fun createSession(state: String, visibility: String) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state,
              visibility
            )
            values (
              '00000000-0000-0000-0000-000000009888',
              '00000000-0000-0000-0000-000000000001',
              88,
              '88회차 · BFF 삭제 테스트 책',
              'BFF 삭제 테스트 책',
              'BFF 삭제 테스트 저자',
              '2026-07-01',
              '20:00:00',
              '22:00:00',
              '온라인',
              '2026-06-30 14:59:00',
              ?,
              ?
            )
            """.trimIndent(),
            state,
            visibility,
        )
    }

    private fun countRows(tableName: String, whereClause: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $tableName where $whereClause",
            Int::class.java,
        ) ?: 0

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
