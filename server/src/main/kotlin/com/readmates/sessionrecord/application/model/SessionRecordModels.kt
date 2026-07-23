package com.readmates.sessionrecord.application.model

import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.SessionRecordVisibility
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

private val LEGACY_SESSION_RECORD_TIMESTAMP: OffsetDateTime =
    OffsetDateTime.parse("1970-01-01T00:00:00Z")

enum class SessionRecordSource {
    BASELINE,
    MANUAL,
    JSON_IMPORT,
    AI_GENERATED,
    RESTORED,
}

enum class SessionRecordDraftSource {
    MANUAL,
    JSON_IMPORT,
    AI_GENERATED,
    RESTORED,
}

enum class SessionRecordStatus {
    NOT_STARTED,
    INCOMPLETE,
    COMPLETE,
}

data class SessionRecordEntry(
    val membershipId: UUID,
    val authorDisplayName: String,
    val text: String,
)

data class SessionRecordFeedbackDocument(
    val fileName: String,
    val title: String,
    val markdown: String,
)

data class SessionRecordSnapshot(
    val schema: String = "readmates-session-record:v1",
    val visibility: SessionRecordVisibility,
    val publicationSummary: String,
    val highlights: List<SessionRecordEntry>,
    val oneLineReviews: List<SessionRecordEntry>,
    val feedbackDocument: SessionRecordFeedbackDocument,
)

data class EncodedSessionRecordSnapshot(
    val json: String,
    val sha256: String,
)

data class SessionRecordDraft(
    val sessionId: UUID,
    val clubId: UUID,
    val baseLiveRevision: Long,
    val draftRevision: Long,
    val source: SessionRecordDraftSource,
    val restoredFromRevisionId: UUID?,
    val snapshot: SessionRecordSnapshot,
    val updatedByMembershipId: UUID,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
    val baseSessionUpdatedAt: OffsetDateTime = LEGACY_SESSION_RECORD_TIMESTAMP,
)

data class SessionRecordRevision(
    val id: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val version: Long,
    val source: SessionRecordSource,
    val restoredFromRevisionId: UUID?,
    val snapshot: SessionRecordSnapshot,
    val appliedByMembershipId: UUID,
    val appliedAt: OffsetDateTime,
)

data class LiveSessionRecord(
    val sessionId: UUID,
    val clubId: UUID,
    val revision: Long,
    val snapshot: SessionRecordSnapshot,
    val sessionNumber: Int = 0,
    val bookTitle: String = "",
    val meetingDate: LocalDate = LocalDate.MIN,
    val sessionUpdatedAt: OffsetDateTime = LEGACY_SESSION_RECORD_TIMESTAMP,
)

data class SessionRecordEditor(
    val live: LiveSessionRecord,
    val draft: SessionRecordDraft?,
    val draftLiveBaseStale: Boolean,
)

data class SaveSessionRecordDraftCommand(
    val sessionId: UUID,
    val snapshot: SessionRecordSnapshot,
    val expectedDraftRevision: Long?,
    val source: SessionRecordDraftSource = SessionRecordDraftSource.MANUAL,
    val restoredFromRevisionId: UUID? = null,
)

data class RestoreSessionRecordDraftCommand(
    val sessionId: UUID,
    val revisionId: UUID,
    val expectedDraftRevision: Long?,
)

data class PreviewSessionRecordApplyCommand(
    val sessionId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
)

data class ApplySessionRecordCommand(
    val sessionId: UUID,
    val previewId: UUID = UUID(0, 0),
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val notificationDecision: NotificationDecision = NotificationDecision.SKIP,
    val applyRequestId: UUID? = null,
    val expectedDraftHash: String = "",
)

data class HostNotificationComposerContext(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
)

data class SessionRecordApplyPreview(
    val previewId: UUID,
    val eventType: NotificationEventType,
    val targetCount: Int,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
    val excludedCount: Int,
    val expiresAt: OffsetDateTime,
)

data class SessionRecordApplyResult(
    val revisionId: UUID,
    val liveRevision: Long,
    val decisionId: UUID,
    val notificationDecision: NotificationDecision,
    val eventId: UUID?,
)

data class HostSessionRecordCapabilities(
    val sessionRecordDrafts: Boolean = true,
    val hostActionNotificationConfirmationRequired: Boolean,
)

data class CompletedSessionRecordApply(
    val previewId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val notificationDecision: NotificationDecision,
    val decisionId: UUID,
    val eventId: UUID?,
    val revision: SessionRecordRevision,
)

data class SessionRecordApplyReceipt(
    val applyRequestId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val draftSha256: String,
    val composerEventType: NotificationEventType,
    val revision: SessionRecordRevision,
)

enum class SessionRecordError {
    SESSION_NOT_FOUND,
    REVISION_NOT_FOUND,
    DRAFT_STALE,
    LIVE_STALE,
    INVALID_RECORD,
    PREVIEW_ALREADY_CONSUMED,
}

class SessionRecordException(
    val error: SessionRecordError,
    message: String,
) : RuntimeException(message)

enum class HostSessionHistoryType {
    BASIC_INFO_UPDATED,
    ATTENDANCE_UPDATED,
    RECORD_REVISION_APPLIED,
    RECORD_REVISION_RESTORED,
    NOTIFICATION_SENT,
    NOTIFICATION_SKIPPED,
}

data class HostSessionHistoryAttendanceTransition(
    val membershipId: UUID,
    val from: String,
    val to: String,
)

data class HostSessionHistoryItem(
    val id: UUID,
    val type: HostSessionHistoryType,
    val createdAt: OffsetDateTime,
    val actorMembershipId: UUID,
    val changedFields: List<String> = emptyList(),
    val attendanceTransitions: List<HostSessionHistoryAttendanceTransition> = emptyList(),
    val revisionId: UUID? = null,
    val revisionVersion: Long? = null,
    val revisionSource: SessionRecordSource? = null,
    val restoredFromRevisionId: UUID? = null,
    val notificationEventId: UUID? = null,
)

data class HostSessionHistoryCursor(
    val createdAt: OffsetDateTime,
    val typeSort: Int,
    val id: UUID,
)
