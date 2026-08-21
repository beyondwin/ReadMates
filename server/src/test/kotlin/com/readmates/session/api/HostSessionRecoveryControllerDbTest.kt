package com.readmates.session.api

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.slf4j.LoggerFactory
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
import org.springframework.test.web.servlet.post
import tools.jackson.databind.JsonNode

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_RECOVERY_SESSIONS_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_RECOVERY_SESSIONS_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionRecoveryControllerDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper = tools.jackson.databind.ObjectMapper()

    @Test
    fun `host previews and restores a basic change without overwriting newer work`() {
        val sessionId = createDraftSession()
        val changeId = patchTitle(sessionId, "복원 대상 제목")
        val preview = previewRestore(sessionId, changeId)

        assertThat(preview.get("canRestore").booleanValue()).isTrue()
        assertThat(preview.get("kind").asString()).isEqualTo("BASIC_INFO")
        assertThat(preview.get("expectedCurrentHash").asString()).matches("[0-9a-f]{64}")
        val restore =
            mockMvc
                .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                    with(user("host@example.com"))
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"expectedCurrentHash":"${preview.get("expectedCurrentHash").asString()}"}"""
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.kind") { value("BASIC_INFO") }
                    jsonPath("$.undoAvailable") { value(true) }
                }.andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)

        mockMvc.get("/api/host/sessions/$sessionId") { with(user("host@example.com")) }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("7회차 · 테스트 책") }
        }
        val lineage =
            jdbcTemplate.queryForObject(
                "select restored_from_change_id from host_session_change_audit where id = ?",
                String::class.java,
                restore.get("changeId").asString(),
            )
        assertThat(lineage).isEqualTo(changeId)
    }

    @Test
    fun `interleaved edit returns stale conflict`() {
        val sessionId = createDraftSession()
        val changeId = patchTitle(sessionId, "복원 대상 제목")
        val hash = previewRestore(sessionId, changeId).get("expectedCurrentHash").asString()
        patchTitle(sessionId, "더 새로운 제목")

        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedCurrentHash":"$hash"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("HOST_SESSION_RESTORE_STALE") }
            }
        mockMvc.get("/api/host/sessions/$sessionId") { with(user("host@example.com")) }.andExpect {
            jsonPath("$.title") { value("더 새로운 제목") }
        }
    }

    @Test
    fun `preview redacts meeting credentials from json and logs`() {
        val sessionId = createDraftSession()
        val changeId = patchMeeting(sessionId)
        val logs = captureLogs()
        val body =
            mockMvc
                .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") {
                    with(user("host@example.com"))
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
        val messages = logs.events.map { it.formattedMessage }
        logs.close()
        val preview = jsonMapper.readTree(body)
        val meeting =
            preview.get("items").let { items ->
                (0 until items.size())
                    .map { items.get(it) }
                    .first { node -> node.get("field").asString() == "meetingUrl" }
            }
        assertThat(meeting.get("sensitive").booleanValue()).isTrue()
        assertThat(meeting.get("currentValue").isNull).isTrue()
        assertThat(meeting.get("targetValue").isNull).isTrue()
        assertThat(body + messages.joinToString()).doesNotContain(MEETING_URL, MEETING_PASSCODE)
    }

    @Test
    fun `member cannot preview another hosts session change`() {
        val sessionId = createDraftSession()
        val changeId = patchTitle(sessionId, "복원 대상 제목")
        mockMvc
            .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") {
                with(user("member1@example.com"))
            }.andExpect { status { isForbidden() } }
    }

    @Test
    fun `does not expose another club change`() {
        insertOutsideClubChange()
        mockMvc
            .get("/api/host/sessions/$OUTSIDE_SESSION_ID/changes/$OUTSIDE_CHANGE_ID/restore-preview") {
                with(user("host@example.com"))
            }.andExpect { status { isNotFound() } }
    }

    @Test
    fun `attendance restore reverses every transition`() {
        val sessionId = createOpenSession()
        val changeId = confirmAttendance(sessionId, HOST_MEMBERSHIP_ID, "ABSENT")
        val preview = previewRestore(sessionId, changeId)
        assertThat(preview.get("kind").asString()).isEqualTo("ATTENDANCE")
        assertThat(preview.get("canRestore").booleanValue()).isTrue()
        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedCurrentHash":"${preview.get("expectedCurrentHash").asString()}"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.kind") { value("ATTENDANCE") }
            }
        val status =
            jdbcTemplate.queryForObject(
                """
                select attendance_status from session_participants
                where session_id = ? and membership_id = ?
                """.trimIndent(),
                String::class.java,
                sessionId,
                HOST_MEMBERSHIP_ID,
            )
        assertThat(status).isEqualTo("UNKNOWN")
    }

    @Test
    fun `legacy attendance without snapshots is not restorable`() {
        val sessionId = createOpenSession()
        val changeId = insertLegacyAttendanceChange(sessionId)
        val preview = previewRestore(sessionId, changeId)

        assertThat(preview.get("canRestore").booleanValue()).isFalse()
        assertThat(preview.get("blockedReason").asString()).isEqualTo("SNAPSHOT_UNAVAILABLE")
        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedCurrentHash":"${preview.get("expectedCurrentHash").asString()}"}"""
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("HOST_SESSION_CHANGE_NOT_RESTORABLE") }
            }
    }

    private fun previewRestore(
        sessionId: String,
        changeId: String,
    ): JsonNode =
        mockMvc
            .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") {
                with(user("host@example.com"))
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let(jsonMapper::readTree)

    private fun createDraftSession(): String {
        val response =
            mockMvc
                .post("/api/host/sessions") {
                    with(user("host@example.com"))
                    with(csrf())
                    contentType = MediaType.APPLICATION_JSON
                    content = sessionJson("7회차 · 테스트 책")
                }.andExpect { status { isCreated() } }
                .andReturn()
        return """"sessionId"\s*:\s*"([^"]+)""""
            .toRegex()
            .find(response.response.contentAsString)
            ?.groupValues
            ?.get(1)
            ?: error("created session response did not include a sessionId")
    }

    private fun createOpenSession(): String {
        val sessionId = createDraftSession()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                with(user("host@example.com"))
                with(csrf())
            }.andExpect { status { isOk() } }
        return sessionId
    }

    private fun patchTitle(
        sessionId: String,
        title: String,
    ): String =
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = sessionJson(title)
            }.andExpect {
                status { isOk() }
                jsonPath("$.changeReceipt.changeId") { exists() }
            }.andReturn()
            .response
            .contentAsString
            .let(jsonMapper::readTree)
            .get("changeReceipt")
            .get("changeId")
            .asString()

    private fun patchMeeting(sessionId: String): String =
        mockMvc
            .patch("/api/host/sessions/$sessionId") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = sessionJson("7회차 · 테스트 책", MEETING_URL, MEETING_PASSCODE)
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let(jsonMapper::readTree)
            .get("changeReceipt")
            .get("changeId")
            .asString()

    private fun confirmAttendance(
        sessionId: String,
        membershipId: String,
        status: String,
    ): String =
        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                with(user("host@example.com"))
                with(csrf())
                contentType = MediaType.APPLICATION_JSON
                content = """[{"membershipId":"$membershipId","attendanceStatus":"$status"}]"""
            }.andExpect { status { isOk() } }
            .andReturn()
            .response
            .contentAsString
            .let(jsonMapper::readTree)
            .get("changeReceipt")
            .get("changeId")
            .asString()

    private fun insertLegacyAttendanceChange(sessionId: String): String {
        val changeId = LEGACY_ATTENDANCE_CHANGE_ID
        val transitions =
            """[{"membershipId":"$HOST_MEMBERSHIP_ID","from":"UNKNOWN","to":"ABSENT"}]"""
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id, action_type, changed_fields_json
            ) values (?, '00000000-0000-0000-0000-000000000001', ?, ?, 'ATTENDANCE_UPDATED', ?)
            """.trimIndent(),
            changeId,
            sessionId,
            HOST_MEMBERSHIP_ID,
            transitions,
        )
        return changeId
    }

    private fun insertOutsideClubChange() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'recovery.outside@example.test', 'Outside Recovery Host', 'Outside', 'PASSWORD')
            """.trimIndent(),
            OUTSIDE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Outside', 'globe-notebook')
            """.trimIndent(),
            OUTSIDE_MEMBERSHIP_ID,
            OUTSIDE_CLUB_ID,
            OUTSIDE_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            ) values (
              ?, ?, 91, 'Outside recovery', 'Outside book', 'Outside author', '2026-05-20',
              '19:00:00', '21:00:00', 'Online', '2026-05-19 12:00:00', 'DRAFT', 'HOST_ONLY'
            )
            """.trimIndent(),
            OUTSIDE_SESSION_ID,
            OUTSIDE_CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id, action_type,
              changed_fields_json, before_snapshot_json, after_snapshot_json
            ) values (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["title"]', '{"title":"a"}', '{"title":"b"}')
            """.trimIndent(),
            OUTSIDE_CHANGE_ID,
            OUTSIDE_CLUB_ID,
            OUTSIDE_SESSION_ID,
            OUTSIDE_MEMBERSHIP_ID,
        )
    }

    private fun sessionJson(
        title: String,
        meetingUrl: String? = null,
        meetingPasscode: String? = null,
    ): String {
        val meeting =
            if (meetingUrl == null) {
                ""
            } else {
                """, "meetingUrl": "$meetingUrl", "meetingPasscode": "$meetingPasscode""""
            }
        return """
            {
              "title": "$title",
              "bookTitle": "테스트 책",
              "bookAuthor": "테스트 저자",
              "date": "2026-05-20",
              "locationLabel": "온라인"$meeting
            }
            """.trimIndent()
    }

    private fun captureLogs(): RecoveryLogCapture {
        val logger = LoggerFactory.getLogger("com.readmates.session") as Logger
        val appender = ListAppender<ILoggingEvent>()
        appender.start()
        logger.level = Level.DEBUG
        logger.addAppender(appender)
        return RecoveryLogCapture(logger, appender)
    }

    private companion object {
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
        const val OUTSIDE_CLUB_ID = "00000000-0000-0000-0000-000000000002"
        const val OUTSIDE_USER_ID = "00000000-0000-0000-0000-00000000a101"
        const val OUTSIDE_MEMBERSHIP_ID = "00000000-0000-0000-0000-00000000a201"
        const val OUTSIDE_SESSION_ID = "00000000-0000-0000-0000-00000000a301"
        const val OUTSIDE_CHANGE_ID = "00000000-0000-0000-0000-00000000a401"
        const val LEGACY_ATTENDANCE_CHANGE_ID = "00000000-0000-0000-0000-00000000a501"
        const val MEETING_URL = "https://meet.example.invalid/restore-secret"
        const val MEETING_PASSCODE = "restore-passcode-secret"
    }
}

private class RecoveryLogCapture(
    private val logger: Logger,
    private val appender: ListAppender<ILoggingEvent>,
) : AutoCloseable {
    val events: List<ILoggingEvent>
        get() = appender.list

    override fun close() {
        logger.detachAppender(appender)
        appender.stop()
    }
}

private const val CLEANUP_RECOVERY_SESSIONS_SQL = """
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
    delete from session_record_drafts
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_record_revisions
    where club_id = '00000000-0000-0000-0000-000000000001'
      and session_id in (
        select id from sessions
        where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
      );
    delete from session_feedback_documents
    where session_id in (
      select id from sessions
      where club_id = '00000000-0000-0000-0000-000000000001' and number > 7
    );
    delete from public_session_publications
    where session_id in (
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
    delete from host_session_change_audit where id = '00000000-0000-0000-0000-00000000a401';
    delete from session_participants where session_id = '00000000-0000-0000-0000-00000000a301';
    delete from sessions where id = '00000000-0000-0000-0000-00000000a301';
    delete from memberships where id = '00000000-0000-0000-0000-00000000a201';
    delete from users where id = '00000000-0000-0000-0000-00000000a101';
"""
