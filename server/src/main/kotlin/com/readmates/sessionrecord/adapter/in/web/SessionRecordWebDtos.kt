@file:Suppress("TooManyFunctions", "ktlint:standard:package-name")

package com.readmates.sessionrecord.adapter.`in`.web

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.sessionrecord.application.model.HostSessionHistoryAttendanceTransition
import com.readmates.sessionrecord.application.model.HostSessionHistoryItem
import com.readmates.sessionrecord.application.model.PreviewSessionRecordApplyCommand
import com.readmates.sessionrecord.application.model.RestoreSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SaveSessionRecordDraftCommand
import com.readmates.sessionrecord.application.model.SessionRecordApplyPreview
import com.readmates.sessionrecord.application.model.SessionRecordApplyResult
import com.readmates.sessionrecord.application.model.SessionRecordDraft
import com.readmates.sessionrecord.application.model.SessionRecordDraftSource
import com.readmates.sessionrecord.application.model.SessionRecordEditor
import com.readmates.sessionrecord.application.model.SessionRecordEntry
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.model.SessionRecordFeedbackDocument
import com.readmates.sessionrecord.application.model.SessionRecordSnapshot
import com.readmates.shared.paging.CursorPage
import jakarta.validation.Valid
import jakarta.validation.constraints.Positive
import jakarta.validation.constraints.PositiveOrZero
import java.time.OffsetDateTime
import java.util.UUID

data class SessionRecordEntryRequest(
    val membershipId: String,
    val authorDisplayName: String,
    val text: String,
) {
    fun toDomain() =
        SessionRecordEntry(
            membershipId = parseRecordUuid(membershipId),
            authorDisplayName = authorDisplayName,
            text = text,
        )
}

data class SessionRecordFeedbackDocumentRequest(
    val fileName: String,
    val title: String,
    val markdown: String,
) {
    fun toDomain() = SessionRecordFeedbackDocument(fileName, title, markdown)
}

data class SessionRecordSnapshotRequest(
    val visibility: SessionRecordVisibility,
    val publicationSummary: String,
    @field:Valid val highlights: List<SessionRecordEntryRequest>,
    @field:Valid val oneLineReviews: List<SessionRecordEntryRequest>,
    @field:Valid val feedbackDocument: SessionRecordFeedbackDocumentRequest,
) {
    fun toDomain() =
        SessionRecordSnapshot(
            visibility = visibility,
            publicationSummary = publicationSummary,
            highlights = highlights.map(SessionRecordEntryRequest::toDomain),
            oneLineReviews = oneLineReviews.map(SessionRecordEntryRequest::toDomain),
            feedbackDocument = feedbackDocument.toDomain(),
        )
}

data class SaveSessionRecordDraftRequest(
    @field:Positive val expectedDraftRevision: Long?,
    @field:Valid val snapshot: SessionRecordSnapshotRequest,
) {
    fun toCommand(sessionId: UUID) =
        SaveSessionRecordDraftCommand(
            sessionId = sessionId,
            snapshot = snapshot.toDomain(),
            expectedDraftRevision = expectedDraftRevision,
        )
}

data class PreviewSessionRecordApplyRequest(
    @field:Positive val expectedDraftRevision: Long,
    @field:PositiveOrZero val expectedLiveRevision: Long,
) {
    @Suppress("MaxLineLength")
    fun toCommand(sessionId: UUID) = PreviewSessionRecordApplyCommand(sessionId, expectedDraftRevision, expectedLiveRevision)
}

data class ApplySessionRecordRequest(
    val applyRequestId: String,
    @field:Positive val expectedDraftRevision: Long,
    @field:PositiveOrZero val expectedLiveRevision: Long,
    val expectedDraftHash: String,
    val previewId: String? = null,
    val notificationDecision: NotificationDecision? = null,
) {
    fun toCommand(sessionId: UUID): ApplySessionRecordCommand {
        if (previewId != null || notificationDecision != null) {
            throw SessionRecordException(
                SessionRecordError.INVALID_APPLY_CONTRACT,
                "Legacy notification decision contract is not accepted",
            )
        }
        return ApplySessionRecordCommand(
            sessionId,
            parseRecordUuid(applyRequestId),
            expectedDraftRevision,
            expectedLiveRevision,
            expectedDraftHash,
        )
    }
}

data class RestoreSessionRecordDraftRequest(
    @field:Positive val expectedDraftRevision: Long?,
) {
    fun toCommand(
        sessionId: UUID,
        revisionId: UUID,
    ) = RestoreSessionRecordDraftCommand(sessionId, revisionId, expectedDraftRevision)
}

data class SessionRecordSnapshotResponse(
    val schema: String,
    val visibility: SessionRecordVisibility,
    val publicationSummary: String,
    val highlights: List<SessionRecordEntryResponse>,
    val oneLineReviews: List<SessionRecordEntryResponse>,
    val feedbackDocument: SessionRecordFeedbackDocumentResponse,
)

data class SessionRecordEntryResponse(
    val membershipId: String,
    val authorDisplayName: String,
    val text: String,
)

data class SessionRecordFeedbackDocumentResponse(
    val fileName: String,
    val title: String,
    val markdown: String,
)

data class SessionRecordDraftResponse(
    val sessionId: String,
    val baseLiveRevision: Long,
    val draftRevision: Long,
    val source: SessionRecordDraftSource,
    val restoredFromRevisionId: String?,
    val snapshot: SessionRecordSnapshotResponse,
    val updatedAt: OffsetDateTime,
)

data class SessionRecordValidationSummaryResponse(
    val valid: Boolean,
    val issues: List<String>,
)

data class SessionRecordEditorResponse(
    val sessionId: String,
    val liveRevision: Long,
    val liveSnapshot: SessionRecordSnapshotResponse,
    val draft: SessionRecordDraftResponse?,
    val draftLiveBaseStale: Boolean,
    val validationSummary: SessionRecordValidationSummaryResponse,
)

data class SessionRecordApplyPreviewResponse(
    val eventType: NotificationEventType,
    val expectedDraftHash: String,
)

data class SessionRecordApplyResultResponse(
    val revisionId: String,
    val liveRevision: Long,
    val composer: HostNotificationComposerContext,
)

data class HostSessionHistoryPageResponse(
    val items: List<HostSessionHistoryItemResponse>,
    val nextCursor: String?,
)

data class HostSessionHistoryItemResponse(
    val id: String,
    val type: String,
    val createdAt: OffsetDateTime,
    val actorMembershipId: String,
    val changedFields: List<String>,
    val attendanceTransitions: List<HostSessionHistoryAttendanceTransitionResponse>,
    val revisionId: String?,
    val revisionVersion: Long?,
    val revisionSource: String?,
    val restoredFromRevisionId: String?,
    val notificationEventId: String?,
)

data class HostSessionHistoryAttendanceTransitionResponse(
    val membershipId: String,
    val from: String,
    val to: String,
)

fun SessionRecordEditor.toResponse() =
    SessionRecordEditorResponse(
        sessionId = live.sessionId.toString(),
        liveRevision = live.revision,
        liveSnapshot = live.snapshot.toResponse(),
        draft = draft?.toResponse(),
        draftLiveBaseStale = draftLiveBaseStale,
        validationSummary =
            SessionRecordValidationSummaryResponse(
                valid = !draftLiveBaseStale,
                issues = if (draftLiveBaseStale) listOf("LIVE_REVISION_STALE") else emptyList(),
            ),
    )

fun SessionRecordDraft.toResponse() =
    SessionRecordDraftResponse(
        sessionId = sessionId.toString(),
        baseLiveRevision = baseLiveRevision,
        draftRevision = draftRevision,
        source = source,
        restoredFromRevisionId = restoredFromRevisionId?.toString(),
        snapshot = snapshot.toResponse(),
        updatedAt = updatedAt,
    )

fun SessionRecordApplyPreview.toResponse() =
    SessionRecordApplyPreviewResponse(
        eventType,
        expectedDraftHash,
    )

fun SessionRecordApplyResult.toResponse() =
    SessionRecordApplyResultResponse(
        revisionId.toString(),
        liveRevision,
        composer,
    )

fun CursorPage<HostSessionHistoryItem>.toHistoryResponse() =
    HostSessionHistoryPageResponse(
        items = items.map(HostSessionHistoryItem::toResponse),
        nextCursor = nextCursor,
    )

private fun SessionRecordSnapshot.toResponse() =
    SessionRecordSnapshotResponse(
        schema,
        visibility,
        publicationSummary,
        highlights.map(SessionRecordEntry::toResponse),
        oneLineReviews.map(SessionRecordEntry::toResponse),
        feedbackDocument.toResponse(),
    )

@Suppress("MaxLineLength")
private fun SessionRecordEntry.toResponse() = SessionRecordEntryResponse(membershipId.toString(), authorDisplayName, text)

@Suppress("MaxLineLength")
private fun SessionRecordFeedbackDocument.toResponse() = SessionRecordFeedbackDocumentResponse(fileName, title, markdown)

private fun HostSessionHistoryItem.toResponse() =
    HostSessionHistoryItemResponse(
        id = id.toString(),
        type = type.name,
        createdAt = createdAt,
        actorMembershipId = actorMembershipId.toString(),
        changedFields = changedFields,
        attendanceTransitions = attendanceTransitions.map(HostSessionHistoryAttendanceTransition::toResponse),
        revisionId = revisionId?.toString(),
        revisionVersion = revisionVersion,
        revisionSource = revisionSource?.name,
        restoredFromRevisionId = restoredFromRevisionId?.toString(),
        notificationEventId = notificationEventId?.toString(),
    )

private fun HostSessionHistoryAttendanceTransition.toResponse() =
    HostSessionHistoryAttendanceTransitionResponse(membershipId.toString(), from, to)

private fun parseRecordUuid(value: String): UUID =
    runCatching { UUID.fromString(value) }
        .getOrElse {
            throw SessionRecordException(SessionRecordError.INVALID_RECORD, "Session record identifier is invalid")
        }

@Suppress("MaxLineLength")
private fun confirmationRequired(): Nothing = throw HostActionNotificationException(HostActionNotificationError.CONFIRMATION_REQUIRED)
