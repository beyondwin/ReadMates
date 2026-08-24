package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import java.util.UUID

private typealias VisibilitySnapshot = HostSessionVisibilitySnapshot

internal fun HostSessionWriteQueries.lockClub(clubId: UUID) {
    jdbcTemplate.queryForObject(
        "select id from clubs where id = ? for update",
        String::class.java,
        clubId.dbString(),
    )
}

internal fun HostSessionWriteQueries.lockParticipantSetRevision(
    host: CurrentMember,
    sessionId: UUID,
): Long? =
    jdbcTemplate
        .query(
            """
            select participant_set_revision
            from active_sessions
            where id = ?
              and club_id = ?
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.getLong("participant_set_revision") },
            sessionId.dbString(),
            host.clubId.dbString(),
        ).firstOrNull()

internal fun HostSessionWriteQueries.lockAttendanceRows(
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
                    where session_id = ?
                      and club_id = ?
                      and membership_id = ?
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

internal fun HostSessionWriteQueries.lockSession(
    clubId: UUID,
    sessionId: UUID,
): LockedSessionRow? =
    jdbcTemplate
        .query(
            """
            select id, state
            from active_sessions
            where id = ?
              and club_id = ?
            for update
            """.trimIndent(),
            { resultSet, _ ->
                LockedSessionRow(
                    sessionId = resultSet.uuid("id"),
                    state = resultSet.getString("state"),
                )
            },
            sessionId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

internal fun HostSessionWriteQueries.lockCurrentOpenSession(clubId: UUID): LockedSessionRow? =
    jdbcTemplate
        .query(
            """
            select id, state
            from active_sessions
            where club_id = ?
              and state = 'OPEN'
            order by number desc
            limit 1
            for update
            """.trimIndent(),
            { resultSet, _ ->
                LockedSessionRow(
                    sessionId = resultSet.uuid("id"),
                    state = resultSet.getString("state"),
                )
            },
            clubId.dbString(),
        ).firstOrNull()

internal fun HostSessionWriteQueries.requireActiveClubAndMembership(
    clubId: UUID,
    membershipId: UUID,
    hostRequired: Boolean,
) = locks.requireActiveClubAndMembership(clubId, membershipId, hostRequired)

internal fun HostSessionWriteQueries.lockExposure(
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
                   public_session_publications.is_public,
                   public_session_publications.public_summary,
                   public_session_publications.id is not null as publication_exists
            from active_sessions sessions
            left join public_session_publications
              on public_session_publications.club_id = sessions.club_id
             and public_session_publications.session_id = sessions.id
            left join session_publication_versions publication
              on publication.session_id = sessions.id
            where sessions.id = ?
              and sessions.club_id = ?
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
                                resultSet
                                    .getString("site_visibility")
                                    ?.let(PublicSiteVisibility::valueOf)
                                    ?: PublicSiteVisibility.HIDDEN,
                        ),
                    exposureRevision = resultSet.getLong("exposure_revision"),
                    publicationRevision = resultSet.getLong("publication_revision"),
                    publicationExists = resultSet.getBoolean("publication_exists"),
                    publicSummary = resultSet.getString("public_summary"),
                    publicationVisibility = resultSet.getString("publication_visibility"),
                    publicationIsPublic = resultSet.getBoolean("is_public"),
                )
            },
            sessionId.dbString(),
            host.clubId.dbString(),
        ).firstOrNull() ?: throw HostSessionNotFoundException()

internal fun HostSessionWriteQueries.requireLegacyPublicationWriteAllowed(
    host: CurrentMember,
    sessionId: UUID,
) {
    val state =
        jdbcTemplate.queryForObject(
            """
            select state
            from active_sessions sessions
            where id = ? and club_id = ?
            for update
            """.trimIndent(),
            String::class.java,
            sessionId.dbString(),
            host.clubId.dbString(),
        ) ?: throw HostSessionNotFoundException()
    if (state == "CLOSED" || state == "PUBLISHED") throw HostSessionRecordStagingRequiredException()
}

internal fun HostSessionWriteQueries.lockVisibilitySnapshot(command: HostSessionIdCommand): VisibilitySnapshot {
    requireHostSession(command.host, command.sessionId)
    val updatedAt =
        jdbcTemplate
            .query(
                """
                select updated_at
                from active_sessions sessions
                where id = ? and club_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.utcOffsetDateTime("updated_at") },
                command.sessionId.dbString(),
                command.host.clubId.dbString(),
            ).firstOrNull() ?: throw HostSessionNotFoundException()
    return HostSessionVisibilitySnapshot(
        detail = detail(command.host, command.sessionId),
        contentUpdatedAt = updatedAt,
    )
}

internal fun HostSessionWriteQueries.denyExistingOpenSession(openSessionId: UUID?) {
    if (openSessionId != null) {
        throw OpenSessionAlreadyExistsException(openSessionId)
    }
}

internal fun HostSessionWriteQueries.denyOtherOpenSession(
    openSessionId: UUID?,
    sessionId: UUID,
) {
    if (openSessionId != null && openSessionId != sessionId) {
        throw OpenSessionAlreadyExistsException(openSessionId)
    }
}
