package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

internal class HostSessionLockQueries(
    private val jdbcTemplate: JdbcTemplate,
    private val hostSessionQueries: HostSessionQueries,
) {
    fun lockParticipantSetRevision(
        host: CurrentMember,
        sessionId: UUID,
    ): Long? =
        jdbcTemplate
            .query(
                """
                select participant_set_revision
                from active_sessions
                where id = ? and club_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.getLong("participant_set_revision") },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull()

    fun lockAttendanceRows(
        host: CurrentMember,
        sessionId: UUID,
        membershipIds: List<UUID>,
    ): Map<UUID, LockedAttendanceRow> {
        val ordered = membershipIds.distinct().sortedBy { it.toString() }
        return ordered
            .mapNotNull { membershipId ->
                jdbcTemplate
                    .query(
                        """
                        select membership_id, attendance_status, attendance_revision, participation_status
                        from session_participants
                        where session_id = ? and club_id = ? and membership_id = ?
                        for update
                        """.trimIndent(),
                        { resultSet, _ ->
                            LockedAttendanceRow(
                                membershipId = membershipId,
                                attendanceStatus = resultSet.getString("attendance_status"),
                                attendanceRevision = resultSet.getLong("attendance_revision"),
                                participationStatus = resultSet.getString("participation_status"),
                            )
                        },
                        sessionId.dbString(),
                        host.clubId.dbString(),
                        membershipId.dbString(),
                    ).firstOrNull()
            }.associateBy { it.membershipId }
    }

    fun sessionRevision(
        host: CurrentMember,
        sessionId: UUID,
    ): Long? =
        jdbcTemplate
            .query(
                "select session_revision from active_sessions where id = ? and club_id = ?",
                { resultSet, _ -> resultSet.getLong("session_revision") },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull()

    fun lockSession(
        clubId: UUID,
        sessionId: UUID,
    ): LockedSessionRow? =
        jdbcTemplate
            .query(
                "select id, state from active_sessions where id = ? and club_id = ? for update",
                { resultSet, _ -> LockedSessionRow(resultSet.uuid("id"), resultSet.getString("state")) },
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull()

    fun lockCurrentOpenSession(clubId: UUID): LockedSessionRow? =
        jdbcTemplate
            .query(
                """
                select id, state
                from active_sessions
                where club_id = ? and state = 'OPEN'
                order by number desc
                limit 1
                for update
                """.trimIndent(),
                { resultSet, _ -> LockedSessionRow(resultSet.uuid("id"), resultSet.getString("state")) },
                clubId.dbString(),
            ).firstOrNull()

    fun requireActiveClubAndMembership(
        clubId: UUID,
        membershipId: UUID,
        hostRequired: Boolean,
    ) {
        val row = activeClubMembership(clubId, membershipId)
        val message =
            when {
                row == null || row.first != "ACTIVE" || row.third != "ACTIVE" ->
                    "Approved active membership is required"
                hostRequired && row.second != "HOST" -> "Host role required"
                else -> null
            }
        if (message != null) throw AccessDeniedException(message)
    }

    fun lockExposure(
        host: CurrentMember,
        sessionId: UUID,
    ): LockedHostSessionExposure =
        jdbcTemplate
            .query(
                """
                select sessions.state,
                       sessions.visibility as session_visibility,
                       sessions.access_scope,
                       sessions.exposure_revision,
                       coalesce(publication.publication_revision, 0) as publication_revision,
                       public_session_publications.visibility as publication_visibility,
                       public_session_publications.site_visibility,
                       public_session_publications.is_public
                from active_sessions sessions
                left join public_session_publications
                  on public_session_publications.club_id = sessions.club_id
                 and public_session_publications.session_id = sessions.id
                left join session_publication_versions publication on publication.session_id = sessions.id
                where sessions.id = ? and sessions.club_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    LockedHostSessionExposure(
                        state = resultSet.getString("state"),
                        sessionVisibility = resultSet.getString("session_visibility"),
                        exposure =
                            SessionExposure(
                                accessScope = SessionAccessScope.valueOf(resultSet.getString("access_scope")),
                                siteVisibility =
                                    resultSet.getString("site_visibility")?.let(PublicSiteVisibility::valueOf)
                                        ?: PublicSiteVisibility.HIDDEN,
                            ),
                        exposureRevision = resultSet.getLong("exposure_revision"),
                        publicationRevision = resultSet.getLong("publication_revision"),
                    )
                },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull() ?: throw HostSessionNotFoundException()

    fun requireLegacyPublicationWriteAllowed(
        host: CurrentMember,
        sessionId: UUID,
    ) {
        val state =
            jdbcTemplate.queryForObject(
                "select state from active_sessions where id = ? and club_id = ? for update",
                String::class.java,
                sessionId.dbString(),
                host.clubId.dbString(),
            ) ?: throw HostSessionNotFoundException()
        if (state == "CLOSED" || state == "PUBLISHED") throw HostSessionRecordStagingRequiredException()
    }

    fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot {
        hostSessionQueries.requireHostSession(jdbcTemplate, command.host, command.sessionId)
        val updatedAt =
            jdbcTemplate
                .query(
                    "select updated_at from active_sessions where id = ? and club_id = ? for update",
                    { resultSet, _ -> resultSet.utcOffsetDateTime("updated_at") },
                    command.sessionId.dbString(),
                    command.host.clubId.dbString(),
                ).firstOrNull() ?: throw HostSessionNotFoundException()
        return HostSessionVisibilitySnapshot(
            detail =
                hostSessionQueries.findHostSessionAfterHostCheck(
                    jdbcTemplate,
                    command.host,
                    command.sessionId,
                ),
            contentUpdatedAt = updatedAt,
        )
    }

    private fun activeClubMembership(
        clubId: UUID,
        membershipId: UUID,
    ): Triple<String, String, String>? =
        jdbcTemplate
            .query(
                """
                select clubs.status as club_status, memberships.role, memberships.status as membership_status
                from clubs
                join memberships on memberships.club_id = clubs.id
                where clubs.id = ? and memberships.id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    Triple(
                        resultSet.getString("club_status"),
                        resultSet.getString("role"),
                        resultSet.getString("membership_status"),
                    )
                },
                clubId.dbString(),
                membershipId.dbString(),
            ).firstOrNull()
}
