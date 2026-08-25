package com.readmates.session.api

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
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import tools.jackson.databind.JsonNode
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_REVISION_CONTRACT_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_REVISION_CONTRACT_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionRevisionContractDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    @Test
    fun `concurrent basic saves from the same revision keep one winner`() {
        val sessionId = createDraft("동시 저장 원본")
        val start = CountDownLatch(1)
        val ready = CountDownLatch(2)
        val pool = Executors.newFixedThreadPool(2)
        val statuses = IntArray(2)
        try {
            listOf("승자 제목" to 0, "패자 제목" to 1).forEach { (title, index) ->
                pool.submit {
                    ready.countDown()
                    check(start.await(5, TimeUnit.SECONDS))
                    val result =
                        mockMvc
                            .patch("/api/host/sessions/$sessionId") {
                                withHost()
                                contentType = MediaType.APPLICATION_JSON
                                content = sessionJson(title, expectedRevision = 0)
                            }.andReturn()
                    statuses[index] = result.response.status
                }
            }
            check(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            pool.shutdown()
            check(pool.awaitTermination(15, TimeUnit.SECONDS))
        } finally {
            pool.shutdownNow()
        }

        assertThat(statuses.toList()).containsExactlyInAnyOrder(200, 409)
        val winner =
            mockMvc
                .get("/api/host/sessions/$sessionId") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
                .get("title")
                .asString()
        assertThat(winner).isIn("승자 제목", "패자 제목")
        assertThat(sessionRevision(sessionId)).isEqualTo(1)
        assertThat(countAudit(sessionId, "BASIC_INFO_UPDATED")).isEqualTo(1)
        assertThat(publicationVersionRowCount(sessionId)).isEqualTo(1)
    }

    @Test
    fun `stale open close reverse trash and restore create no side effects`() {
        val sessionId = createDraft("개정 충돌 초안")
        patchTitle(sessionId, "바뀐 제목", expectedRevision = 0)

        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(0)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
                jsonPath("$.current.sessionRevision") { value(1) }
                jsonPath("$.changedByDisplay") { value("호스트") }
            }
        assertThat(findState(sessionId)).isEqualTo("DRAFT")
        assertThat(countLifecycle(sessionId)).isZero()

        open(sessionId, expectedRevision = 1)
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(1)
            }.andExpect { status { isConflict() } }
        assertThat(findState(sessionId)).isEqualTo("OPEN")

        close(sessionId, expectedRevision = 2)
        mockMvc
            .post("/api/host/sessions/$sessionId/reopen") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(2)
            }.andExpect { status { isConflict() } }
        assertThat(findState(sessionId)).isEqualTo("CLOSED")

        val trashable = createDraft("휴지통 개정")
        patchTitle(trashable, "휴지통 변경", expectedRevision = 0)
        mockMvc
            .delete("/api/host/sessions/$trashable") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(0)
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }
        assertThat(countRows("sessions", "id = '$trashable' and deleted_at is null")).isEqualTo(1)
        assertThat(countLifecycle(trashable)).isZero()

        val restorable = createDraft("복원 개정")
        mockMvc
            .delete("/api/host/sessions/$restorable") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(0)
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$restorable/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(0)
            }.andExpect { status { isConflict() } }
        assertThat(countRows("sessions", "id = '$restorable' and deleted_at is not null")).isEqualTo(1)
    }

    @Test
    fun `stale attendance undo does not write audit or change the row`() {
        val sessionId = createDraft("출석 복원 개정")
        open(sessionId, expectedRevision = 0)
        val changeId = confirmAttendance(sessionId, HOST_MEMBERSHIP_ID, "ABSENT")
        val preview = previewRestore(sessionId, changeId)
        val hash = preview.get("expectedCurrentHash").asString()
        val auditBefore = countAudit(sessionId, "ATTENDANCE_UPDATED")
        val revisionBefore = attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)

        val conflict =
            mockMvc
                .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "expectedCurrentHash":"$hash",
                          "membershipId":"$HOST_MEMBERSHIP_ID",
                          "expectedAttendanceRevision":0
                        }
                        """.trimIndent()
                }.andExpect {
                    status { isConflict() }
                    jsonPath("$.code") { value("REVISION_CONFLICT") }
                }.andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("ABSENT")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(revisionBefore)
        assertThat(countAudit(sessionId, "ATTENDANCE_UPDATED")).isEqualTo(auditBefore)
        assertThat(conflict.get("current").get("sessionRevision").asLong()).isEqualTo(sessionRevision(sessionId))
        assertThat(conflict.get("current").get("sessionRevision").asLong()).isGreaterThan(0)
        assertThat(conflict.get("changedAt").isNull).isFalse()
    }

    @Test
    fun `attendance undo without expected revision is rejected and writes nothing`() {
        val sessionId = createDraft("출석 복원 필수 개정")
        open(sessionId, expectedRevision = 0)
        val changeId = confirmAttendance(sessionId, HOST_MEMBERSHIP_ID, "ABSENT")
        val preview = previewRestore(sessionId, changeId)
        val hash = preview.get("expectedCurrentHash").asString()
        val auditBefore = countAudit(sessionId, "ATTENDANCE_UPDATED")
        val revisionBefore = attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)

        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedCurrentHash":"$hash",
                      "membershipId":"$HOST_MEMBERSHIP_ID"
                    }
                    """.trimIndent()
            }.andExpect {
                status { isBadRequest() }
            }
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("ABSENT")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(revisionBefore)
        assertThat(countAudit(sessionId, "ATTENDANCE_UPDATED")).isEqualTo(auditBefore)
    }

    @Test
    fun `trashed sessions stay not found instead of revision conflict`() {
        val sessionId = createDraft("휴지통 개정 404")
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(0)
            }.andExpect { status { isOk() } }
        val trashedRevision = sessionRevision(sessionId)

        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = sessionJson("휴지통 패치", expectedRevision = trashedRevision)
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(0)
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(trashedRevision)
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
            }
        mockMvc
            .post("/api/host/sessions/$sessionId/publish") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(trashedRevision)
            }.andExpect {
                status { isNotFound() }
                jsonPath("$.code") { value("SESSION_NOT_FOUND") }
            }
    }

    private fun createDraft(title: String): String {
        val body =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = sessionJson(title)
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(body).get("sessionId").asString()
    }

    private fun patchTitle(
        sessionId: String,
        title: String,
        expectedRevision: Long,
    ) {
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = sessionJson(title, expectedRevision)
            }.andExpect { status { isOk() } }
    }

    private fun open(
        sessionId: String,
        expectedRevision: Long,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(expectedRevision)
            }.andExpect { status { isOk() } }
    }

    private fun close(
        sessionId: String,
        expectedRevision: Long,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = revisionJson(expectedRevision)
            }.andExpect { status { isOk() } }
    }

    private fun confirmAttendance(
        sessionId: String,
        membershipId: String,
        status: String,
    ): String =
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    [{
                      "membershipId":"$membershipId","attendanceStatus":"$status",
                      "expectedAttendanceRevision":0
                    }]
                    """.trimIndent()
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let(jsonMapper::readTree)
            .get("changeReceipt")
            .get("changeId")
            .asString()

    private fun previewRestore(
        sessionId: String,
        changeId: String,
    ): JsonNode =
        mockMvc
            .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") { withHost() }
            .andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let(jsonMapper::readTree)

    private fun sessionJson(
        title: String,
        expectedRevision: Long? = null,
    ): String {
        val revisionField =
            expectedRevision?.let { ",\"expectedSessionRevision\":$it" }.orEmpty()
        return """
            {
              "title": "$title",
              "bookTitle": "개정 책",
              "bookAuthor": "개정 저자",
              "date": "2026-09-02",
              "locationLabel": "온라인"
              $revisionField
            }
            """.trimIndent()
    }

    private fun revisionJson(expectedRevision: Long) = """{"expectedSessionRevision":$expectedRevision}"""

    private fun sessionRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select session_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing session revision")

    private fun attendanceRevision(
        sessionId: String,
        membershipId: String,
    ): Long =
        jdbcTemplate.queryForObject(
            """
            select attendance_revision from session_participants
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            Long::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing attendance revision")

    private fun attendanceStatus(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select attendance_status from session_participants
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing attendance")

    private fun findState(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select state from sessions where id = ?",
            String::class.java,
            sessionId,
        ) ?: error("missing state")

    private fun countAudit(
        sessionId: String,
        action: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_change_audit where session_id = ? and action_type = ?",
            Int::class.java,
            sessionId,
            action,
        ) ?: 0

    private fun countLifecycle(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_lifecycle_audit where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun publicationVersionRowCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_publication_versions where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun countRows(
        table: String,
        where: String,
    ): Int = jdbcTemplate.queryForObject("select count(*) from $table where $where", Int::class.java) ?: 0

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    private companion object {
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
    }
}

private const val CLEANUP_REVISION_CONTRACT_SQL = """
    delete from host_session_change_audit
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
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_publication_versions
    where session_id in (
      select id from sessions
      where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
