package com.readmates.auth.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class AuthenticatedMemberSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `rejects authenticated principal without active membership from protected api`() {
        mockMvc
            .get("/api/sessions/current") {
                with(user("nonmember@example.com"))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `allows seeded member principal to reach protected api without explicit role`() {
        mockMvc
            .get("/api/sessions/current") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `allows seeded host principal to reach host api without explicit role`() {
        mockMvc
            .get("/api/host/dashboard") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `rejects seeded member principal from host api`() {
        mockMvc
            .get("/api/host/dashboard") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    @Sql(
        statements = [
            CLEANUP_CROSS_CLUB_RESOURCE_SQL,
            INSERT_CROSS_CLUB_RESOURCE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
    )
    @Sql(
        statements = [
            CLEANUP_CROSS_CLUB_RESOURCE_SQL,
        ],
        executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
    )
    fun `club A host cannot read or mutate club B session by resource id`() {
        val sessionBefore = crossClubSessionRow()
        val publicationBefore = crossClubPublicationRow()
        val outboxBefore = crossClubOutboxCount()
        val auditBefore = crossClubAuditCount()

        mockMvc
            .get("/api/archive/sessions/$CROSS_CLUB_SESSION_ID") {
                header("X-Readmates-Club-Slug", "reading-sai")
                with(user("host@example.com"))
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("RESOURCE_NOT_FOUND") }
                jsonPath("$.status") { value(404) }
            }

        mockMvc
            .patch("/api/host/sessions/$CROSS_CLUB_SESSION_ID/visibility") {
                header("X-Readmates-Club-Slug", "reading-sai")
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"visibility":"PUBLIC"}"""
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
                jsonPath("$.status") { value(404) }
            }

        assertEquals(sessionBefore, crossClubSessionRow())
        assertEquals(publicationBefore, crossClubPublicationRow())
        assertEquals(outboxBefore, crossClubOutboxCount())
        assertEquals(auditBefore, crossClubAuditCount())
    }

    private fun crossClubSessionRow(): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select state, visibility, updated_at
            from sessions
            where id = ?
              and club_id = '00000000-0000-0000-0000-000000000002'
            """.trimIndent(),
            CROSS_CLUB_SESSION_ID,
        )

    private fun crossClubPublicationRow(): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            """
            select public_summary, visibility, is_public, published_at, updated_at
            from public_session_publications
            where session_id = ?
              and club_id = '00000000-0000-0000-0000-000000000002'
            """.trimIndent(),
            CROSS_CLUB_SESSION_ID,
        )

    private fun crossClubOutboxCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from notification_event_outbox where aggregate_id = ?",
            Int::class.java,
            CROSS_CLUB_SESSION_ID,
        ) ?: 0

    private fun crossClubAuditCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_change_audit where session_id = ?",
            Int::class.java,
            CROSS_CLUB_SESSION_ID,
        ) ?: 0

    companion object {
        private const val CROSS_CLUB_SESSION_ID = "00000000-0000-0000-0000-0000000092c1"

        private const val CLEANUP_CROSS_CLUB_RESOURCE_SQL = """
            delete from notification_event_outbox
            where aggregate_id = '00000000-0000-0000-0000-0000000092c1';
            delete from host_session_change_audit
            where session_id = '00000000-0000-0000-0000-0000000092c1';
            delete from public_session_publications
            where session_id = '00000000-0000-0000-0000-0000000092c1';
            delete from sessions
            where id = '00000000-0000-0000-0000-0000000092c1';
        """

        private const val INSERT_CROSS_CLUB_RESOURCE_SQL = """
            insert into sessions (
              id, club_id, number, title, book_title, book_author,
              session_date, start_time, end_time, location_label,
              question_deadline_at, state, visibility
            )
            values (
              '00000000-0000-0000-0000-0000000092c1',
              '00000000-0000-0000-0000-000000000002',
              921,
              '921회차 · 클럽 격리 검증 책',
              '클럽 격리 검증 책',
              '검증 저자',
              '2026-12-21',
              '20:00:00',
              '22:00:00',
              '온라인',
              '2026-12-20 14:59:00.000000',
              'CLOSED',
              'MEMBER'
            );
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (
              '00000000-0000-0000-0000-0000000092c2',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-0000000092c1',
              '클럽 격리 검증용 공개 요약입니다.',
              false,
              'MEMBER',
              null
            );
        """
    }
}
