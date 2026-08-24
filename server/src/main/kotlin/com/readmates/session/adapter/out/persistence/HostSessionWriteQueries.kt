package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal data class LockedSessionRow(
    val sessionId: UUID,
    val state: String,
)

internal data class LockedAttendanceRow(
    val membershipId: UUID,
    val attendanceStatus: String,
    val attendanceRevision: Long,
    val participationStatus: String,
)

internal class HostSessionWriteQueries(
    private val jdbcTemplate: JdbcTemplate,
    private val hostSessionQueries: HostSessionQueries,
) {
    val locks = HostSessionLockQueries(jdbcTemplate, hostSessionQueries)
    val revisions = HostSessionRevisionQueries(jdbcTemplate)

    fun lockClub(clubId: UUID) {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    fun nextSessionNumber(clubId: UUID): Int =
        jdbcTemplate.queryForObject(
            """
            select coalesce(max(number), 0) + 1
            from sessions
            where club_id = ?
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
        ) ?: 1

    fun existingSchedule(
        member: CurrentMember,
        sessionId: UUID,
    ): ExistingHostSessionSchedule = hostSessionQueries.findExistingSchedule(jdbcTemplate, member, sessionId)

    fun requireHostSession(
        member: CurrentMember,
        sessionId: UUID,
    ) = hostSessionQueries.requireHostSession(jdbcTemplate, member, sessionId)

    fun state(
        member: CurrentMember,
        sessionId: UUID,
    ): String? = hostSessionQueries.findState(jdbcTemplate, member, sessionId)

    fun detail(
        member: CurrentMember,
        sessionId: UUID,
    ) = hostSessionQueries.findHostSessionAfterHostCheck(jdbcTemplate, member, sessionId)

    fun findOpenSessionId(clubId: UUID): UUID? =
        jdbcTemplate
            .query(
                """
                select id
                from active_sessions
                where club_id = ? and state = 'OPEN'
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.uuid("id") },
                clubId.dbString(),
            ).firstOrNull()

    fun activeMembershipIds(clubId: UUID): List<UUID> =
        jdbcTemplate.query(
            """
            select id
            from memberships
            where club_id = ? and status = 'ACTIVE'
            order by joined_at is null, joined_at, created_at
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
        )

    fun insertPublicationVersion(sessionId: UUID) {
        jdbcTemplate.update(
            "insert into session_publication_versions (session_id, publication_revision) values (?, 0)",
            sessionId.dbString(),
        )
    }

    fun expectedRevision(expected: ExpectedSessionRevision?): Long = expected?.value ?: -1
}

internal data class LockedHostSessionExposure(
    val state: String,
    val sessionVisibility: String,
    val exposure: com.readmates.session.domain.SessionExposure,
    val exposureRevision: Long,
    val publicationRevision: Long,
)
