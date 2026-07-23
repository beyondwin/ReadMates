package com.readmates.sessionrecord.application.model

import com.readmates.session.application.SessionRecordVisibility
import java.time.OffsetDateTime
import java.util.UUID

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

enum class NotificationDecision {
    SEND,
    SKIP,
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
