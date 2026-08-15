package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.session.domain.toCompatibility
import com.readmates.sessionrecord.application.model.LiveSessionRecord
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordRevision
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.sessionrecord.application.model.SessionRecordSource
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.sessionrecord.application.port.out.SessionRecordSnapshotCodec
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

internal class SessionRecordPersistenceRows(
    private val codec: SessionRecordSnapshotCodec,
) {
    fun liveRow(rs: ResultSet) =
        SessionRecordLiveRow(
            state = rs.getString("state"),
            accessScope = rs.getString("access_scope"),
            siteVisibility = rs.getString("site_visibility"),
            revision = rs.getLong("live_revision"),
            sessionNumber = rs.getInt("number"),
            bookTitle = rs.getString("book_title"),
            meetingDate = rs.getObject("session_date", LocalDate::class.java),
            sessionUpdatedAt = rs.utcOffsetDateTime("updated_at"),
        )

    fun live(
        sessionId: UUID,
        clubId: UUID,
        row: SessionRecordLiveRow,
        publicationSummary: String,
        highlights: List<SessionRecordEntry>,
        oneLineReviews: List<SessionRecordEntry>,
        feedback: SessionRecordFeedbackDocument,
    ) = LiveSessionRecord(
        sessionId = sessionId,
        clubId = clubId,
        revision = row.revision,
        snapshot =
            SessionRecordSnapshot(
                visibility =
                    SessionRecordVisibility.valueOf(
                        SessionExposure(
                            SessionAccessScope.valueOf(row.accessScope),
                            PublicSiteVisibility.valueOf(row.siteVisibility),
                        ).toCompatibility(row.state).sessionVisibility,
                    ),
                publicationSummary = publicationSummary,
                highlights = highlights,
                oneLineReviews = oneLineReviews,
                feedbackDocument = feedback,
            ),
        sessionNumber = row.sessionNumber,
        bookTitle = row.bookTitle,
        meetingDate = row.meetingDate,
        sessionUpdatedAt = row.sessionUpdatedAt,
    )

    fun entry(rs: ResultSet) =
        SessionRecordEntry(
            membershipId = rs.uuid("membership_id"),
            authorDisplayName = rs.getString("author_display_name"),
            text = rs.getString("text"),
        )

    fun feedback(rs: ResultSet) =
        SessionRecordFeedbackDocument(
            fileName = rs.getString("file_name"),
            title = rs.getString("document_title"),
            markdown = rs.getString("source_text"),
        )

    fun draft(rs: ResultSet) =
        SessionRecordDraft(
            sessionId = rs.uuid("session_id"),
            clubId = rs.uuid("club_id"),
            baseLiveRevision = rs.getLong("base_live_revision"),
            baseSessionUpdatedAt = rs.utcOffsetDateTime("base_session_updated_at"),
            draftRevision = rs.getLong("draft_revision"),
            source = SessionRecordDraftSource.valueOf(rs.getString("source")),
            restoredFromRevisionId = rs.uuidOrNull("restored_from_revision_id"),
            snapshot = codec.decode(rs.getString("snapshot_json")),
            updatedByMembershipId = rs.uuid("updated_by_membership_id"),
            createdAt = rs.utcOffsetDateTime("created_at"),
            updatedAt = rs.utcOffsetDateTime("updated_at"),
        )

    fun revision(rs: ResultSet) =
        SessionRecordRevision(
            id = rs.uuid("id"),
            sessionId = rs.uuid("session_id"),
            clubId = rs.uuid("club_id"),
            version = rs.getLong("version"),
            source = SessionRecordSource.valueOf(rs.getString("source")),
            restoredFromRevisionId = rs.uuidOrNull("restored_from_revision_id"),
            snapshot = codec.decode(rs.getString("snapshot_json")),
            appliedByMembershipId = rs.uuid("applied_by_membership_id"),
            appliedAt = rs.utcOffsetDateTime("applied_at"),
        )
}

internal data class SessionRecordLiveRow(
    val state: String,
    val accessScope: String,
    val siteVisibility: String,
    val revision: Long,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val sessionUpdatedAt: OffsetDateTime,
)
