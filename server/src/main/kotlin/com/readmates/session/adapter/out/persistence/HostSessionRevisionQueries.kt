package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.model.ProjectionSnapshotIdentity
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

internal class HostSessionRevisionQueries(
    private val jdbcTemplate: JdbcTemplate,
) {
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
                where session_id = ? and club_id = ? and participation_status = 'ACTIVE'
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

    fun loadProjection(
        host: CurrentMember,
        sessionId: UUID,
    ): HostProjectionSnapshot? =
        jdbcTemplate
            .query(
                ACTIVE_PROJECTION_SQL,
                { resultSet, _ -> resultSet.toHostProjectionSnapshot() },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull()

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
                where audit.club_id = ? and audit.session_id = ?
                order by audit.created_at desc, audit.id desc
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("short_name") },
                host.clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()
            ?.takeIf { name -> name.isNotBlank() && '@' !in name }
}

internal fun java.sql.ResultSet.toHostProjectionSnapshot(): HostProjectionSnapshot {
    val versions = toVersionVector()
    val resourceId = uuid("id")
    return HostProjectionSnapshot(
        snapshotId = ProjectionSnapshotIdentity.from(resourceId, versions).snapshotId,
        sessionId = resourceId.toString(),
        sessionNumber = getInt("number"),
        title = getString("title"),
        bookTitle = getString("book_title"),
        bookAuthor = getString("book_author"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        startTime = getObject("start_time", LocalTime::class.java).toString(),
        endTime = getObject("end_time", LocalTime::class.java).toString(),
        locationLabel = getString("location_label").orEmpty(),
        state = getString("state"),
        versions = versions,
        accessScope = SessionAccessScope.valueOf(getString("access_scope")),
        siteVisibility = PublicSiteVisibility.valueOf(getString("site_visibility")),
        visibility = SessionRecordVisibility.valueOf(getString("visibility")),
    )
}

internal fun java.sql.ResultSet.toVersionVector(): SessionVersionVector {
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
  on revision.club_id = sessions.club_id and revision.session_id = sessions.id
left join session_publication_versions publication on publication.session_id = sessions.id
where sessions.id = ? and sessions.club_id = ?
"""

private const val ACTIVE_PROJECTION_SQL = """
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
from active_sessions sessions
left join session_record_drafts draft
  on draft.session_id = sessions.id and draft.club_id = sessions.club_id
left join (
  select club_id, session_id, max(version) as live_revision
  from session_record_revisions
  group by club_id, session_id
) revision
  on revision.club_id = sessions.club_id and revision.session_id = sessions.id
left join session_publication_versions publication on publication.session_id = sessions.id
left join public_session_publications
  on public_session_publications.session_id = sessions.id
 and public_session_publications.club_id = sessions.club_id
where sessions.id = ? and sessions.club_id = ?
"""

private const val REVISION_CONFLICT_SQL = """
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
  on revision.club_id = sessions.club_id and revision.session_id = sessions.id
left join session_publication_versions publication on publication.session_id = sessions.id
where sessions.id = ? and sessions.club_id = ?
"""
