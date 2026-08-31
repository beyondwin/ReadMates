package com.readmates.session.api

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
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
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.put
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDateTime
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class SessionScheduleSeenDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val transactionTemplate = TransactionTemplate(transactionManager)

    @BeforeEach
    fun prepare() {
        cleanup()
        jdbcTemplate.update("update memberships set status = 'ACTIVE' where id = ?", MEMBER_MEMBERSHIP_ID)
    }

    @AfterEach
    fun cleanup() {
        jdbcTemplate.update("delete from session_participants where session_id in (?, ?)", SESSION_ID, OTHER_SESSION_ID)
        jdbcTemplate.update("delete from sessions where id in (?, ?)", SESSION_ID, OTHER_SESSION_ID)
        jdbcTemplate.update("delete from memberships where id = ?", OTHER_MEMBERSHIP_ID)
        jdbcTemplate.update("update memberships set status = 'ACTIVE' where id = ?", MEMBER_MEMBERSHIP_ID)
    }

    @Test
    fun `first exact revision view stores one minimal seen fact without changing operational facts`() {
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)
        val beforeEpochs = epochs(CLUB_ID)

        markSeen(3)
            .andExpect {
                status { isOk() }
                jsonPath("$.scheduleRevision") { value(3) }
                jsonPath("$.seenAt") { isNotEmpty() }
            }

        assertEquals(3L, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
        assertNotNull(seenAt(SESSION_ID, MEMBER_MEMBERSHIP_ID))
        assertEquals("NO_RESPONSE", participantValue("rsvp_status"))
        assertEquals("UNKNOWN", participantValue("attendance_status"))
        assertEquals(beforeEpochs, epochs(CLUB_ID))
        assertEquals(0, sessionNotificationRows())
    }

    @Test
    fun `same revision retry returns stored timestamp without rewriting it`() {
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)
        markSeen(3).andExpect { status { isOk() } }
        val fixedSeenAt = LocalDateTime.parse("2026-08-29T01:02:03.123456")
        jdbcTemplate.update(
            "update session_participants set seen_schedule_at = ? where session_id = ? and membership_id = ?",
            fixedSeenAt,
            SESSION_ID,
            MEMBER_MEMBERSHIP_ID,
        )

        markSeen(3)
            .andExpect {
                status { isOk() }
                jsonPath("$.scheduleRevision") { value(3) }
                jsonPath("$.seenAt") { value("2026-08-29T01:02:03.123456Z") }
            }

        assertEquals(fixedSeenAt, seenAt(SESSION_ID, MEMBER_MEMBERSHIP_ID))
    }

    @Test
    fun `stale and future revisions both fail closed without writing seen state`() {
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)

        listOf(2L, 4L).forEach { requestedRevision ->
            markSeen(requestedRevision)
                .andExpect {
                    status { isConflict() }
                    jsonPath("$.code") { value("SESSION_SCHEDULE_REVISION_STALE") }
                }
        }

        assertEquals(null, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
        assertEquals(null, seenAt(SESSION_ID, MEMBER_MEMBERSHIP_ID))
    }

    @Test
    fun `removed participant cannot record a schedule view`() {
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID, participationStatus = "REMOVED")

        markSeen(3).andExpect { status { isForbidden() } }

        assertEquals(null, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
    }

    @Test
    fun `inactive membership cannot record a schedule view`() {
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)
        jdbcTemplate.update("update memberships set status = 'INACTIVE' where id = ?", MEMBER_MEMBERSHIP_ID)

        markSeen(3).andExpect { status { isForbidden() } }

        assertEquals(null, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
    }

    @Test
    fun `draft schedule is unavailable for seen writes`() {
        createSession(SESSION_ID, CLUB_ID, "DRAFT", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)

        markSeen(3)
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
            }

        assertEquals(null, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
    }

    @Test
    fun `missing open session is unavailable for seen writes`() {
        markSeen(1)
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("CONFLICT") }
            }
    }

    @Test
    fun `url authoritative club rejects a revision belonging to another club`() {
        createOtherClubMembership()
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)
        createSession(OTHER_SESSION_ID, OTHER_CLUB_ID, "OPEN", 7)
        createParticipant(OTHER_SESSION_ID, OTHER_CLUB_ID, OTHER_MEMBERSHIP_ID)

        markSeen(7, clubSlug = "reading-sai")
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("SESSION_SCHEDULE_REVISION_STALE") }
            }

        assertEquals(null, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
        assertEquals(null, seenRevision(OTHER_SESSION_ID, OTHER_MEMBERSHIP_ID))
    }

    @Test
    @Timeout(30)
    fun `seen write waits for the current session lock and rejects the committed newer revision`() {
        createSession(SESSION_ID, CLUB_ID, "OPEN", 3)
        createParticipant(SESSION_ID, CLUB_ID, MEMBER_MEMBERSHIP_ID)
        val changedUnderLock = CountDownLatch(1)
        val releaseScheduleChange = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val scheduleChange =
                executor.submit {
                    transactionTemplate.executeWithoutResult {
                        jdbcTemplate.queryForObject(
                            "select schedule_revision from sessions where id = ? for update",
                            Long::class.java,
                            SESSION_ID,
                        )
                        jdbcTemplate.update("update sessions set schedule_revision = 4 where id = ?", SESSION_ID)
                        changedUnderLock.countDown()
                        check(releaseScheduleChange.await(10, TimeUnit.SECONDS))
                    }
                }
            check(changedUnderLock.await(10, TimeUnit.SECONDS))
            val seenRequest = executor.submit<Int> { markSeen(3).andReturn().response.status }

            assertThrows(TimeoutException::class.java) { seenRequest.get(250, TimeUnit.MILLISECONDS) }
            releaseScheduleChange.countDown()
            scheduleChange.get(10, TimeUnit.SECONDS)
            assertEquals(409, seenRequest.get(10, TimeUnit.SECONDS))
            assertEquals(null, seenRevision(SESSION_ID, MEMBER_MEMBERSHIP_ID))
        } finally {
            releaseScheduleChange.countDown()
            executor.shutdownNow()
        }
    }

    private fun markSeen(
        scheduleRevision: Long,
        clubSlug: String = "reading-sai",
    ) = mockMvc.put("/api/sessions/current/schedule-seen") {
        with(user("member5@example.com"))
        with(csrf())
        header("X-Readmates-Bff-Secret", "test-bff-secret")
        header("X-Readmates-Club-Slug", clubSlug)
        header("Origin", "http://localhost:3000")
        contentType = MediaType.APPLICATION_JSON
        content = """{"scheduleRevision":$scheduleRevision}"""
    }

    private fun createSession(
        sessionId: String,
        clubId: String,
        state: String,
        scheduleRevision: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state,
              visibility, access_scope, schedule_revision
            ) values (?, ?, ?, '일정 확인 테스트', '일정 확인 책', '테스트 저자', '2026-09-30',
                      '19:30:00', '21:30:00', '온라인', '2026-09-29 14:59:00', ?,
                      ?, ?, ?)
            """.trimIndent(),
            sessionId,
            clubId,
            if (clubId == CLUB_ID) 871 else 872,
            state,
            if (state == "DRAFT") "HOST_ONLY" else "MEMBER",
            if (state == "DRAFT") "HOST_ONLY" else "GUEST_READABLE",
            scheduleRevision,
        )
    }

    private fun createParticipant(
        sessionId: String,
        clubId: String,
        membershipId: String,
        participationStatus: String = "ACTIVE",
    ) {
        jdbcTemplate.update(
            """
            insert into session_participants (
              id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status
            ) values (uuid(), ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', ?)
            """.trimIndent(),
            clubId,
            sessionId,
            membershipId,
            participationStatus,
        )
    }

    private fun createOtherClubMembership() {
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), '다른 모임 멤버', 'apple-green-book')
            """.trimIndent(),
            OTHER_MEMBERSHIP_ID,
            OTHER_CLUB_ID,
            MEMBER_USER_ID,
        )
    }

    private fun seenRevision(
        sessionId: String,
        membershipId: String,
    ): Long? =
        jdbcTemplate.queryForObject(
            "select seen_schedule_revision from session_participants where session_id = ? and membership_id = ?",
            Long::class.javaObjectType,
            sessionId,
            membershipId,
        )

    private fun seenAt(
        sessionId: String,
        membershipId: String,
    ): LocalDateTime? =
        jdbcTemplate.queryForObject(
            "select seen_schedule_at from session_participants where session_id = ? and membership_id = ?",
            LocalDateTime::class.java,
            sessionId,
            membershipId,
        )

    private fun participantValue(column: String): String =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select $column from session_participants where session_id = ? and membership_id = ?",
                String::class.java,
                SESSION_ID,
                MEMBER_MEMBERSHIP_ID,
            ),
        )

    private fun epochs(clubId: String): Pair<Long, Long> =
        jdbcTemplate.queryForObject(
            "select meeting_epoch, record_epoch from club_host_list_epochs where club_id = ?",
            { resultSet, _ -> resultSet.getLong("meeting_epoch") to resultSet.getLong("record_epoch") },
            clubId,
        )

    private fun sessionNotificationRows(): Int =
        listOf(
            "notification_event_outbox" to "aggregate_id",
            "host_action_notification_decisions" to "session_id",
        ).sumOf { (table, column) ->
            jdbcTemplate.queryForObject(
                "select count(*) from $table where $column = ?",
                Int::class.java,
                SESSION_ID,
            ) ?: 0
        }

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val OTHER_CLUB_ID = "00000000-0000-0000-0000-000000000002"
        const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000000106"
        const val MEMBER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000206"
        const val OTHER_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000008206"
        const val SESSION_ID = "00000000-0000-0000-0000-000000008710"
        const val OTHER_SESSION_ID = "00000000-0000-0000-0000-000000008711"
    }
}
