package com.readmates.sessionclosing.adapter.`in`.web

import com.readmates.sessionclosing.application.model.ClosingChecklistItem
import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.sessionclosing.application.model.NotificationClosingEvent

data class HostSessionClosingStatusResponse(
    val schema: String = "host.session_closing_status.v1",
    val session: ClosingSessionResponse,
    val overall: ClosingOverallResponse,
    val checklist: List<ClosingChecklistResponse>,
    val evidence: ClosingEvidenceResponse,
)

data class ClosingSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: String,
    val state: String,
    val recordVisibility: String,
)

data class ClosingOverallResponse(
    val state: String,
    val label: String,
    val primaryAction: String,
)

data class ClosingChecklistResponse(
    val id: String,
    val state: String,
    val label: String,
    val detail: String,
    val href: String?,
)

data class ClosingEvidenceResponse(
    val summaryPublished: Boolean,
    val highlightCount: Int,
    val oneLinerCount: Int,
    val feedbackDocumentState: String,
    val latestNotificationEvent: ClosingNotificationEventResponse?,
    val publicRecordHref: String?,
    val memberReflectionHref: String?,
)

data class ClosingNotificationEventResponse(
    val eventType: String,
    val status: String,
    val createdAt: String,
)

fun HostSessionClosingStatus.toResponse() =
    HostSessionClosingStatusResponse(
        session =
            ClosingSessionResponse(
                sessionId = session.sessionId.toString(),
                sessionNumber = session.sessionNumber,
                bookTitle = session.bookTitle,
                meetingDate = session.meetingDate.toString(),
                state = session.state,
                recordVisibility = session.recordVisibility.name,
            ),
        overall =
            ClosingOverallResponse(
                state = overall.state.name,
                label = overall.label,
                primaryAction = overall.primaryAction.name,
            ),
        checklist = checklist.map(ClosingChecklistItem::toResponse),
        evidence =
            ClosingEvidenceResponse(
                summaryPublished = evidence.summaryPublished,
                highlightCount = evidence.highlightCount,
                oneLinerCount = evidence.oneLinerCount,
                feedbackDocumentState = evidence.feedbackDocumentState.name,
                latestNotificationEvent = evidence.latestNotificationEvent?.toResponse(),
                publicRecordHref = evidence.publicRecordHref,
                memberReflectionHref = evidence.memberReflectionHref,
            ),
    )

private fun ClosingChecklistItem.toResponse() =
    ClosingChecklistResponse(
        id = id.name,
        state = state.name,
        label = label,
        detail = detail,
        href = href,
    )

private fun NotificationClosingEvent.toResponse() =
    ClosingNotificationEventResponse(
        eventType = eventType,
        status = status.name,
        createdAt = createdAt.toString(),
    )
