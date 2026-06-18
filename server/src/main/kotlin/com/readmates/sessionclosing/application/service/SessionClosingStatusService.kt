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
    val sessionClosed = state in setOf("CLOSED", "PUBLISHED")
    val recordSaved = summaryPublished || highlightCount > 0 || oneLinerCount > 0
    val feedbackReady = feedbackDocumentState == FeedbackDocumentClosingState.AVAILABLE
    val feedbackBlocked = feedbackDocumentState == FeedbackDocumentClosingState.INVALID
    val notificationSent = latestNotificationEvent?.status == NotificationClosingStatus.PUBLISHED
    val publicApplicable = recordVisibility == SessionRecordVisibility.PUBLIC
    val publicReady = publicApplicable && publicVisible && publicRecordHref != null

    val overall =
        when {
            feedbackBlocked -> ClosingOverall(ClosingOverallState.BLOCKED, "Blocked", ClosingPrimaryAction.IMPORT_RECORDS)
            !sessionClosed -> ClosingOverall(ClosingOverallState.IN_PROGRESS, "In progress", ClosingPrimaryAction.CLOSE_SESSION)
            !recordSaved -> ClosingOverall(ClosingOverallState.IN_PROGRESS, "In progress", ClosingPrimaryAction.IMPORT_RECORDS)
            !feedbackReady -> ClosingOverall(ClosingOverallState.IN_PROGRESS, "In progress", ClosingPrimaryAction.IMPORT_RECORDS)
            !notificationSent -> ClosingOverall(ClosingOverallState.READY, "Ready", ClosingPrimaryAction.SEND_NOTIFICATION)
            publicApplicable && !publicReady -> ClosingOverall(ClosingOverallState.READY, "Ready", ClosingPrimaryAction.PUBLISH_RECORDS)
            publicReady -> ClosingOverall(ClosingOverallState.PUBLISHED, "Published", ClosingPrimaryAction.REVIEW_PUBLIC_PAGE)
            else -> ClosingOverall(ClosingOverallState.READY, "Ready", ClosingPrimaryAction.NONE)
        }

    return HostSessionClosingStatus(
        session = ClosingSessionSummary(sessionId, sessionNumber, bookTitle, meetingDate, state, recordVisibility),
        overall = overall,
        checklist =
            listOf(
                checklist(
                    id = ClosingChecklistId.SESSION_CLOSED,
                    done = sessionClosed,
                    label = "Session closed",
                    detail = "The meeting status is closed.",
                    href = "/app/host/sessions/$sessionId/edit",
                ),
                checklist(
                    id = ClosingChecklistId.RECORD_PACKAGE_SAVED,
                    done = recordSaved,
                    label = "Record package saved",
                    detail = "At least one summary, highlight, or one-liner is saved.",
                    href = "/app/host/sessions/$sessionId/edit?records=json",
                ),
                feedbackChecklist(feedbackReady, feedbackBlocked, sessionId),
                checklist(
                    id = ClosingChecklistId.MEMBER_NOTIFICATION_SENT,
                    done = notificationSent,
                    label = "Member notification sent",
                    detail = "Members have a notification path back into the reflection loop.",
                    href = "/app/host/notifications",
                ),
                publicChecklist(ClosingChecklistId.PUBLIC_RECORD_VISIBLE, publicApplicable, publicReady, "Public record visible", publicRecordHref),
                publicChecklist(ClosingChecklistId.PUBLIC_SHOWCASE_READY, publicApplicable, publicReady, "Public showcase ready", publicRecordHref),
            ),
        evidence =
            ClosingEvidence(
                summaryPublished = summaryPublished,
                highlightCount = highlightCount.coerceAtLeast(0),
                oneLinerCount = oneLinerCount.coerceAtLeast(0),
                feedbackDocumentState = feedbackDocumentState,
                latestNotificationEvent = latestNotificationEvent,
                publicRecordHref = publicRecordHref,
                memberReflectionHref = memberReflectionHref,
            ),
    )
}

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
