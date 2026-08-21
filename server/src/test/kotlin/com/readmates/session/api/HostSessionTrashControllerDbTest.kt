package com.readmates.session.api

import com.readmates.session.application.model.HOST_SESSION_TRASH_RETENTION_DAYS
import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
import com.readmates.shared.paging.CursorCodec
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
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
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.Duration
import java.time.OffsetDateTime

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_TRASH_SESSIONS_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_TRASH_SESSIONS_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionTrashControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val purgeExpiredHostSessionTrash: PurgeExpiredHostSessionTrashUseCase,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper = tools.jackson.databind.ObjectMapper()

    @Test
    fun `delete preserves children for seven days and restore returns the active session`() {
        val first = createDraft("8회차 · 휴지통 첫째")
        val second = createDraft("9회차 · 휴지통 둘째")
        insertQuestion(first)

        val trashed =
            mockMvc
                .delete("/api/host/sessions/$first") { withHost() }
                .andExpect {
                    status { isOk() }
                    jsonPath("$.trashed") { value(true) }
                    jsonPath("$.sessionNumber") { exists() }
                }.andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val deletedAt = OffsetDateTime.parse(trashed.get("deletedAt").asString())
        val purgeAfter = OffsetDateTime.parse(trashed.get("purgeAfter").asString())
        assertThat(Duration.between(deletedAt, purgeAfter)).isEqualTo(Duration.ofDays(HOST_SESSION_TRASH_RETENTION_DAYS))
        assertThat(countRows("questions", "session_id = '$first'")).isEqualTo(1)
        assertThat(countRows("sessions", "id = '$first' and deleted_at is not null")).isEqualTo(1)

        mockMvc.get("/api/host/sessions/$first") { withHost() }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/sessions/current") { with(user("member5@example.com")) }.andExpect { status { isOk() } }
        mockMvc.get("/api/public/sessions/$first").andExpect { status { isNotFound() } }
        mockMvc.get("/api/public/clubs/reading-sai/browse/sessions/current").andExpect { status { isOk() } }

        mockMvc
            .delete("/api/host/sessions/$second") { withHost() }
            .andExpect { status { isOk() } }

        val firstPage =
            mockMvc
                .get("/api/host/sessions/trash") {
                    withHost()
                    param("limit", "1")
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items.length()") { value(1) }
                    jsonPath("$.nextCursor") { exists() }
                }.andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val cursor = firstPage.get("nextCursor").asString()
        val decoded = CursorCodec.decode(cursor) ?: error("trash cursor did not decode")
        assertThat(decoded.keys).containsExactly("clubId", "deletedAt", "id")

        mockMvc
            .get("/api/host/sessions/trash") {
                withHost()
                param("limit", "1")
                param("cursor", cursor)
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(1) }
                jsonPath("$.items[0].sessionId") {
                    value(org.hamcrest.Matchers.not(firstPage.get("items").get(0).get("sessionId").asString()))
                }
            }

        mockMvc.get("/api/host/sessions/$first/trash") { withHost() }.andExpect {
            status { isOk() }
            jsonPath("$.trashed") { value(true) }
            jsonPath("$.counts.questions") { value(1) }
        }

        mockMvc
            .post("/api/host/sessions/$first/restore") { withHost() }
            .andExpect {
                status { isOk() }
                jsonPath("$.sessionId") { value(first) }
                jsonPath("$.state") { value("DRAFT") }
            }
        mockMvc.get("/api/host/sessions/$first") { withHost() }.andExpect { status { isOk() } }
        assertThat(countRows("questions", "session_id = '$first'")).isEqualTo(1)
        assertThat(
            countRows(
                "host_session_lifecycle_audit",
                "session_id = '$first' and action_type = 'RESTORED' and reason_code = 'OPERATIONAL_RECOVERY'",
            ),
        ).isEqualTo(1)
    }

    @Test
    fun `open restore conflicts with the existing open session and members cannot use trash`() {
        val sessionId = createDraft("10회차 · 열린 휴지통")
        jdbcTemplate.update("update sessions set state = 'OPEN' where id = ?", sessionId)
        mockMvc.delete("/api/host/sessions/$sessionId") { withHost() }.andExpect { status { isOk() } }
        val openId = createDraft("11회차 · 다른 열린 모임")
        jdbcTemplate.update("update sessions set state = 'OPEN' where id = ?", openId)

        mockMvc
            .post("/api/host/sessions/$sessionId/restore") { withHost() }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_OPEN_ALREADY_EXISTS") }
                jsonPath("$.openSessionId") { value(openId) }
            }

        mockMvc.get("/api/host/sessions/trash") { with(user("member5@example.com")) }.andExpect {
            status { isForbidden() }
        }
        mockMvc.get("/api/host/sessions/$sessionId/trash") { with(user("member5@example.com")) }.andExpect {
            status { isForbidden() }
        }
        mockMvc.post("/api/host/sessions/$sessionId/restore") {
            with(user("member5@example.com"))
            with(csrf())
        }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `purge removes children after expiry and restore then returns gone`() {
        val sessionId = createDraft("11회차 · 만료 휴지통")
        insertQuestion(sessionId)
        mockMvc.delete("/api/host/sessions/$sessionId") { withHost() }.andExpect { status { isOk() } }
        jdbcTemplate.update(
            "update sessions set purge_after = timestampadd(day, -1, utc_timestamp(6)) where id = ?",
            sessionId,
        )

        mockMvc.post("/api/host/sessions/$sessionId/restore") { withHost() }.andExpect {
            status { isGone() }
            jsonPath("$.code") { value("HOST_SESSION_TRASH_EXPIRED") }
        }

        assertThat(countRows("questions", "session_id = '$sessionId'")).isEqualTo(1)
        assertThat(purgeExpiredHostSessionTrash.purgeExpired(50)).isGreaterThanOrEqualTo(1)
        assertThat(purgeExpiredHostSessionTrash.purgeExpired(50)).isGreaterThanOrEqualTo(0)
        assertThat(countRows("sessions", "id = '$sessionId'")).isZero()
        assertThat(countRows("questions", "session_id = '$sessionId'")).isZero()
        assertThat(
            countRows(
                "host_session_lifecycle_audit",
                "session_id = '$sessionId' and action_type = 'DELETED'",
            ),
        ).isEqualTo(1)

        mockMvc.get("/api/host/sessions/$sessionId/trash") { withHost() }.andExpect {
            status { isGone() }
            jsonPath("$.code") { value("HOST_SESSION_TRASH_EXPIRED") }
        }
        mockMvc.post("/api/host/sessions/$sessionId/restore") { withHost() }.andExpect {
            status { isGone() }
            jsonPath("$.code") { value("HOST_SESSION_TRASH_EXPIRED") }
        }
        mockMvc.get("/api/host/sessions/$sessionId") { withHost() }.andExpect { status { isNotFound() } }
        mockMvc.get("/api/public/sessions/$sessionId").andExpect { status { isNotFound() } }
    }

    private fun createDraft(title: String): String {
        val response =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "$title",
                          "bookTitle": "휴지통 책",
                          "bookAuthor": "휴지통 저자",
                          "date": "2026-09-02"
                        }
                        """.trimIndent()
                }.andExpect { status { isCreated() } }
                .andReturn()
        return """"sessionId"\s*:\s*"([^"]+)""""
            .toRegex()
            .find(response.response.contentAsString)
            ?.groupValues
            ?.get(1)
            ?: error("created session response did not include a sessionId")
    }

    private fun insertQuestion(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text)
            values (uuid(), ?, ?, ?, 1, '휴지통 보존 질문')
            """.trimIndent(),
            CLUB_ID,
            sessionId,
            HOST_MEMBERSHIP_ID,
        )
    }

    private fun countRows(
        tableName: String,
        whereClause: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $tableName where $whereClause",
            Int::class.java,
        ) ?: 0

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
    }
}

private const val CLEANUP_TRASH_SESSIONS_SQL = """
    delete from questions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from host_session_lifecycle_audit
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_participants
    where session_id in (
      select id from sessions
      where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
