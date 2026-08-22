package com.readmates.session.api

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.model.AttendanceEntryCommand
import com.readmates.session.application.model.ConfirmAttendanceCommand
import com.readmates.session.application.service.HostSessionAttendanceService
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
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
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [CLEANUP_ATTENDANCE_CONCURRENCY_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_ATTENDANCE_CONCURRENCY_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class HostSessionAttendanceConcurrencyDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val attendanceService: HostSessionAttendanceService,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val jsonMapper =
        tools.jackson.databind.json.JsonMapper
            .builder()
            .findAndAddModules()
            .build()

    @Test
    fun `every actual attendance transition is persisted and can return to unknown`() {
        val sessionId = openSession("출석 세 상태")
        setRsvp(sessionId, HOST_MEMBERSHIP_ID, "GOING")
        val transitions =
            listOf(
                "UNKNOWN" to "ATTENDED",
                "ATTENDED" to "ABSENT",
                "ABSENT" to "UNKNOWN",
                "UNKNOWN" to "ABSENT",
                "ABSENT" to "ATTENDED",
                "ATTENDED" to "UNKNOWN",
            )
        transitions.forEachIndexed { index, (from, to) ->
            assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(from)
            confirm(
                sessionId,
                listOf(row(HOST_MEMBERSHIP_ID, to, expectedRevision = index.toLong())),
            )
            assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(to)
            assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(index + 1L)
            assertThat(rsvpStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("GOING")
        }
    }

    @Test
    @Timeout(30)
    fun `same participant concurrent writes keep one winner and no extra audit`() {
        val sessionId = openSession("같은 참여자 충돌")
        val start = CountDownLatch(1)
        val ready = CountDownLatch(2)
        val pool = Executors.newFixedThreadPool(2)
        val statuses = IntArray(2)
        val bodies = arrayOfNulls<String>(2)
        try {
            listOf("ATTENDED" to 0, "ABSENT" to 1).forEach { (status, index) ->
                pool.submit {
                    ready.countDown()
                    check(start.await(5, TimeUnit.SECONDS))
                    val response =
                        mockMvc
                            .post("/api/host/sessions/$sessionId/attendance") {
                                withHost()
                                contentType = MediaType.APPLICATION_JSON
                                content = attendanceJson(row(HOST_MEMBERSHIP_ID, status, expectedRevision = 0))
                            }.andReturn()
                            .response
                    statuses[index] = response.status
                    bodies[index] = response.contentAsString
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
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isIn("ATTENDED", "ABSENT")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(1)
        assertThat(countAudit(sessionId)).isEqualTo(1)
        assertThat(bodies[statuses.indexOf(409)]).contains("REVISION_CONFLICT")
    }

    @Test
    @Timeout(30)
    fun `different participants can persist attendance in parallel`() {
        val sessionId = openSession("다른 참여자 병렬")
        val start = CountDownLatch(1)
        val ready = CountDownLatch(2)
        val pool = Executors.newFixedThreadPool(2)
        val rows =
            listOf(
                HOST_MEMBERSHIP_ID to "ATTENDED",
                MEMBER_MEMBERSHIP_ID to "ABSENT",
            )
        val futures =
            try {
                rows.map { (membershipId, status) ->
                    pool.submit<Int> {
                        ready.countDown()
                        check(start.await(5, TimeUnit.SECONDS))
                        attendanceService
                            .confirmAttendance(
                                ConfirmAttendanceCommand(
                                    host = host,
                                    sessionId = UUID.fromString(sessionId),
                                    entries =
                                        listOf(
                                            AttendanceEntryCommand(
                                                membershipId,
                                                status,
                                                expectedAttendanceRevision = 0,
                                            ),
                                        ),
                                ),
                            ).count
                    }
                }
            } finally {
                check(ready.await(5, TimeUnit.SECONDS))
                start.countDown()
                pool.shutdown()
                check(pool.awaitTermination(15, TimeUnit.SECONDS))
            }

        assertThat(futures.map { it.get(10, TimeUnit.SECONDS) }).containsExactly(1, 1)
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("ATTENDED")
        assertThat(attendanceStatus(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo("ABSENT")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(1)
        assertThat(attendanceRevision(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo(1)
        assertThat(countAudit(sessionId)).isEqualTo(2)
    }

    @Test
    fun `attendance mutation never rewrites rsvp`() {
        val sessionId = openSession("출석과 응답 분리")
        setRsvp(sessionId, HOST_MEMBERSHIP_ID, "MAYBE")
        val rsvpRevisionBefore = attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)

        confirm(sessionId, listOf(row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0)))

        assertThat(rsvpStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("MAYBE")
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("ATTENDED")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(rsvpRevisionBefore + 1)

        setRsvp(sessionId, HOST_MEMBERSHIP_ID, "GOING")
        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("ATTENDED")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(rsvpRevisionBefore + 1)
    }

    @Test
    fun `history restore returns attendance to unknown without rewriting rsvp`() {
        val sessionId = openSession("출석 복원 확인 전")
        setRsvp(sessionId, HOST_MEMBERSHIP_ID, "GOING")
        val changeId =
            confirm(sessionId, listOf(row(HOST_MEMBERSHIP_ID, "ABSENT", expectedRevision = 0)))
                .get("changeReceipt")
                .get("changeId")
                .asString()
        val preview =
            mockMvc
                .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val epochBefore = meetingEpoch()

        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedCurrentHash":"${preview.get("expectedCurrentHash").asString()}",
                      "membershipId":"$HOST_MEMBERSHIP_ID",
                      "expectedAttendanceRevision":${attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)}
                    }
                    """.trimIndent()
            }.andExpect { status { isOk() } }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(rsvpStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("GOING")
        assertThat(meetingEpoch()).isEqualTo(epochBefore + 1)
    }

    @Test
    fun `bulk history restore uses per-row revisions after independent edits`() {
        val sessionId = openSession("일괄 복원 개정")
        setRsvp(sessionId, HOST_MEMBERSHIP_ID, "GOING")
        setRsvp(sessionId, MEMBER_MEMBERSHIP_ID, "MAYBE")
        val changeId =
            confirm(
                sessionId,
                listOf(
                    row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0),
                    row(MEMBER_MEMBERSHIP_ID, "ABSENT", expectedRevision = 0),
                ),
            ).get("changeReceipt")
                .get("changeId")
                .asString()
        confirm(sessionId, listOf(row(HOST_MEMBERSHIP_ID, "ABSENT", expectedRevision = 1)))
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(2)
        assertThat(attendanceRevision(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo(1)
        val preview =
            mockMvc
                .get("/api/host/sessions/$sessionId/changes/$changeId/restore-preview") { withHost() }
                .andExpect { status { isOk() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
        val epochBefore = meetingEpoch()
        val auditBefore = countAudit(sessionId)

        mockMvc
            .post("/api/host/sessions/$sessionId/changes/$changeId/restore") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "expectedCurrentHash":"${preview.get("expectedCurrentHash").asString()}",
                      "expectedAttendanceRevision":1
                    }
                    """.trimIndent()
            }.andExpect { status { isOk() } }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceStatus(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(rsvpStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("GOING")
        assertThat(rsvpStatus(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo("MAYBE")
        assertThat(meetingEpoch()).isEqualTo(epochBefore + 1)
        assertThat(countAudit(sessionId)).isEqualTo(auditBefore + 1)
    }

    @Test
    fun `attendance current row hash mismatch writes nothing`() {
        val sessionId = openSession("출석 row hash")
        setRsvp(sessionId, HOST_MEMBERSHIP_ID, "GOING")
        val epochBefore = meetingEpoch()

        assertThatThrownBy {
            attendanceService.confirmAttendance(
                ConfirmAttendanceCommand(
                    host = host,
                    sessionId = UUID.fromString(sessionId),
                    entries =
                        listOf(
                            AttendanceEntryCommand(
                                membershipId = HOST_MEMBERSHIP_ID,
                                attendanceStatus = "ATTENDED",
                                expectedAttendanceRevision = 0,
                                expectedCurrentStatus = "ATTENDED",
                            ),
                        ),
                ),
            )
        }.isInstanceOf(HostSessionRevisionConflictException::class.java)

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(0)
        assertThat(rsvpStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("GOING")
        assertThat(countAudit(sessionId)).isZero()
        assertThat(meetingEpoch()).isEqualTo(epochBefore)
    }

    @Test
    fun `bulk rolls back when one row is stale`() {
        val sessionId = openSession("일괄 오래된 개정")
        confirm(sessionId, listOf(row(MEMBER_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0)))
        val epochBefore = meetingEpoch()
        val auditBefore = countAudit(sessionId)

        mockMvc
            .post(bulkUrl(sessionId, participantSetRevision(sessionId))) {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    attendanceJson(
                        row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0),
                        row(MEMBER_MEMBERSHIP_ID, "ABSENT", expectedRevision = 0),
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceStatus(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo("ATTENDED")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(0)
        assertThat(attendanceRevision(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo(1)
        assertThat(countAudit(sessionId)).isEqualTo(auditBefore)
        assertThat(meetingEpoch()).isEqualTo(epochBefore)
    }

    @Test
    fun `bulk rolls back when one row is missing`() {
        val sessionId = openSession("일괄 없는 참여자")
        val missing = UUID.fromString("00000000-0000-4000-8000-00000000a404")
        val epochBefore = meetingEpoch()

        mockMvc
            .post(bulkUrl(sessionId, participantSetRevision(sessionId))) {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    attendanceJson(
                        row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0),
                        row(missing.toString(), "ABSENT", expectedRevision = 0),
                    )
            }.andExpect { status { isConflict() } }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(0)
        assertThat(countAudit(sessionId)).isZero()
        assertThat(meetingEpoch()).isEqualTo(epochBefore)
    }

    @Test
    fun `bulk rolls back when one row is inactive`() {
        val sessionId = openSession("일괄 비활성 참여자")
        jdbcTemplate.update(
            """
            update session_participants
            set participation_status = 'REMOVED'
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            sessionId,
            MEMBER_MEMBERSHIP_ID,
        )
        val epochBefore = meetingEpoch()

        mockMvc
            .post(bulkUrl(sessionId, participantSetRevision(sessionId))) {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    attendanceJson(
                        row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0),
                        row(MEMBER_MEMBERSHIP_ID, "ABSENT", expectedRevision = 0),
                    )
            }.andExpect { status { isConflict() } }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceStatus(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(countAudit(sessionId)).isZero()
        assertThat(meetingEpoch()).isEqualTo(epochBefore)
    }

    @Test
    fun `bulk rolls back when the participant set revision is stale`() {
        val sessionId = openSession("일괄 참여자 집합")
        val staleSetRevision = participantSetRevision(sessionId)
        jdbcTemplate.update(
            "update sessions set participant_set_revision = participant_set_revision + 1 where id = ?",
            sessionId,
        )
        val epochBefore = meetingEpoch()

        mockMvc
            .post(bulkUrl(sessionId, staleSetRevision)) {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content =
                    attendanceJson(
                        row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0),
                        row(MEMBER_MEMBERSHIP_ID, "ABSENT", expectedRevision = 0),
                    )
            }.andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("REVISION_CONFLICT") }
            }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceStatus(sessionId, MEMBER_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(countAudit(sessionId)).isZero()
        assertThat(meetingEpoch()).isEqualTo(epochBefore)
    }

    @Test
    fun `successful attendance write bumps meeting epoch once`() {
        val sessionId = openSession("출석 목록 epoch")
        val epochBefore = meetingEpoch()

        confirm(
            sessionId,
            listOf(
                row(HOST_MEMBERSHIP_ID, "ATTENDED", expectedRevision = 0),
                row(MEMBER_MEMBERSHIP_ID, "ABSENT", expectedRevision = 0),
            ),
            expectedParticipantSetRevision = participantSetRevision(sessionId),
        )

        assertThat(meetingEpoch()).isEqualTo(epochBefore + 1)
        assertThat(countAudit(sessionId)).isEqualTo(1)
    }

    @Test
    fun `attendance write without expected revision is rejected and writes nothing`() {
        val sessionId = openSession("출석 개정 필수")
        val epochBefore = meetingEpoch()

        mockMvc
            .post("/api/host/sessions/$sessionId/attendance") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """[{"membershipId":"$HOST_MEMBERSHIP_ID","attendanceStatus":"ATTENDED"}]"""
            }.andExpect { status { isBadRequest() } }

        assertThat(attendanceStatus(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo("UNKNOWN")
        assertThat(attendanceRevision(sessionId, HOST_MEMBERSHIP_ID)).isEqualTo(0)
        assertThat(countAudit(sessionId)).isZero()
        assertThat(meetingEpoch()).isEqualTo(epochBefore)
    }

    private fun openSession(title: String): String {
        closeExistingOpenSession()
        val sessionId =
            mockMvc
                .post("/api/host/sessions") {
                    withHost()
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "title": "$title",
                          "bookTitle": "출석 책",
                          "bookAuthor": "출석 저자",
                          "date": "2026-09-18",
                          "locationLabel": "온라인"
                        }
                        """.trimIndent()
                }.andExpect { status { isCreated() } }
                .andReturn()
                .response
                .contentAsString
                .let(jsonMapper::readTree)
                .get("sessionId")
                .asString()
        mockMvc
            .post("/api/host/sessions/$sessionId/open") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedSessionRevision":0}"""
            }.andExpect { status { isOk() } }
        return sessionId
    }

    private fun closeExistingOpenSession() {
        val open =
            jdbcTemplate
                .query(
                    """
                    select id, session_revision
                    from sessions
                    where club_id = ? and state = 'OPEN' and deleted_at is null
                    """.trimIndent(),
                    { rs, _ -> rs.getString("id") to rs.getLong("session_revision") },
                    CLUB_ID,
                ).firstOrNull() ?: return
        mockMvc
            .post("/api/host/sessions/${open.first}/close") {
                withHost()
                contentType = MediaType.APPLICATION_JSON
                content = """{"expectedSessionRevision":${open.second}}"""
            }.andExpect { status { isOk() } }
    }

    private fun confirm(
        sessionId: String,
        rows: List<String>,
        expectedParticipantSetRevision: Long? = if (rows.size > 1) participantSetRevision(sessionId) else null,
    ) = mockMvc
        .post(bulkUrl(sessionId, expectedParticipantSetRevision)) {
            withHost()
            contentType = MediaType.APPLICATION_JSON
            content = attendanceJson(*rows.toTypedArray())
        }.andExpect { status { isOk() } }
        .andReturn()
        .response
        .contentAsString
        .let(jsonMapper::readTree)

    private fun bulkUrl(
        sessionId: String,
        expectedParticipantSetRevision: Long?,
    ) = if (expectedParticipantSetRevision == null) {
        "/api/host/sessions/$sessionId/attendance"
    } else {
        "/api/host/sessions/$sessionId/attendance?expectedParticipantSetRevision=$expectedParticipantSetRevision"
    }

    private fun row(
        membershipId: String,
        status: String,
        expectedRevision: Long,
    ) = """{"membershipId":"$membershipId","attendanceStatus":"$status","expectedAttendanceRevision":$expectedRevision}"""

    private fun attendanceJson(vararg rows: String) = rows.joinToString(prefix = "[", postfix = "]")

    private fun setRsvp(
        sessionId: String,
        membershipId: String,
        status: String,
    ) {
        jdbcTemplate.update(
            """
            update session_participants
            set rsvp_status = ?
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            status,
            sessionId,
            membershipId,
        )
    }

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

    private fun rsvpStatus(
        sessionId: String,
        membershipId: String,
    ): String =
        jdbcTemplate.queryForObject(
            """
            select rsvp_status from session_participants
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            membershipId,
        ) ?: error("missing rsvp")

    private fun participantSetRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select participant_set_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing participant set revision")

    private fun meetingEpoch(): Long =
        jdbcTemplate.queryForObject(
            "select meeting_epoch from club_host_list_epochs where club_id = ?",
            Long::class.java,
            CLUB_ID,
        ) ?: 0

    private fun countAudit(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_change_audit where session_id = ? and action_type = 'ATTENDANCE_UPDATED'",
            Int::class.java,
            sessionId,
        ) ?: 0

    private fun MockHttpServletRequestDsl.withHost() {
        with(user("host@example.com"))
        with(csrf())
    }

    private val host =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString(HOST_MEMBERSHIP_ID),
            clubId = UUID.fromString(CLUB_ID),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "김호스트",
            accountName = "김호스트",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val HOST_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000201"
        const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000202"
    }
}

private const val CLEANUP_ATTENDANCE_CONCURRENCY_SQL = """
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
