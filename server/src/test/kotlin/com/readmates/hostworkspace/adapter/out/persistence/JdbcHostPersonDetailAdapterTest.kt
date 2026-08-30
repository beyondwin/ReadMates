package com.readmates.hostworkspace.adapter.out.persistence

import com.readmates.hostworkspace.application.model.HostPersonAttendanceItem
import com.readmates.hostworkspace.application.model.HostPersonAttendanceStatus
import com.readmates.hostworkspace.application.model.HostPersonAttendanceTuple
import com.readmates.hostworkspace.application.model.HostPersonDetailQuery
import com.readmates.hostworkspace.application.model.HostPersonInvalidCursorException
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.ResourceLock
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Instant
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
@ResourceLock("HostPersonDetailIntegrationDatabase")
class JdbcHostPersonDetailAdapterTest(
    @param:Autowired private val adapter: JdbcHostPersonDetailAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `loads the exact club membership with access only from membership club access`() {
        val target = membershipId("member5@example.com")
        jdbcTemplate.update(
            "delete from membership_club_access where club_id = ? and membership_id = ?",
            CLUB_ID,
            target.toString(),
        )
        jdbcTemplate.update(
            "insert into membership_club_access (club_id, membership_id, last_access_at) values (?, ?, ?)",
            CLUB_ID,
            target.toString(),
            "2026-08-30 01:23:45.000000",
        )

        val result = adapter.load(query(target, limit = 20))!!

        assertThat(result.membershipId).isEqualTo(target)
        assertThat(result.lastClubAccessAt).isEqualTo(Instant.parse("2026-08-30T01:23:45Z"))
        assertThat(result.status).isEqualTo(HostPersonMembershipStatus.ACTIVE)
        assertThat(adapter.load(query(UUID.randomUUID(), limit = 20))).isNull()
    }

    @Test
    fun `attendance uses stable server pagination without gaps duplicates or deleted sessions`() {
        val target = membershipId("member5@example.com")
        val all = adapter.load(query(target, limit = 100))!!.attendanceItems
        val first = adapter.load(query(target, limit = 2))!!
        assertThat(all).hasSizeGreaterThan(2)
        assertThat(first.attendanceItems).hasSize(3)
        val paged = mutableListOf<HostPersonAttendanceItem>()
        var page = first.attendanceItems
        while (page.isNotEmpty()) {
            val visible = page.take(2)
            paged += visible
            if (page.size <= 2) break
            page =
                adapter.load(
                    query(
                        target,
                        limit = 2,
                        after = visible.last().tuple,
                        expectedHistoryFingerprint = first.attendanceHistoryFingerprint,
                    ),
                )!!.attendanceItems
        }
        assertThat(paged).containsExactlyElementsOf(all)
        assertThat(paged.map { it.tuple }).doesNotHaveDuplicates()
        assertThat(paged).isSortedAccordingTo(
            compareByDescending<HostPersonAttendanceItem> { it.scheduledAt }
                .thenByDescending { it.sessionNumber }
                .thenByDescending { it.tuple.sessionId },
        )
        assertThat(first.attendanceItems.map { it.attendanceStatus })
            .allMatch { it in HostPersonAttendanceStatus.entries }
    }

    @Test
    fun `terminal membership is loaded without resurrecting a current participation`() {
        val target = membershipId("member5@example.com")
        jdbcTemplate.update("update memberships set status = 'LEFT' where id = ?", target.toString())
        try {
            val result = adapter.load(query(target, limit = 20))!!
            assertThat(result.status).isEqualTo(HostPersonMembershipStatus.LEFT)
            assertThat(result.currentSchedule).isNull()
            assertThat(result.currentRsvp).isNull()
        } finally {
            jdbcTemplate.update("update memberships set status = 'ACTIVE' where id = ?", target.toString())
        }
    }

    @Test
    fun `continuation fails closed when an emitted attendance session is rescheduled`() {
        val target = membershipId("member5@example.com")
        val first = adapter.load(query(target, limit = 2))!!
        val emitted = first.attendanceItems.take(2).last()
        val original = sessionSchedule(emitted.tuple.sessionId)
        try {
            jdbcTemplate.update(
                RESCHEDULE_SQL,
                emitted.tuple.sessionId.toString(),
            )

            assertThatThrownBy {
                adapter.load(
                    query(
                        target,
                        limit = 2,
                        after = emitted.tuple,
                        expectedHistoryFingerprint = first.attendanceHistoryFingerprint,
                    ),
                )
            }.isInstanceOf(HostPersonInvalidCursorException::class.java)
        } finally {
            jdbcTemplate.update(
                "update sessions set session_date = ?, start_time = ?, schedule_revision = ? where id = ?",
                original["session_date"],
                original["start_time"],
                original["schedule_revision"],
                emitted.tuple.sessionId.toString(),
            )
        }
    }

    @Test
    fun `continuation fails closed when a pending attendance session is reopened`() {
        val target = membershipId("member5@example.com")
        val first = adapter.load(query(target, limit = 2))!!
        val pending = first.attendanceItems[2]
        val original =
            jdbcTemplate.queryForMap(
                "select state, session_revision from sessions where id = ?",
                pending.tuple.sessionId.toString(),
            )
        try {
            jdbcTemplate.update(
                "update sessions set state = 'OPEN', session_revision = session_revision + 1 where id = ?",
                pending.tuple.sessionId.toString(),
            )

            assertThatThrownBy {
                adapter.load(
                    query(
                        target,
                        limit = 2,
                        after = first.attendanceItems[1].tuple,
                        expectedHistoryFingerprint = first.attendanceHistoryFingerprint,
                    ),
                )
            }.isInstanceOf(HostPersonInvalidCursorException::class.java)
        } finally {
            jdbcTemplate.update(
                "update sessions set state = ?, session_revision = ? where id = ?",
                original["state"],
                original["session_revision"],
                pending.tuple.sessionId.toString(),
            )
        }
    }

    private fun query(
        target: UUID,
        limit: Int,
        after: HostPersonAttendanceTuple? = null,
        expectedHistoryFingerprint: String? = null,
    ) = HostPersonDetailQuery(
        clubId = UUID.fromString(CLUB_ID),
        targetMembershipId = target,
        evaluatedAt = Instant.parse("2026-08-30T09:00:00Z"),
        after = after,
        fetchLimit = limit + 1,
        expectedHistoryFingerprint = expectedHistoryFingerprint,
    )

    private fun membershipId(email: String): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                MEMBERSHIP_ID_SQL,
                String::class.java,
                CLUB_ID,
                email,
            )!!,
        )

    private fun sessionSchedule(sessionId: UUID): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            "select session_date, start_time, schedule_revision from sessions where id = ?",
            sessionId.toString(),
        )

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val MEMBERSHIP_ID_SQL =
            "select memberships.id from memberships join users on users.id = memberships.user_id " +
                "where memberships.club_id = ? and users.email = ?"
        const val RESCHEDULE_SQL =
            "update sessions set session_date = '2020-01-01', " +
                "schedule_revision = schedule_revision + 1 where id = ?"
    }
}
