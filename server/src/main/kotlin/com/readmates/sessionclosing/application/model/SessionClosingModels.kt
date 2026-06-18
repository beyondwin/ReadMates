package com.readmates.sessionclosing.application.model

import com.readmates.session.application.SessionRecordVisibility
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
