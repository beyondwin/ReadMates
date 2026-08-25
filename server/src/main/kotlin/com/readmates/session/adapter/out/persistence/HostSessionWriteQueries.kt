package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.model.AttendanceVersion
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.ProjectionSnapshotIdentity
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate
import java.time.LocalTime
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

internal open class HostSessionWriteLockQueries(
    protected val jdbcTemplate: JdbcTemplate,
    protected val hostSessionQueries: HostSessionQueries,
) {
    fun lockClub(clubId: UUID) {
        jdbcTemplate.queryForObject(
            "select id from clubs where id = ? for update",
            String::class.java,
            clubId.dbString(),
        )
    }

    fun lockParticipantSetRevision(
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
                  and deleted_at is null
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

    fun sessionRevision(
        host: CurrentMember,
        sessionId: UUID,
    ): Long? =
        jdbcTemplate
            .query(
                """
                select session_revision
                from active_sessions
                where id = ? and club_id = ? and deleted_at is null
                """.trimIndent(),
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
                """
                select id, state
                from active_sessions
                where id = ?
                  and club_id = ?
                  and deleted_at is null
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

    fun lockCurrentOpenSession(clubId: UUID): LockedSessionRow? =
        jdbcTemplate
            .query(
                """
                select id, state
                from active_sessions
                where club_id = ?
                  and deleted_at is null
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

    fun requireActiveClubAndMembership(
        clubId: UUID,
        membershipId: UUID,
        hostRequired: Boolean,
    ) {
        val row =
            jdbcTemplate
                .query(
                    """
                    select clubs.status as club_status, memberships.role, memberships.status as membership_status
                    from clubs
                    join memberships on memberships.club_id = clubs.id
                    where clubs.id = ?
                      and memberships.id = ?
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
                ?: deniedActiveMembership()
        if (row.first != "ACTIVE" || row.third != "ACTIVE") {
            deniedActiveMembership()
        }
        if (hostRequired && row.second != "HOST") {
            throw AccessDeniedException("Host role required")
        }
    }
}

internal open class HostSessionWriteReadQueries(
    jdbcTemplate: JdbcTemplate,
    hostSessionQueries: HostSessionQueries,
) : HostSessionWriteLockQueries(jdbcTemplate, hostSessionQueries) {
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
                from active_sessions sessions
                where club_id = ?
                  and state = 'OPEN'
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
            where club_id = ?
              and status = 'ACTIVE'
            order by joined_at is null, joined_at, created_at
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
        )

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
}

internal class HostSessionWriteQueries(
    jdbcTemplate: JdbcTemplate,
    hostSessionQueries: HostSessionQueries,
) : HostSessionWriteReadQueries(jdbcTemplate, hostSessionQueries) {
    fun requireLegacyPublicationWriteAllowed(
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

    fun lockVisibilitySnapshot(command: HostSessionIdCommand): HostSessionVisibilitySnapshot {
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

    fun insertPublicationVersion(sessionId: UUID) {
        jdbcTemplate.update(
            """
            insert into session_publication_versions (session_id, publication_revision)
            values (?, 0)
            """.trimIndent(),
            sessionId.dbString(),
        )
    }

    fun loadVersionVector(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionVersionVector? =
        jdbcTemplate
            .query(
                VERSION_VECTOR_SQL,
                { resultSet, _ -> resultSet.toVersionVector() },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull()

    fun attendanceSnapshotId(
        host: CurrentMember,
        sessionId: UUID,
    ): String {
        val rows =
            jdbcTemplate.query(
                """
                select membership_id, attendance_revision
                from session_participants
                where session_id = ?
                  and club_id = ?
                  and participation_status = 'ACTIVE'
                order by membership_id
                """.trimIndent(),
                { resultSet, _ ->
                    "${resultSet.getString("membership_id")}:${resultSet.getLong("attendance_revision")}"
                },
                sessionId.dbString(),
                host.clubId.dbString(),
            )
        return "att:${rows.joinToString(",")}"
    }

    fun loadAttendanceVersions(
        host: CurrentMember,
        sessionId: UUID,
    ): List<AttendanceVersion> =
        jdbcTemplate.query(
            """
            select membership_id, attendance_revision
            from session_participants
            where session_id = ?
              and club_id = ?
              and participation_status = 'ACTIVE'
            order by membership_id
            """.trimIndent(),
            { resultSet, _ ->
                AttendanceVersion(
                    membershipId = resultSet.uuid("membership_id"),
                    attendanceRevision = resultSet.getLong("attendance_revision"),
                )
            },
            sessionId.dbString(),
            host.clubId.dbString(),
        )

    fun loadProjection(
        host: CurrentMember,
        sessionId: UUID,
        includeTrashed: Boolean = false,
    ): HostProjectionSnapshot? =
        jdbcTemplate
            .query(
                LOAD_PROJECTION_SQL,
                { resultSet, _ ->
                    val versions = resultSet.toVersionVector()
                    val resourceId = resultSet.uuid("id")
                    HostProjectionSnapshot(
                        snapshotId = ProjectionSnapshotIdentity.from(resourceId, versions).snapshotId,
                        sessionId = resourceId.toString(),
                        sessionNumber = resultSet.getInt("number"),
                        title = resultSet.getString("title"),
                        bookTitle = resultSet.getString("book_title"),
                        bookAuthor = resultSet.getString("book_author"),
                        date = resultSet.getObject("session_date", LocalDate::class.java).toString(),
                        startTime = resultSet.getObject("start_time", LocalTime::class.java).toString(),
                        endTime = resultSet.getObject("end_time", LocalTime::class.java).toString(),
                        locationLabel = resultSet.getString("location_label").orEmpty(),
                        state = resultSet.getString("state"),
                        versions = versions,
                        accessScope = SessionAccessScope.valueOf(resultSet.getString("access_scope")),
                        siteVisibility = PublicSiteVisibility.valueOf(resultSet.getString("site_visibility")),
                        visibility = SessionRecordVisibility.valueOf(resultSet.getString("visibility")),
                    )
                },
                sessionId.dbString(),
                host.clubId.dbString(),
                includeTrashed,
            ).firstOrNull()

    fun expectedRevision(expected: ExpectedSessionRevision?): Long = expected?.value ?: -1

    fun throwIfStale(
        updated: Int,
        host: CurrentMember,
        sessionId: UUID,
    ) {
        if (updated > 0) return
        throw revisionConflict(host, sessionId) ?: HostSessionNotFoundException()
    }

    fun revisionConflict(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionRevisionConflictException? {
        val snapshot =
            jdbcTemplate
                .query(
                    """
                    select sessions.session_revision,
                           sessions.exposure_revision,
                           sessions.participant_set_revision,
                           sessions.updated_at,
                           draft.draft_revision,
                           coalesce(revision.live_revision, 0) as live_revision,
                           coalesce(publication.publication_revision, 0) as publication_revision
                    from active_sessions sessions
                    left join session_record_drafts draft
                      on draft.session_id = sessions.id and draft.club_id = sessions.club_id
                    left join (
                      select club_id, session_id, max(version) as live_revision
                      from session_record_revisions
                      group by club_id, session_id
                    ) revision
                      on revision.club_id = sessions.club_id
                     and revision.session_id = sessions.id
                    left join session_publication_versions publication
                      on publication.session_id = sessions.id
                    where sessions.id = ?
                      and sessions.club_id = ?
                      and sessions.deleted_at is null
                    """.trimIndent(),
                    { resultSet, _ ->
                        HostSessionRevisionConflictException(
                            current =
                                SessionVersionVector(
                                    sessionRevision = resultSet.getLong("session_revision"),
                                    exposureRevision = resultSet.getLong("exposure_revision"),
                                    participantSetRevision = resultSet.getLong("participant_set_revision"),
                                    recordDraftRevision =
                                        resultSet.getLong("draft_revision").takeUnless {
                                            resultSet.wasNull()
                                        },
                                    liveRecordRevision =
                                        resultSet.getLong("live_revision").takeIf { value -> value > 0 },
                                    publicationRevision = resultSet.getLong("publication_revision"),
                                ),
                            changedAt =
                                resultSet
                                    .utcOffsetDateTime("updated_at")
                                    .toInstant(),
                            changedByDisplay = loadChangedByDisplay(host, sessionId),
                        )
                    },
                    sessionId.dbString(),
                    host.clubId.dbString(),
                ).firstOrNull()
        return snapshot
    }

    private fun loadChangedByDisplay(
        host: CurrentMember,
        sessionId: UUID,
    ): String? =
        jdbcTemplate
            .query(
                """
                select memberships.short_name
                from host_session_change_audit audit
                join memberships
                  on memberships.id = audit.actor_membership_id
                 and memberships.club_id = audit.club_id
                where audit.club_id = ?
                  and audit.session_id = ?
                order by audit.created_at desc, audit.id desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("short_name") },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()
            ?.takeIf { name -> name.isNotBlank() && '@' !in name }
}

private fun deniedActiveMembership(): Nothing = throw AccessDeniedException("Approved active membership is required")

private const val LOAD_PROJECTION_SQL = """
select sessions.id,
       sessions.number,
       sessions.title,
       sessions.book_title,
       sessions.book_author,
       sessions.session_date,
       sessions.start_time,
       sessions.end_time,
       sessions.location_label,
       sessions.state,
       sessions.visibility,
       sessions.access_scope,
       sessions.session_revision,
       sessions.exposure_revision,
       sessions.participant_set_revision,
       draft.draft_revision,
       coalesce(revision.live_revision, 0) as live_revision,
       coalesce(publication.publication_revision, 0) as publication_revision,
       coalesce(public_session_publications.site_visibility, 'HIDDEN') as site_visibility
from sessions
left join session_record_drafts draft
  on draft.session_id = sessions.id and draft.club_id = sessions.club_id
left join (
  select club_id, session_id, max(version) as live_revision
  from session_record_revisions
  group by club_id, session_id
) revision
  on revision.club_id = sessions.club_id
 and revision.session_id = sessions.id
left join session_publication_versions publication
  on publication.session_id = sessions.id
left join public_session_publications
  on public_session_publications.session_id = sessions.id
 and public_session_publications.club_id = sessions.club_id
where sessions.id = ?
  and sessions.club_id = ?
  and (? or sessions.deleted_at is null)
"""

private const val VERSION_VECTOR_SQL = """
select sessions.session_revision,
       sessions.exposure_revision,
       sessions.participant_set_revision,
       draft.draft_revision,
       coalesce(revision.live_revision, 0) as live_revision,
       coalesce(publication.publication_revision, 0) as publication_revision
from active_sessions sessions
left join session_record_drafts draft
  on draft.session_id = sessions.id and draft.club_id = sessions.club_id
left join (
  select club_id, session_id, max(version) as live_revision
  from session_record_revisions
  group by club_id, session_id
) revision
  on revision.club_id = sessions.club_id
 and revision.session_id = sessions.id
left join session_publication_versions publication
  on publication.session_id = sessions.id
where sessions.id = ?
  and sessions.club_id = ?
  and sessions.deleted_at is null
"""

private fun java.sql.ResultSet.toVersionVector(): SessionVersionVector {
    val draftRaw = getLong("draft_revision")
    val draft = if (wasNull()) null else draftRaw
    val live = getLong("live_revision")
    return SessionVersionVector(
        sessionRevision = getLong("session_revision"),
        exposureRevision = getLong("exposure_revision"),
        participantSetRevision = getLong("participant_set_revision"),
        recordDraftRevision = draft,
        liveRecordRevision = live.takeIf { value -> value > 0 },
        publicationRevision = getLong("publication_revision"),
    )
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
