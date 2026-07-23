package com.readmates.sessionclosing.application.model

import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

enum class ClosingOverallState {
    NOT_STARTED,
    IN_PROGRESS,
    BLOCKED,
    READY,
    PUBLISHED,
}

enum class ClosingPrimaryAction {
    CLOSE_SESSION,
    IMPORT_RECORDS,
    PUBLISH_RECORDS,
    SEND_NOTIFICATION,
    REVIEW_PUBLIC_PAGE,
    NONE,
}

enum class ClosingChecklistId {
    SESSION_CLOSED,
    RECORD_PACKAGE_SAVED,
    FEEDBACK_DOCUMENT_READY,
    MEMBER_NOTIFICATION_SENT,
    PUBLIC_RECORD_VISIBLE,
    PUBLIC_SHOWCASE_READY,
}

enum class ClosingChecklistState {
    DONE,
    ACTION_REQUIRED,
    BLOCKED,
    NOT_APPLICABLE,
}

enum class FeedbackDocumentClosingState {
    AVAILABLE,
    MISSING,
    LOCKED,
    INVALID,
}

enum class NotificationClosingStatus {
    PENDING,
    PUBLISHED,
    FAILED,
    DEAD,
}

data class NotificationClosingEvent(
    val eventType: String,
    val status: NotificationClosingStatus,
    val createdAt: OffsetDateTime,
)

data class SessionClosingSnapshot(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val state: String,
    val recordVisibility: SessionRecordVisibility,
    val summaryPublished: Boolean,
    val highlightCount: Int,
    val oneLinerCount: Int,
    val feedbackDocumentState: FeedbackDocumentClosingState,
    val latestNotificationEvent: NotificationClosingEvent?,
    val publicVisible: Boolean,
    val publicRecordHref: String?,
    val memberReflectionHref: String?,
)

data class HostSessionClosingStatus(
    val session: ClosingSessionSummary,
    val overall: ClosingOverall,
    val checklist: List<ClosingChecklistItem>,
    val evidence: ClosingEvidence,
)

data class ClosingSessionSummary(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val state: String,
    val recordVisibility: SessionRecordVisibility,
)

data class ClosingOverall(
    val state: ClosingOverallState,
    val label: String,
    val primaryAction: ClosingPrimaryAction,
)

data class ClosingChecklistItem(
    val id: ClosingChecklistId,
    val state: ClosingChecklistState,
    val label: String,
    val detail: String,
    val href: String? = null,
)

data class ClosingEvidence(
    val summaryPublished: Boolean,
    val highlightCount: Int,
    val oneLinerCount: Int,
    val feedbackDocumentState: FeedbackDocumentClosingState,
    val latestNotificationEvent: NotificationClosingEvent?,
    val publicRecordHref: String?,
    val memberReflectionHref: String?,
)

object SessionRecordReadinessPolicy {
    fun recordStatus(
        summaryPublished: Boolean,
        highlightCount: Int,
        oneLinerCount: Int,
        feedbackReady: Boolean,
        hasDraft: Boolean,
    ): SessionRecordStatus =
        recordStatus(
            recordSaved = recordSaved(summaryPublished, highlightCount, oneLinerCount),
            feedbackReady = feedbackReady,
            hasDraft = hasDraft,
        )

    fun recordStatus(
        recordSaved: Boolean,
        feedbackReady: Boolean,
        hasDraft: Boolean,
    ): SessionRecordStatus =
        when {
            recordSaved && feedbackReady && !hasDraft -> SessionRecordStatus.COMPLETE
            recordSaved || feedbackReady || hasDraft -> SessionRecordStatus.INCOMPLETE
            else -> SessionRecordStatus.NOT_STARTED
        }

    fun recordSaved(
        summaryPublished: Boolean,
        highlightCount: Int,
        oneLinerCount: Int,
    ): Boolean = summaryPublished || highlightCount > 0 || oneLinerCount > 0

    fun needsAttention(
        state: String,
        recordStatus: SessionRecordStatus,
        hasDraft: Boolean,
    ): Boolean = state in setOf("CLOSED", "PUBLISHED") && (recordStatus != SessionRecordStatus.COMPLETE || hasDraft)
}
