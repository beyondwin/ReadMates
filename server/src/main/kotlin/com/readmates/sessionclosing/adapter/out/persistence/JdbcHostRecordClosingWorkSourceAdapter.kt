package com.readmates.sessionclosing.adapter.out.persistence

import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.session.domain.SessionExposure
import com.readmates.session.domain.toCompatibility
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.NotificationClosingEvent
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.port.out.HostRecordClosingVersionVector
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQuery
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryPort
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceQueryResult
import com.readmates.sessionclosing.application.port.out.HostRecordClosingWorkSourceRow
import com.readmates.sessionclosing.application.service.closingDecision
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcHostRecordClosingWorkSourceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostRecordClosingWorkSourceQueryPort {
    override fun load(query: HostRecordClosingWorkSourceQuery): HostRecordClosingWorkSourceQueryResult =
        HostRecordClosingWorkSourceQueryResult.Available(
            loadCurrent(query.clubId) + loadCompleted(query),
        )

    private fun loadCurrent(clubId: UUID): List<HostRecordClosingWorkSourceRow> =
        jdbcTemplate.query(
            CURRENT_CLOSING_ROWS_SQL,
            { rs, _ -> rs.toCurrentRow(clubId) },
            clubId.dbString(),
        )

    private fun loadCompleted(query: HostRecordClosingWorkSourceQuery): List<HostRecordClosingWorkSourceRow> =
        jdbcTemplate.query(
            COMPLETED_CLOSING_ROWS_SQL,
            { rs, _ -> rs.toCompletedRow() },
            query.clubId.dbString(),
            query.completedSince.toUtcLocalDateTime(),
        )
}

private fun ResultSet.toCurrentRow(clubId: UUID): HostRecordClosingWorkSourceRow {
    val sessionId = uuid("id")
    val state = getString("state")
    val siteVisibility = getString("site_visibility")?.let(PublicSiteVisibility::valueOf) ?: PublicSiteVisibility.HIDDEN
    val exposure = SessionExposure(SessionAccessScope.valueOf(getString("access_scope")), siteVisibility)
    val latestEventType = getString("latest_event_type")
    val latestEventStatus = getString("latest_event_status")
    val latestEventAt = getTimestamp("latest_event_at")?.toLocalDateTime()?.atOffset(ZoneOffset.UTC)
    val snapshot =
        SessionClosingSnapshot(
            sessionId = sessionId,
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            meetingDate = getObject("session_date", java.time.LocalDate::class.java),
            state = state,
            recordVisibility = SessionRecordVisibility.valueOf(exposure.toCompatibility(state).sessionVisibility),
            summaryPublished = !getString("public_summary").isNullOrBlank(),
            highlightCount = getInt("highlight_count"),
            oneLinerCount = getInt("one_liner_count"),
            feedbackDocumentState =
                if (getBoolean("feedback_uploaded")) {
                    FeedbackDocumentClosingState.AVAILABLE
                } else {
                    FeedbackDocumentClosingState.MISSING
                },
            latestNotificationEvent =
                if (latestEventType != null && latestEventStatus != null && latestEventAt != null) {
                    NotificationClosingEvent(
                        latestEventType,
                        latestEventStatus.toNotificationClosingStatus(),
                        latestEventAt,
                    )
                } else {
                    null
                },
            publicVisible = state == "PUBLISHED" && siteVisibility == PublicSiteVisibility.PUBLIC_RECORD,
            publicRecordHref =
                if (state == "PUBLISHED" && siteVisibility == PublicSiteVisibility.PUBLIC_RECORD) {
                    "/clubs/$clubId/sessions/$sessionId"
                } else {
                    null
                },
            memberReflectionHref = null,
        )
    val decision = snapshot.closingDecision()
    return HostRecordClosingWorkSourceRow(
        sessionId = sessionId,
        sourceGeneration = versionVector().sourceGeneration(sessionId),
        overallState = decision.state,
        primaryAction = decision.primaryAction,
        dueAt = utcOffsetDateTime("due_at"),
        resolvedAt = null,
        receiptId = null,
        receiptState = null,
        receiptSummary = null,
    )
}

private fun ResultSet.toCompletedRow(): HostRecordClosingWorkSourceRow {
    val sessionId = uuid("resource_id")
    val resultingVector = versionVector()
    val prePublishVector = resultingVector.copy(sessionRevision = resultingVector.sessionRevision - 1)
    return HostRecordClosingWorkSourceRow(
        sessionId = sessionId,
        sourceGeneration = prePublishVector.sourceGeneration(sessionId),
        overallState = ClosingOverallState.PUBLISHED,
        primaryAction = ClosingPrimaryAction.REVIEW_PUBLIC_PAGE,
        dueAt = utcOffsetDateTime("due_at"),
        resolvedAt = utcOffsetDateTime("resolved_at"),
        receiptId = uuid("receipt_id"),
        receiptState = "PUBLISHED",
        receiptSummary = "기록 공개 완료",
    )
}

private fun ResultSet.versionVector() =
    HostRecordClosingVersionVector(
        sessionRevision = getLong("session_revision"),
        exposureRevision = getLong("exposure_revision"),
        participantSetRevision = getLong("participant_set_revision"),
        recordDraftRevision = getLongOrNull("record_draft_revision"),
        liveRecordRevision = getLongOrNull("live_record_revision"),
        publicationRevision = getLong("publication_revision"),
        scheduleRevision = getLong("schedule_revision"),
    )

private fun ResultSet.getLongOrNull(column: String): Long? {
    val value = getLong(column)
    return if (wasNull()) null else value
}

private fun String.toNotificationClosingStatus(): NotificationClosingStatus =
    when (this) {
        "PUBLISHED", "SENT" -> NotificationClosingStatus.PUBLISHED
        "FAILED" -> NotificationClosingStatus.FAILED
        "DEAD" -> NotificationClosingStatus.DEAD
        else -> NotificationClosingStatus.PENDING
    }

private val CURRENT_CLOSING_ROWS_SQL =
    """
    select
      sessions.id,
      sessions.number,
      sessions.book_title,
      sessions.session_date,
      timestamp(sessions.session_date, sessions.end_time) due_at,
      sessions.state,
      sessions.access_scope,
      sessions.session_revision,
      sessions.exposure_revision,
      sessions.participant_set_revision,
      sessions.schedule_revision,
      drafts.draft_revision record_draft_revision,
      (
        select max(revisions.version)
        from session_record_revisions revisions
        where revisions.club_id = sessions.club_id and revisions.session_id = sessions.id
      ) live_record_revision,
      coalesce(publication_versions.publication_revision, 0) publication_revision,
      publications.public_summary,
      publications.site_visibility,
      exists (
        select 1 from session_feedback_documents feedback
        where feedback.club_id = sessions.club_id and feedback.session_id = sessions.id
      ) feedback_uploaded,
      (
        select count(*) from highlights
        where highlights.club_id = sessions.club_id and highlights.session_id = sessions.id
      ) highlight_count,
      (
        select count(*) from one_line_reviews
        where one_line_reviews.club_id = sessions.club_id and one_line_reviews.session_id = sessions.id
      ) one_liner_count,
      (
        select events.event_type from notification_event_outbox events
        where events.club_id = sessions.club_id and events.aggregate_id = sessions.id
          and events.event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
        order by events.created_at desc, events.id desc limit 1
      ) latest_event_type,
      (
        select events.status from notification_event_outbox events
        where events.club_id = sessions.club_id and events.aggregate_id = sessions.id
          and events.event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
        order by events.created_at desc, events.id desc limit 1
      ) latest_event_status,
      (
        select events.created_at from notification_event_outbox events
        where events.club_id = sessions.club_id and events.aggregate_id = sessions.id
          and events.event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
        order by events.created_at desc, events.id desc limit 1
      ) latest_event_at
    from active_sessions sessions
    left join session_record_drafts drafts
      on drafts.club_id = sessions.club_id and drafts.session_id = sessions.id
    left join session_publication_versions publication_versions
      on publication_versions.session_id = sessions.id
    left join public_session_publications publications
      on publications.club_id = sessions.club_id and publications.session_id = sessions.id
    where sessions.club_id = ?
      and sessions.state in ('OPEN', 'CLOSED', 'PUBLISHED')
    order by sessions.number, sessions.id
    """.trimIndent()

private val COMPLETED_CLOSING_ROWS_SQL =
    """
    with ranked_publish_receipts as (
      select
        receipts.*,
        row_number() over (
          partition by
            receipts.club_id,
            receipts.resource_id,
            receipts.session_revision,
            receipts.exposure_revision,
            receipts.participant_set_revision,
            coalesce(receipts.record_draft_revision, -1),
            coalesce(receipts.live_record_revision, -1),
            receipts.publication_revision,
            receipts.schedule_revision
          order by receipts.created_at, receipts.id
        ) vector_ordinal
      from host_session_mutation_receipts receipts
      where receipts.club_id = ?
        and receipts.operation = 'SESSION_PUBLISH'
        and receipts.session_revision > 0
        and receipts.created_at >= ?
    )
    select
      receipts.id receipt_id,
      receipts.resource_id,
      receipts.session_revision,
      receipts.exposure_revision,
      receipts.participant_set_revision,
      receipts.record_draft_revision,
      receipts.live_record_revision,
      receipts.publication_revision,
      receipts.schedule_revision,
      receipts.created_at resolved_at,
      timestamp(sessions.session_date, sessions.end_time) due_at
    from ranked_publish_receipts receipts
    join active_sessions sessions
      on sessions.club_id = receipts.club_id and sessions.id = receipts.resource_id
    where receipts.vector_ordinal = 1
    order by receipts.created_at, receipts.id
    """.trimIndent()
