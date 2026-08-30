package com.readmates.hostworkspace.adapter.out.persistence

import com.readmates.hostworkspace.application.model.HostPersonAttendanceItem
import com.readmates.hostworkspace.application.model.HostPersonAttendanceStatus
import com.readmates.hostworkspace.application.model.HostPersonAttendanceTuple
import com.readmates.hostworkspace.application.model.HostPersonDetailQuery
import com.readmates.hostworkspace.application.model.HostPersonMembershipStatus
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
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
            page = adapter.load(query(target, limit = 2, after = visible.last().tuple))!!.attendanceItems
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

    private fun query(
        target: UUID,
        limit: Int,
        after: HostPersonAttendanceTuple? = null,
    ) = HostPersonDetailQuery(
        clubId = UUID.fromString(CLUB_ID),
        targetMembershipId = target,
        evaluatedAt = Instant.parse("2026-08-30T09:00:00Z"),
        after = after,
        fetchLimit = limit + 1,
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

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val MEMBERSHIP_ID_SQL =
            "select memberships.id from memberships join users on users.id = memberships.user_id " +
                "where memberships.club_id = ? and users.email = ?"
    }
}
