package com.readmates.sessionclosing.application.service

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.ClosingChecklistId
import com.readmates.sessionclosing.application.model.ClosingChecklistItem
import com.readmates.sessionclosing.application.model.ClosingChecklistState
import com.readmates.sessionclosing.application.model.ClosingEvidence
import com.readmates.sessionclosing.application.model.ClosingOverall
import com.readmates.sessionclosing.application.model.ClosingOverallState
import com.readmates.sessionclosing.application.model.ClosingPrimaryAction
import com.readmates.sessionclosing.application.model.ClosingSessionSummary
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
import com.readmates.sessionclosing.application.model.HostSessionClosingStatus
import com.readmates.sessionclosing.application.model.NotificationClosingStatus
import com.readmates.sessionclosing.application.model.SessionClosingSnapshot
import com.readmates.sessionclosing.application.model.SessionRecordReadinessPolicy
import com.readmates.sessionclosing.application.port.`in`.GetHostSessionClosingStatusUseCase
import com.readmates.sessionclosing.application.port.out.LoadSessionClosingStatusPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class SessionClosingStatusService(
    private val loadPort: LoadSessionClosingStatusPort,
) : GetHostSessionClosingStatusUseCase {
    override fun getHostSessionClosingStatus(
        host: CurrentMember,
        sessionId: UUID,
    ): HostSessionClosingStatus {
        if (!host.isHost) {
            throw AccessDeniedException("Host role required")
        }

        val snapshot =
            loadPort.loadHostSessionClosingSnapshot(host, sessionId)
                ?: throw HostSessionNotFoundException()
        return snapshot.toClosingStatus()
    }
}

private fun SessionClosingSnapshot.toClosingStatus(): HostSessionClosingStatus {
    val signals = closingSignals()

    return HostSessionClosingStatus(
        session = ClosingSessionSummary(sessionId, sessionNumber, bookTitle, meetingDate, state, recordVisibility),
        overall = overall(signals),
        checklist = checklistItems(signals),
        evidence = evidence(),
    )
}

private data class ClosingSignals(
    val sessionClosed: Boolean,
    val recordSaved: Boolean,
    val feedbackReady: Boolean,
    val feedbackBlocked: Boolean,
    val notificationSent: Boolean,
    val publicApplicable: Boolean,
    val publicReady: Boolean,
)

private fun SessionClosingSnapshot.closingSignals() =
    ClosingSignals(
        sessionClosed = state in setOf("CLOSED", "PUBLISHED"),
        recordSaved = SessionRecordReadinessPolicy.recordSaved(summaryPublished, highlightCount, oneLinerCount),
        feedbackReady = feedbackDocumentState == FeedbackDocumentClosingState.AVAILABLE,
        feedbackBlocked = feedbackDocumentState == FeedbackDocumentClosingState.INVALID,
        notificationSent = latestNotificationEvent?.status == NotificationClosingStatus.PUBLISHED,
        publicApplicable = recordVisibility == SessionRecordVisibility.PUBLIC,
        publicReady = recordVisibility == SessionRecordVisibility.PUBLIC && publicVisible && publicRecordHref != null,
    )

private fun overall(signals: ClosingSignals): ClosingOverall =
    when {
        signals.feedbackBlocked -> overall(ClosingOverallState.BLOCKED, ClosingPrimaryAction.IMPORT_RECORDS)
        !signals.sessionClosed -> overall(ClosingOverallState.IN_PROGRESS, ClosingPrimaryAction.CLOSE_SESSION)
        !signals.recordSaved -> overall(ClosingOverallState.IN_PROGRESS, ClosingPrimaryAction.IMPORT_RECORDS)
        !signals.feedbackReady -> overall(ClosingOverallState.IN_PROGRESS, ClosingPrimaryAction.IMPORT_RECORDS)
        !signals.notificationSent -> overall(ClosingOverallState.READY, ClosingPrimaryAction.SEND_NOTIFICATION)
        signals.publicApplicable && !signals.publicReady ->
            overall(ClosingOverallState.READY, ClosingPrimaryAction.PUBLISH_RECORDS)
        signals.publicReady -> overall(ClosingOverallState.PUBLISHED, ClosingPrimaryAction.REVIEW_PUBLIC_PAGE)
        else -> overall(ClosingOverallState.READY, ClosingPrimaryAction.NONE)
    }

private fun overall(
    state: ClosingOverallState,
    primaryAction: ClosingPrimaryAction,
) = ClosingOverall(state, state.label, primaryAction)

private val ClosingOverallState.label: String
    get() =
        when (this) {
            ClosingOverallState.BLOCKED -> "Blocked"
            ClosingOverallState.IN_PROGRESS -> "In progress"
            ClosingOverallState.READY -> "Ready"
            ClosingOverallState.PUBLISHED -> "Published"
            ClosingOverallState.NOT_STARTED -> "Not started"
        }

private fun SessionClosingSnapshot.checklistItems(signals: ClosingSignals) =
    listOf(
        checklist(
            id = ClosingChecklistId.SESSION_CLOSED,
            done = signals.sessionClosed,
            label = "Session closed",
            detail = "The meeting status is closed.",
            href = "/app/host/sessions/$sessionId/edit",
        ),
        checklist(
            id = ClosingChecklistId.RECORD_PACKAGE_SAVED,
            done = signals.recordSaved,
            label = "Record package saved",
            detail = "At least one summary, highlight, or one-liner is saved.",
            href = "/app/host/sessions/$sessionId/edit?records=json",
        ),
        feedbackChecklist(signals.feedbackReady, signals.feedbackBlocked, sessionId),
        checklist(
            id = ClosingChecklistId.MEMBER_NOTIFICATION_SENT,
            done = signals.notificationSent,
            label = "Member notification sent",
            detail = "Members have a notification path back into the reflection loop.",
            href = "/app/host/notifications",
        ),
        publicChecklist(
            id = ClosingChecklistId.PUBLIC_RECORD_VISIBLE,
            applicable = signals.publicApplicable,
            ready = signals.publicReady,
            label = "Public record visible",
            href = publicRecordHref,
        ),
        publicChecklist(
            id = ClosingChecklistId.PUBLIC_SHOWCASE_READY,
            applicable = signals.publicApplicable,
            ready = signals.publicReady,
            label = "Public showcase ready",
            href = publicRecordHref,
        ),
    )

private fun SessionClosingSnapshot.evidence() =
    ClosingEvidence(
        summaryPublished = summaryPublished,
        highlightCount = highlightCount.coerceAtLeast(0),
        oneLinerCount = oneLinerCount.coerceAtLeast(0),
        feedbackDocumentState = feedbackDocumentState,
        latestNotificationEvent = latestNotificationEvent,
        publicRecordHref = publicRecordHref,
        memberReflectionHref = memberReflectionHref,
    )

private fun checklist(
    id: ClosingChecklistId,
    done: Boolean,
    label: String,
    detail: String,
    href: String?,
) = ClosingChecklistItem(
    id = id,
    state = if (done) ClosingChecklistState.DONE else ClosingChecklistState.ACTION_REQUIRED,
    label = label,
    detail = detail,
    href = href,
)

private fun feedbackChecklist(
    ready: Boolean,
    blocked: Boolean,
    sessionId: UUID,
) = ClosingChecklistItem(
    id = ClosingChecklistId.FEEDBACK_DOCUMENT_READY,
    state =
        when {
            ready -> ClosingChecklistState.DONE
            blocked -> ClosingChecklistState.BLOCKED
            else -> ClosingChecklistState.ACTION_REQUIRED
        },
    label = "Feedback document ready",
    detail = if (ready) "The feedback document is ready." else "The feedback document needs attention.",
    href = "/app/host/sessions/$sessionId/edit?records=json",
)

private fun publicChecklist(
    id: ClosingChecklistId,
    applicable: Boolean,
    ready: Boolean,
    label: String,
    href: String?,
) = ClosingChecklistItem(
    id = id,
    state =
        when {
            !applicable -> ClosingChecklistState.NOT_APPLICABLE
            ready -> ClosingChecklistState.DONE
            else -> ClosingChecklistState.ACTION_REQUIRED
        },
    label = label,
    detail = if (ready) "The public surface can show this session." else "Public record conditions need review.",
    href = href,
)
