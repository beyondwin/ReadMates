package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.domain.SessionExposure
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
    internal val jdbcTemplate: JdbcTemplate,
    internal val hostSessionQueries: HostSessionQueries,
) {
    internal val locks = HostSessionWriteLockQueries(jdbcTemplate)
    internal val projections = HostSessionProjectionQueries(jdbcTemplate)
}

internal fun HostSessionWriteQueries.sessionRevision(
    host: CurrentMember,
    sessionId: UUID,
): Long? =
    jdbcTemplate
        .query(
            """
            select session_revision
            from sessions
            where id = ? and club_id = ? and deleted_at is null
            """.trimIndent(),
            { resultSet, _ -> resultSet.getLong("session_revision") },
            sessionId.dbString(),
            host.clubId.dbString(),
        ).firstOrNull()

internal fun HostSessionWriteQueries.nextSessionNumber(clubId: UUID): Int =
    jdbcTemplate.queryForObject(
        """
        select coalesce(max(number), 0) + 1
        from sessions
        where club_id = ?
        """.trimIndent(),
        Int::class.java,
        clubId.dbString(),
    ) ?: 1

internal fun HostSessionWriteQueries.existingSchedule(
    member: CurrentMember,
    sessionId: UUID,
): ExistingHostSessionSchedule = hostSessionQueries.findExistingSchedule(jdbcTemplate, member, sessionId)

internal fun HostSessionWriteQueries.requireHostSession(
    member: CurrentMember,
    sessionId: UUID,
) = hostSessionQueries.requireHostSession(jdbcTemplate, member, sessionId)

internal fun HostSessionWriteQueries.state(
    member: CurrentMember,
    sessionId: UUID,
): String? = hostSessionQueries.findState(jdbcTemplate, member, sessionId)

internal fun HostSessionWriteQueries.detail(
    member: CurrentMember,
    sessionId: UUID,
) = hostSessionQueries.findHostSessionAfterHostCheck(jdbcTemplate, member, sessionId)

internal fun HostSessionWriteQueries.findOpenSessionId(clubId: UUID): UUID? =
    jdbcTemplate
        .query(
            """
            select id
            from active_sessions sessions
            where club_id = ?
              and state = 'OPEN'
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
        ).firstOrNull()

internal fun HostSessionWriteQueries.activeMembershipIds(clubId: UUID): List<UUID> =
    jdbcTemplate.query(
        """
        select id
        from memberships
        where club_id = ?
          and status = 'ACTIVE'
        order by joined_at is null, joined_at, created_at
        """.trimIndent(),
        { resultSet, _ -> resultSet.uuid("id") },
        clubId.dbString(),
    )

internal fun HostSessionWriteQueries.insertPublicationVersion(sessionId: UUID) {
    jdbcTemplate.update(
        """
        insert into session_publication_versions (session_id, publication_revision)
        values (?, 0)
        """.trimIndent(),
        sessionId.dbString(),
    )
}

internal fun HostSessionWriteQueries.expectedRevision(expected: ExpectedSessionRevision?): Long = expected?.value ?: -1

internal fun HostSessionWriteQueries.throwIfStale(
    updated: Int,
    host: CurrentMember,
    sessionId: UUID,
) {
    if (updated > 0) return
    throw revisionConflict(host, sessionId) ?: HostSessionNotFoundException()
}

internal data class LockedHostSessionExposure(
    val state: String,
    val sessionVisibility: String,
    val exposure: SessionExposure,
    val exposureRevision: Long,
    val publicationRevision: Long,
    val publicationExists: Boolean,
    val publicSummary: String?,
    val publicationVisibility: String?,
    val publicationIsPublic: Boolean,
)
