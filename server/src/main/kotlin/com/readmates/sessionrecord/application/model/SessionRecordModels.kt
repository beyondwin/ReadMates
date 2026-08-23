package com.readmates.sessionrecord.application.model

import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.domain.NotificationEventType
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

data class RebaseSessionRecordDraftCommand(
    val sessionId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val expectedSessionUpdatedAt: OffsetDateTime,
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
    val applyRequestId: UUID,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val expectedDraftHash: String,
    val idempotencyKey: String? = null,
) {
    @Deprecated("Use content-only apply contract")
    constructor(
        sessionId: UUID,
        previewId: UUID,
        expectedDraftRevision: Long,
        expectedLiveRevision: Long,
        notificationDecision: NotificationDecision,
    ) : this(sessionId, previewId, expectedDraftRevision, expectedLiveRevision, "")
}

data class PublishSessionRecordCorrectionCommand(
    val sessionId: UUID,
    val expectedSessionRevision: Long,
    val expectedDraftRevision: Long,
    val expectedLiveRevision: Long,
    val expectedExposureRevision: Long,
    val expectedPublicationRevision: Long,
)

data class SessionRecordCorrectionVersions(
    val sessionRevision: Long,
    val exposureRevision: Long,
    val participantSetRevision: Long,
    val recordDraftRevision: Long?,
    val liveRecordRevision: Long,
    val publicationRevision: Long,
)

data class SessionRecordCorrectionEditor(
    val state: String,
    val editor: SessionRecordEditor,
    val versions: SessionRecordCorrectionVersions,
)

enum class SessionRecordAccessScope {
    HOST_ONLY,
    GUEST_READABLE,
}

enum class SessionRecordSiteVisibility {
    HIDDEN,
    PUBLIC_RECORD,
}

data class SessionRecordAudienceProjection(
    val accessScope: SessionRecordAccessScope,
    val siteVisibility: SessionRecordSiteVisibility,
    val visibility: SessionRecordVisibility,
    val sessionCompatibilityVisibility: SessionRecordVisibility,
    val publicationVisibility: SessionRecordVisibility,
    val isPublic: Boolean,
)

fun SessionRecordVisibility.toAudienceProjection(state: String): SessionRecordAudienceProjection =
    when (this) {
        SessionRecordVisibility.HOST_ONLY ->
            SessionRecordAudienceProjection(
                accessScope = SessionRecordAccessScope.HOST_ONLY,
                siteVisibility = SessionRecordSiteVisibility.HIDDEN,
                visibility = SessionRecordVisibility.HOST_ONLY,
                sessionCompatibilityVisibility =
                    if (state == "PUBLISHED") SessionRecordVisibility.MEMBER else SessionRecordVisibility.HOST_ONLY,
                publicationVisibility = SessionRecordVisibility.MEMBER,
                isPublic = false,
            )
        SessionRecordVisibility.MEMBER ->
            SessionRecordAudienceProjection(
                accessScope = SessionRecordAccessScope.GUEST_READABLE,
                siteVisibility = SessionRecordSiteVisibility.HIDDEN,
                visibility = SessionRecordVisibility.MEMBER,
                sessionCompatibilityVisibility = SessionRecordVisibility.MEMBER,
                publicationVisibility = SessionRecordVisibility.MEMBER,
                isPublic = false,
            )
        SessionRecordVisibility.PUBLIC -> {
            val publicPlacementAllowed = state == "CLOSED" || state == "PUBLISHED"
            SessionRecordAudienceProjection(
                accessScope = SessionRecordAccessScope.GUEST_READABLE,
                siteVisibility =
                    if (publicPlacementAllowed) {
                        SessionRecordSiteVisibility.PUBLIC_RECORD
                    } else {
                        SessionRecordSiteVisibility.HIDDEN
                    },
                visibility = SessionRecordVisibility.PUBLIC,
                sessionCompatibilityVisibility =
                    if (publicPlacementAllowed) {
                        SessionRecordVisibility.PUBLIC
                    } else {
                        SessionRecordVisibility.MEMBER
                    },
                publicationVisibility =
                    if (publicPlacementAllowed) {
                        SessionRecordVisibility.PUBLIC
                    } else {
                        SessionRecordVisibility.MEMBER
                    },
                isPublic = publicPlacementAllowed,
            )
        }
    }

data class SessionRecordCorrectionPreview(
    val state: String,
    val versions: SessionRecordCorrectionVersions,
    val targetAudience: SessionRecordAudienceProjection,
)

sealed interface PublishSessionRecordCorrectionResult {
    data class Applied(
        val receiptId: UUID,
        val result: SessionRecordApplyResult,
    ) : PublishSessionRecordCorrectionResult

    data class RevisionConflict(
        val current: SessionRecordCorrectionVersions,
    ) : PublishSessionRecordCorrectionResult

    data object NotPublished : PublishSessionRecordCorrectionResult
}

data class HostNotificationComposerContext(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
)

data class SessionRecordApplyPreview(
    val eventType: NotificationEventType,
    val expectedDraftHash: String,
) {
    @get:com.fasterxml.jackson.annotation.JsonIgnore
    val previewId: UUID get() = UUID(0, 0)
}

data class SessionRecordApplyResult(
    val revisionId: UUID,
    val liveRevision: Long,
    val composer: HostNotificationComposerContext,
) {
    @get:com.fasterxml.jackson.annotation.JsonIgnore
    val decisionId: UUID get() = UUID(0, 0)

    @get:com.fasterxml.jackson.annotation.JsonIgnore
    val notificationDecision: NotificationDecision get() = NotificationDecision.SKIP

    @get:com.fasterxml.jackson.annotation.JsonIgnore
    val eventId: UUID? get() = null
}

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
    val hostMembershipId: UUID,
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
    APPLY_REQUEST_ALREADY_USED,
    INVALID_APPLY_CONTRACT,
}

class SessionRecordException(
    val error: SessionRecordError,
    message: String,
) : RuntimeException(message)

class InvalidHostSessionHistoryCursorException : RuntimeException("Invalid host session history cursor")

private const val BASIC_INFO_SORT = 10
private const val ATTENDANCE_SORT = 20
private const val RECORD_REVISION_APPLIED_SORT = 30
private const val RECORD_REVISION_RESTORED_SORT = 40
private const val NOTIFICATION_SENT_SORT = 50
private const val NOTIFICATION_SKIPPED_SORT = 60
private const val SESSION_OPENED_SORT = 70
private const val SESSION_CLOSED_SORT = 80
private const val SESSION_PUBLISHED_SORT = 90
private const val SESSION_REOPENED_SORT = 100
private const val SESSION_UNPUBLISHED_SORT = 110
private const val SESSION_RETURNED_TO_DRAFT_SORT = 120
private const val SESSION_DELETED_SORT = 130
private const val SESSION_RESTORED_SORT = 140

enum class HostSessionHistoryType(
    val typeSort: Int,
) {
    BASIC_INFO_UPDATED(BASIC_INFO_SORT),
    ATTENDANCE_UPDATED(ATTENDANCE_SORT),
    RECORD_REVISION_APPLIED(RECORD_REVISION_APPLIED_SORT),
    RECORD_REVISION_RESTORED(RECORD_REVISION_RESTORED_SORT),
    NOTIFICATION_SENT(NOTIFICATION_SENT_SORT),
    NOTIFICATION_SKIPPED(NOTIFICATION_SKIPPED_SORT),
    SESSION_OPENED(SESSION_OPENED_SORT),
    SESSION_CLOSED(SESSION_CLOSED_SORT),
    SESSION_PUBLISHED(SESSION_PUBLISHED_SORT),
    SESSION_REOPENED(SESSION_REOPENED_SORT),
    SESSION_UNPUBLISHED(SESSION_UNPUBLISHED_SORT),
    SESSION_RETURNED_TO_DRAFT(SESSION_RETURNED_TO_DRAFT_SORT),
    SESSION_DELETED(SESSION_DELETED_SORT),
    SESSION_RESTORED(SESSION_RESTORED_SORT),
}

data class HostSessionHistoryAttendanceTransition(
    val membershipId: UUID,
    val from: String,
    val to: String,
)

data class HostSessionHistoryRecovery(
    val action: String,
    val availability: String,
    val blockedReason: String? = null,
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
    val fromState: String? = null,
    val toState: String? = null,
    val reasonCode: String? = null,
    val reasonNote: String? = null,
    val recovery: HostSessionHistoryRecovery? = null,
)

data class HostSessionHistoryCursor(
    val createdAt: OffsetDateTime,
    val typeSort: Int,
    val id: UUID,
)
