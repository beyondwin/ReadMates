package com.readmates.session.api

import com.readmates.session.application.port.`in`.PurgeExpiredHostSessionTrashUseCase
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
import org.springframework.test.web.servlet.put

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_IDEMPOTENCY_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_IDEMPOTENCY_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionIdempotencyDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val purgeExpiredHostSessionTrash: PurgeExpiredHostSessionTrashUseCase,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    @Test
    fun `envelope rejects missing extra and wrong-domain expected revisions`() {
        val created = createDraft("envelope-validate", "key-create-valid-01")
        val sessionId = created.first
        mockMvc
            .post("/api/host/sessions") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-create-extra-01",
                        """{"sessionRevision":0}""",
                        sessionCommand("extra-create"),
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-save-missing-01", "{}", sessionCommand("missing-rev"))
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-save-extra-01",
                        """{"sessionRevision":0,"exposureRevision":0}""",
                        sessionCommand("extra-rev"),
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-open-extra-01", """{"sessionRevision":0,"publicationRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-close-missing-01", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-close-extra-01",
                        """{"sessionRevision":0,"participantSetRevision":0,"attendanceSnapshotId":"att:","publicationRevision":0}""",
                        "{}",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-extra-01",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}],"sessionRevision":0}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId/access-scope") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-access-extra-01",
                        """{"exposureRevision":0,"sessionRevision":0}""",
                        """{"accessScope":"GUEST_READABLE"}""",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .put("/api/host/sessions/$sessionId/publication") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-pub-extra-01",
                        """{"publicationRevision":0,"sessionRevision":0}""",
                        """{"publicSummary":"요약","siteVisibility":"HIDDEN"}""",
                    )
            }.andExpect { status { isBadRequest() } }
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-trash-extra-01", """{"sessionRevision":0,"exposureRevision":1}""", "{}")
            }.andExpect { status { isBadRequest() } }
    }

    @Test
    fun `same create key returns one session publication version and no public content`() {
        val key = "key-create-dup-0001"
        val first =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand("중복 생성"))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        val sessionId = jsonMapper.readTree(first).get("sessionId").asString()
        val second =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand("중복 생성"))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        assertThat(jsonMapper.readTree(second).get("sessionId").asString()).isEqualTo(sessionId)
        assertThat(countSessions("title = '중복 생성'")).isEqualTo(1)
        assertThat(publicationVersionCount(sessionId)).isEqualTo(1)
        assertThat(publicContentCount(sessionId)).isZero()
        assertThat(receiptCount(sessionId)).isEqualTo(1)
        assertThat(auditCount(sessionId)).isZero()
        val reconciled =
            mockMvc
                .get("/api/host/mutations/SESSION_CREATE/create/$key") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(reconciled.get("status").asString()).isEqualTo("COMMITTED")
        assertThat(reconciled.get("receipt").get("resourceId").asString()).isEqualTo(sessionId)
        assertThat(reconciled.get("receipt").get("notificationDecision").asString()).isEqualTo("NOT_SENT")
    }

    @Test
    fun `same key different payload conflicts and writes nothing extra`() {
        val key = "key-create-conflict-01"
        mockMvc
            .post("/api/host/sessions") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, "{}", sessionCommand("원본 생성"))
            }.andExpect { status { isCreated() } }
        mockMvc
            .post("/api/host/sessions") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, "{}", sessionCommand("다른 생성"))
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("IDEMPOTENCY_KEY_REUSED") }
            }
        assertThat(countSessions("title = '원본 생성'")).isEqualTo(1)
        assertThat(countSessions("title = '다른 생성'")).isZero()
    }

    @Test
    fun `duplicate basic save attendance and close keep one side effect`() {
        val created = createDraft("중복 저장", "key-basic-orig-0001")
        val sessionId = created.first
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-basic-dup-0001", """{"sessionRevision":0}""", sessionCommand("한번만 저장"))
            }.andExpect { status { isOk() } }
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-basic-dup-0001", """{"sessionRevision":0}""", sessionCommand("한번만 저장"))
            }.andExpect { status { isOk() } }
        assertThat(sessionRevision(sessionId)).isEqualTo(1)
        assertThat(auditCount(sessionId, "BASIC_INFO_UPDATED")).isEqualTo(1)

        open(sessionId, 1, "key-open-dup-0001")
        open(sessionId, 1, "key-open-dup-0001")
        assertThat(findState(sessionId)).isEqualTo("OPEN")

        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-dup-0001",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-att-dup-0001",
                        """{"rows":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceRevision":0}]}""",
                        """{"entries":[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED","expectedAttendanceRevision":0}]}""",
                    )
            }.andExpect { status { isOk() } }
        assertThat(attendanceAuditCount(sessionId)).isEqualTo(1)

        val snapshot = attendanceSnapshotId(sessionId)
        val setRevision = participantSetRevision(sessionId)
        val sessionRev = sessionRevision(sessionId)
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-close-dup-0001",
                        """{"sessionRevision":$sessionRev,"participantSetRevision":$setRevision,"attendanceSnapshotId":"$snapshot"}""",
                        "{}",
                    )
            }.andExpect { status { isOk() } }
        mockMvc
            .post("/api/host/sessions/$sessionId/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    envelope(
                        "key-close-dup-0001",
                        """{"sessionRevision":$sessionRev,"participantSetRevision":$setRevision,"attendanceSnapshotId":"$snapshot"}""",
                        "{}",
                    )
            }.andExpect { status { isOk() } }
        assertThat(findState(sessionId)).isEqualTo("CLOSED")
        assertThat(lifecycleCount(sessionId, "CLOSED")).isEqualTo(1)
    }

    @Test
    fun `hard delete keeps redacted receipt and unauthorized lookup hides detail`() {
        val created = createDraft("삭제 영수증", "key-trash-orig-0001")
        val sessionId = created.first
        mockMvc
            .delete("/api/host/sessions/$sessionId") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope("key-trash-dup-0001", """{"sessionRevision":0}""", "{}")
            }.andExpect { status { isOk() } }
        jdbcTemplate.update(
            "update sessions set purge_after = timestampadd(day, -1, utc_timestamp(6)) where id = ?",
            sessionId,
        )
        assertThat(purgeExpiredHostSessionTrash.purgeExpired(50)).isGreaterThanOrEqualTo(1)
        assertThat(countSessions("id = '$sessionId'")).isZero()
        val bytes =
            jdbcTemplate.queryForObject(
                "select count(*) from host_session_mutation_receipts where resource_id = ?",
                Int::class.java,
                sessionId,
            ) ?: 0
        assertThat(bytes).isGreaterThanOrEqualTo(1)
        val reconciled =
            mockMvc
                .get("/api/host/mutations/SESSION_TRASH/$sessionId/key-trash-dup-0001") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        assertThat(reconciled.get("status").asString()).isEqualTo("COMMITTED")
        assertThat(reconciled.get("receipt").get("resourceId").asString()).isEqualTo(sessionId)
        assertThat(reconciled.toString()).doesNotContain("meet.example")
        mockMvc
            .get("/api/host/mutations/SESSION_TRASH/$sessionId/key-trash-dup-0001") {
                with(user("member5@example.com"))
            }.andExpect {
                status { isForbidden() }
            }.andExpect {
                jsonPath("$.receipt") { doesNotExist() }
            }
        mockMvc
            .get("/api/host/mutations/SESSION_CREATE/create/missing-key-01") { withHost() }
            .andExpect { status { isOk() } }
            .andExpect { jsonPath("$.status") { value("NOT_EXECUTED") } }
            .andExpect { jsonPath("$.receipt") { doesNotExist() } }
    }

    private fun createDraft(
        title: String,
        key: String,
    ): Pair<String, String> {
        val body =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content = envelope(key, "{}", sessionCommand(title))
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
        return jsonMapper.readTree(body).get("sessionId").asString() to key
    }

    private fun open(
        sessionId: String,
        revision: Long,
        key: String,
    ) {
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = envelope(key, """{"sessionRevision":$revision}""", "{}")
            }.andExpect { status { isOk() } }
    }

    private fun envelope(
        key: String,
        expected: String,
        command: String,
    ) = """{"idempotencyKey":"$key","expected":$expected,"command":$command}"""

    private fun sessionCommand(title: String) =
        """
        {
          "title": "$title",
          "bookTitle": "영수증 책",
          "bookAuthor": "영수증 저자",
          "date": "2026-09-04",
          "locationLabel": "온라인"
        }
        """.trimIndent()

    private fun sessionRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select session_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing revision")

    private fun participantSetRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select participant_set_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing set revision")

    private fun attendanceSnapshotId(sessionId: String): String {
        val rows =
            jdbcTemplate.query(
                """
                select membership_id, attendance_revision
                from session_participants
                where session_id = ? and participation_status = 'ACTIVE'
                order by membership_id
                """.trimIndent(),
                { rs, _ -> "${rs.getString("membership_id")}:${rs.getLong("attendance_revision")}" },
                sessionId,
            )
        return "att:${rows.joinToString(",")}"
    }

    private fun findState(sessionId: String): String =
        jdbcTemplate.queryForObject(
            "select state from sessions where id = ?",
            String::class.java,
            sessionId,
        ) ?: error("missing state")

    private fun countSessions(where: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from sessions where club_id = '$CLUB_ID' and number > 7 and $where",
            Int::class.java,
        ) ?: 0

    private fun publicationVersionCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from session_publication_versions where session_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun publicContentCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*) from public_session_publications
            where session_id = ? and trim(public_summary) <> ''
            """.trimIndent(),
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun receiptCount(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_mutation_receipts where resource_id = ?",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun auditCount(
        sessionId: String,
        action: String? = null,
    ): Int {
        val sql =
            if (action == null) {
                "select count(*) from host_session_change_audit where session_id = ?"
            } else {
                "select count(*) from host_session_change_audit where session_id = ? and action_type = ?"
            }
        return if (action == null) {
            jdbcTemplate.queryForObject(sql, Int::class.java, sessionId) ?: 0
        } else {
            jdbcTemplate.queryForObject(sql, Int::class.java, sessionId, action) ?: 0
        }
    }

    private fun attendanceAuditCount(sessionId: String): Int = auditCount(sessionId, "ATTENDANCE_UPDATED")

    private fun lifecycleCount(
        sessionId: String,
        action: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_lifecycle_audit where session_id = ? and action_type = ?",
            Int::class.java,
            sessionId,
            action,
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

private const val CLEANUP_IDEMPOTENCY_SQL = """
    delete from host_session_mutation_receipts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and resource_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from mutation_idempotency_keys
    where club_id = '00000000-0000-0000-0000-000000000001'
      and actor_membership_id = '00000000-0000-0000-0000-000000000201';
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
    delete from public_session_publications
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from sessions
    where club_id = '00000000-0000-0000-0000-000000000001' and number > 7;
"""
