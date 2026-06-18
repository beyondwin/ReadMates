package com.readmates.sessionclosing.adapter.out.persistence

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.NotificationClosingEvent
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.port.out.LoadSessionClosingStatusPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.security.CurrentMember
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.sql.ResultSet
import java.time.LocalDate
import java.util.UUID

@Component
class JdbcSessionClosingStatusAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadSessionClosingStatusPort {
    override fun loadHostSessionClosingSnapshot(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionClosingSnapshot? {
        val base =
            jdbcTemplate
                .query(
                    """
                    select
                      sessions.id,
                      sessions.number,
                      sessions.book_title,
                      sessions.session_date,
                      sessions.state,
                      sessions.visibility,
                      public_session_publications.public_summary,
                      public_session_publications.is_public,
                      public_session_publications.published_at,
                      exists (
                        select 1
                        from session_feedback_documents
                        where session_feedback_documents.club_id = sessions.club_id
                          and session_feedback_documents.session_id = sessions.id
                      ) as feedback_uploaded,
                      (
                        select count(*)
                        from highlights
                        where highlights.club_id = sessions.club_id
                          and highlights.session_id = sessions.id
                      ) as highlight_count,
                      (
                        select count(*)
                        from one_line_reviews
                        where one_line_reviews.club_id = sessions.club_id
                          and one_line_reviews.session_id = sessions.id
                      ) as one_liner_count
                    from sessions
                    left join public_session_publications
                      on public_session_publications.club_id = sessions.club_id
                     and public_session_publications.session_id = sessions.id
                    where sessions.id = ?
                      and sessions.club_id = ?
                    """.trimIndent(),
                    { rs, _ -> rs.toClosingBase(host.clubSlug) },
                    sessionId.dbString(),
                    host.clubId.dbString(),
                ).firstOrNull()
                ?: return null

        return base.copy(latestNotificationEvent = latestNotificationEvent(sessionId, host.clubId))
    }

    private fun latestNotificationEvent(
        sessionId: UUID,
        clubId: UUID,
    ): NotificationClosingEvent? =
        jdbcTemplate
            .query(
                """
                select event_type, status, created_at
                from notification_event_outbox
                where club_id = ?
                  and aggregate_id = ?
                  and event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
                order by created_at desc, id desc
                limit 1
                """.trimIndent(),
                { rs, _ ->
                    NotificationClosingEvent(
                        eventType = rs.getString("event_type"),
                        status = rs.getString("status").toNotificationClosingStatus(),
                        createdAt = rs.utcOffsetDateTime("created_at"),
                    )
                },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()
}

private fun ResultSet.toClosingBase(clubSlug: String): SessionClosingSnapshot {
    val sessionId = UUID.fromString(getString("id"))
    val visibility = SessionRecordVisibility.valueOf(getString("visibility"))
    val publicSummary = getString("public_summary")
    val isPublic =
        getBoolean("is_public") &&
            getTimestamp("published_at") != null &&
            visibility == SessionRecordVisibility.PUBLIC

    return SessionClosingSnapshot(
        sessionId = sessionId,
        sessionNumber = getInt("number"),
        bookTitle = getString("book_title"),
        meetingDate = getObject("session_date", LocalDate::class.java),
        state = getString("state"),
        recordVisibility = visibility,
        summaryPublished = !publicSummary.isNullOrBlank(),
        highlightCount = getInt("highlight_count"),
        oneLinerCount = getInt("one_liner_count"),
        feedbackDocumentState =
            if (getBoolean("feedback_uploaded")) {
                FeedbackDocumentClosingState.AVAILABLE
            } else {
                FeedbackDocumentClosingState.MISSING
            },
        latestNotificationEvent = null,
        publicVisible = isPublic,
        publicRecordHref = if (isPublic) "/clubs/$clubSlug/sessions/$sessionId" else null,
        memberReflectionHref = "/clubs/$clubSlug/app/sessions/$sessionId",
    )
}

private fun String.toNotificationClosingStatus(): NotificationClosingStatus =
    when (this) {
        "PUBLISHED", "SENT" -> NotificationClosingStatus.PUBLISHED
        "FAILED" -> NotificationClosingStatus.FAILED
        "DEAD" -> NotificationClosingStatus.DEAD
        else -> NotificationClosingStatus.PENDING
    }
