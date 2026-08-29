package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.model.AttendanceVersion
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import java.sql.ResultSet
import java.util.UUID

internal fun HostSessionWriteQueries.loadVersionVector(
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

internal fun HostSessionWriteQueries.attendanceSnapshotId(
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

internal fun HostSessionWriteQueries.loadAttendanceVersions(
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

internal fun HostSessionWriteQueries.loadProjection(
    host: CurrentMember,
    sessionId: UUID,
    includeTrashed: Boolean = false,
): HostProjectionSnapshot? = projections.loadProjection(host, sessionId, includeTrashed)

internal fun HostSessionWriteQueries.revisionConflict(
    host: CurrentMember,
    sessionId: UUID,
): HostSessionRevisionConflictException? =
    jdbcTemplate
        .query(
            REVISION_CONFLICT_SQL,
            { resultSet, _ ->
                HostSessionRevisionConflictException(
                    current = resultSet.toVersionVector(),
                    changedAt = resultSet.utcOffsetDateTime("updated_at").toInstant(),
                    changedByDisplay = loadChangedByDisplay(host, sessionId),
                )
            },
            sessionId.dbString(),
            host.clubId.dbString(),
        ).firstOrNull()

private fun HostSessionWriteQueries.loadChangedByDisplay(
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

internal fun ResultSet.toVersionVector(): SessionVersionVector {
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
        scheduleRevision = getLong("schedule_revision"),
    )
}

private const val VERSION_VECTOR_SQL = """
select sessions.session_revision,
       sessions.schedule_revision,
       sessions.exposure_revision,
       sessions.participant_set_revision,
       draft.draft_revision,
       coalesce(revision.live_revision, 0) as live_revision,
       coalesce(publication.publication_revision, 0) as publication_revision
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
where sessions.id = ?
  and sessions.club_id = ?
  and sessions.deleted_at is null
"""

private const val REVISION_CONFLICT_SQL = """
select sessions.session_revision,
       sessions.schedule_revision,
       sessions.exposure_revision,
       sessions.participant_set_revision,
       sessions.updated_at,
       draft.draft_revision,
       coalesce(revision.live_revision, 0) as live_revision,
       coalesce(publication.publication_revision, 0) as publication_revision
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
where sessions.id = ?
  and sessions.club_id = ?
  and sessions.deleted_at is null
"""
