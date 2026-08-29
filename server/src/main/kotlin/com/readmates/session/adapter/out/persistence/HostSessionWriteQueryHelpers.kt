package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.model.ProjectionSnapshotIdentity
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.ResultSet
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

internal class HostSessionWriteLockQueries(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun requireActiveClubAndMembership(
        clubId: UUID,
        membershipId: UUID,
        hostRequired: Boolean,
    ) {
        val membership =
            jdbcTemplate
                .query(
                    ACTIVE_CLUB_MEMBERSHIP_SQL,
                    { resultSet, _ -> resultSet.toActiveClubMembership() },
                    clubId.dbString(),
                    membershipId.dbString(),
                ).firstOrNull()
                ?: deny("Approved active membership is required")
        membership.requireActive()
        if (hostRequired) {
            membership.requireHost()
        }
    }
}

internal class HostSessionProjectionQueries(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun loadProjection(
        host: CurrentMember,
        sessionId: UUID,
        includeTrashed: Boolean,
    ): HostProjectionSnapshot? =
        jdbcTemplate
            .query(
                if (includeTrashed) HOST_ALL_PROJECTION_SQL else HOST_ACTIVE_PROJECTION_SQL,
                { resultSet, _ -> resultSet.toHostProjectionSnapshot() },
                sessionId.dbString(),
                host.clubId.dbString(),
            ).firstOrNull()
}

private data class ActiveClubMembership(
    val clubStatus: String,
    val role: String,
    val membershipStatus: String,
) {
    fun requireActive() {
        if (clubStatus != "ACTIVE" || membershipStatus != "ACTIVE") {
            deny("Approved active membership is required")
        }
    }

    fun requireHost() {
        if (role != "HOST") {
            deny("Host role required")
        }
    }
}

private fun ResultSet.toActiveClubMembership() =
    ActiveClubMembership(
        clubStatus = getString("club_status"),
        role = getString("role"),
        membershipStatus = getString("membership_status"),
    )

private fun ResultSet.toHostProjectionSnapshot(): HostProjectionSnapshot {
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

private fun deny(message: String): Nothing = throw AccessDeniedException(message)

private const val ACTIVE_CLUB_MEMBERSHIP_SQL = """
select clubs.status as club_status, memberships.role, memberships.status as membership_status
from clubs
join memberships on memberships.club_id = clubs.id
where clubs.id = ?
  and memberships.id = ?
"""

private const val HOST_ACTIVE_PROJECTION_SQL = """
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
       sessions.schedule_revision,
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
  and sessions.deleted_at is null
"""

private const val HOST_ALL_PROJECTION_SQL = """
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
       sessions.schedule_revision,
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
"""
