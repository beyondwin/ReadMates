package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.model.ManualNotificationDispatchListItem
import com.readmates.notification.application.model.ManualNotificationEligibility
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationRecentDispatch
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
import com.readmates.notification.application.port.out.ManualNotificationSessionContext
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import java.sql.ResultSet

internal object ManualNotificationDispatchRows {
    fun sessionContext(resultSet: ResultSet): ManualNotificationSessionContext =
        ManualNotificationSessionContext(
            sessionId = resultSet.uuid("id"),
            clubId = resultSet.uuid("club_id"),
            sessionNumber = resultSet.getInt("number"),
            bookTitle = resultSet.getString("book_title"),
            date = resultSet.getDate("session_date")?.toLocalDate(),
            state = resultSet.getString("state"),
            visibility = resultSet.getString("visibility"),
            feedbackDocumentUploaded = resultSet.getBoolean("feedback_document_uploaded"),
            feedbackDocumentVersion = resultSet.getInt("feedback_document_version").takeUnless { resultSet.wasNull() },
            sessionRecordContentRevision = resultSet.getString("session_record_content_revision"),
        )

    fun confirmedDispatch(
        resultSet: ResultSet,
        status: ManualNotificationConfirmInsertStatus,
    ): ManualNotificationConfirmedDispatch =
        ManualNotificationConfirmedDispatch(
            manualDispatchId = resultSet.uuid("id"),
            eventId = resultSet.uuid("event_id"),
            createdAt = resultSet.utcOffsetDateTime("created_at"),
            status = status,
            summary =
                ManualNotificationConfirmSummary(
                    targetCount = resultSet.getInt("target_count"),
                    requestedChannels =
                        ManualNotificationRequestedChannels.valueOf(resultSet.getString("requested_channels")),
                    expectedInAppCount = resultSet.getInt("expected_in_app_count"),
                    expectedEmailCount = resultSet.getInt("expected_email_count"),
                ),
        )

    fun memberOption(resultSet: ResultSet): ManualNotificationMemberOption {
        val email = resultSet.getString("email")
        val emailEnabled = resultSet.getBoolean("email_enabled")
        return ManualNotificationMemberOption(
            membershipId = resultSet.uuid("membership_id"),
            displayName = resultSet.getString("display_name"),
            maskedEmail = maskEmail(email),
            role = resultSet.getString("role"),
            membershipStatus = resultSet.getString("status"),
            sessionParticipationStatus = resultSet.getString("participation_status"),
            attendanceStatus = resultSet.getString("attendance_status"),
            emailEligibility = emailEligibility(email, emailEnabled),
            inAppEligibility = ManualNotificationEligibility.ELIGIBLE,
        )
    }

    fun recentDispatch(resultSet: ResultSet): ManualNotificationRecentDispatch =
        ManualNotificationRecentDispatch(
            manualDispatchId = resultSet.uuid("id"),
            eventType = NotificationEventType.valueOf(resultSet.getString("event_type")),
            requestedChannels = ManualNotificationRequestedChannels.valueOf(resultSet.getString("requested_channels")),
            createdAt = resultSet.utcOffsetDateTime("created_at"),
            requestedBy = maskEmail(resultSet.getString("requested_by_email")),
            targetCount = resultSet.getInt("target_count"),
        )

    fun dispatchListItem(resultSet: ResultSet): ManualNotificationDispatchListItem =
        ManualNotificationDispatchListItem(
            manualDispatchId = resultSet.uuid("manual_dispatch_id"),
            eventId = resultSet.uuid("event_id"),
            source = NotificationDispatchSource.MANUAL,
            eventType = NotificationEventType.valueOf(resultSet.getString("event_type")),
            sessionId = resultSet.uuid("session_id"),
            sessionNumber = resultSet.getInt("session_number"),
            bookTitle = resultSet.getString("book_title"),
            requestedChannels = ManualNotificationRequestedChannels.valueOf(resultSet.getString("requested_channels")),
            audience = ManualNotificationAudience.valueOf(resultSet.getString("audience")),
            resend = resultSet.getBoolean("resend"),
            requestedBy = maskEmail(resultSet.getString("requested_by_email")),
            targetCount = resultSet.getInt("target_count"),
            expectedInAppCount = resultSet.getInt("expected_in_app_count"),
            expectedEmailCount = resultSet.getInt("expected_email_count"),
            eventStatus = NotificationEventOutboxStatus.valueOf(resultSet.getString("event_status")),
            createdAt = resultSet.utcOffsetDateTime("created_at"),
        )

    private fun emailEligibility(
        email: String?,
        emailEnabled: Boolean,
    ): ManualNotificationEligibility =
        when {
            email.isNullOrBlank() -> ManualNotificationEligibility.EMAIL_MISSING
            !emailEnabled -> ManualNotificationEligibility.EMAIL_DISABLED
            else -> ManualNotificationEligibility.ELIGIBLE
        }

    private fun maskEmail(email: String?): String {
        val value = email?.trim().orEmpty()
        val at = value.indexOf('@')
        val domain = value.substring((at + 1).coerceAtMost(value.length))
        return if (at <= 0 || at == value.lastIndex || domain.isBlank()) {
            "숨김"
        } else {
            "${value.first()}***@$domain"
        }
    }
}
