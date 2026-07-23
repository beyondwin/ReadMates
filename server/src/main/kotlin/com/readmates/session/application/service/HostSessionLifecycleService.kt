package com.readmates.session.application.service

import com.readmates.notification.application.model.CompleteHostActionDecisionCommand
import com.readmates.notification.application.model.HostActionDecisionCommand
import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.HostActionPreview
import com.readmates.notification.application.model.HostActionPreviewCommand
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.model.PreparedHostActionDecision
import com.readmates.notification.application.model.RecordHostConfirmedNotificationEventCommand
import com.readmates.notification.application.port.`in`.ConfirmHostActionNotificationUseCase
import com.readmates.notification.application.port.`in`.RecordHostConfirmedNotificationEventUseCase
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionVisibilityPreview
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.PreviewHostSessionVisibilityCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.security.Sha256
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import java.util.UUID

@Service
class HostSessionLifecycleService(
    private val lifecyclePort: HostSessionLifecyclePort,
    private val deletionPort: HostSessionDeletionPort,
    private val draftPort: HostSessionDraftPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase = NoopRecordNotificationEventUseCase,
    private val notificationGate: ConfirmHostActionNotificationUseCase = NoopHostActionNotificationGate,
    private val confirmedEventRecorder: RecordHostConfirmedNotificationEventUseCase = NoopConfirmedEventRecorder,
    private val confirmationProperties: HostActionConfirmationProperties = HostActionConfirmationProperties(),
) : HostSessionLifecycleUseCase {
    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
        val decisionCommand = command.toDecisionCommand()
        if (confirmationProperties.required && decisionCommand != null) {
            notificationGate.findCompleted(command.host, decisionCommand)?.let {
                return finishVisibilityUpdate(command)
            }
        }
        if (confirmationProperties.required && decisionCommand == null) {
            val current = draftPort.detailForVisibility(HostSessionIdCommand(command.host, command.sessionId))
            if (isFirstMemberPublication(current.state, current.visibility, command.visibility)) confirmationRequired()
        }

        val result = draftPort.updateVisibility(command)
        if (isFirstMemberPublication(result.detail.state, result.previousVisibility, command.visibility)) {
            if (confirmationProperties.required) {
                confirmVisibilityUpdate(command, decisionCommand ?: confirmationRequired())
            } else {
                recordLegacyNextBookNotification(command, result.detail)
            }
        }
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return result.detail
    }

    override fun previewVisibility(command: PreviewHostSessionVisibilityCommand): HostSessionVisibilityPreview {
        val current = draftPort.detailForVisibility(HostSessionIdCommand(command.host, command.sessionId))
        if (!isFirstMemberPublication(current.state, current.visibility, command.visibility)) {
            throw HostActionNotificationException(HostActionNotificationError.CONFIRMATION_REQUIRED)
        }
        val preview =
            notificationGate.preview(
                command.host,
                HostActionPreviewCommand(
                    sessionId = command.sessionId,
                    action = HostConfirmedAction.NEXT_BOOK_PUBLISH,
                    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                    expectedDraftRevision = null,
                    expectedLiveRevision = VISIBILITY_REVISION,
                    requestHash = visibilityRequestHash(command.visibility),
                ),
            )
        return preview.toVisibilityPreview()
    }

    private fun finishVisibilityUpdate(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
        val result = draftPort.updateVisibility(command)
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return result.detail
    }

    private fun confirmVisibilityUpdate(
        command: UpdateHostSessionVisibilityCommand,
        decisionCommand: HostActionDecisionCommand,
    ) {
        val prepared = notificationGate.prepare(command.host, decisionCommand)
        val detail = draftPort.detailForVisibility(HostSessionIdCommand(command.host, command.sessionId))
        val eventId =
            if (prepared.decision == NotificationDecision.SEND) {
                confirmedEventRecorder.record(
                    RecordHostConfirmedNotificationEventCommand(
                        clubId = command.host.clubId,
                        sessionId = command.sessionId,
                        sessionNumber = detail.sessionNumber,
                        bookTitle = detail.bookTitle,
                        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                        revision = VISIBILITY_REVISION,
                    ),
                )
            } else {
                null
            }
        notificationGate.complete(
            CompleteHostActionDecisionCommand(
                prepared = prepared,
                liveRevision = VISIBILITY_REVISION,
                eventId = eventId,
            ),
        )
    }

    private fun recordLegacyNextBookNotification(
        command: UpdateHostSessionVisibilityCommand,
        detail: HostSessionDetailResponse,
    ) {
        recordNotificationEventUseCase.recordNextBookPublished(
            clubId = command.host.clubId,
            sessionId = command.sessionId,
            sessionNumber = detail.sessionNumber,
            bookTitle = detail.bookTitle,
        )
    }

    @Transactional
    override fun open(command: HostSessionIdCommand) =
        lifecyclePort
            .open(command)
            .also { result ->
                if (result.changed) {
                    logger.info(
                        "Session state changed clubId={} sessionId={} oldState={} newState={}",
                        command.host.clubId,
                        command.sessionId,
                        "DRAFT",
                        "OPEN",
                    )
                    cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
                }
            }.detail

    @Transactional
    override fun close(command: HostSessionIdCommand) =
        lifecyclePort
            .close(command)
            .also { result ->
                if (result.changed) {
                    logger.info(
                        "Session state changed clubId={} sessionId={} oldState={} newState={}",
                        command.host.clubId,
                        command.sessionId,
                        "OPEN",
                        "CLOSED",
                    )
                    cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
                }
            }.detail

    @Transactional
    override fun publish(command: HostSessionIdCommand) =
        lifecyclePort
            .publish(command)
            .also { result ->
                if (result.changed) {
                    logger.info(
                        "Session state changed clubId={} sessionId={} oldState={} newState={}",
                        command.host.clubId,
                        command.sessionId,
                        "CLOSED",
                        "PUBLISHED",
                    )
                    cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
                }
            }.detail

    override fun deletionPreview(command: HostSessionIdCommand) = deletionPort.deletionPreview(command)

    @Transactional
    override fun delete(command: HostSessionIdCommand) =
        deletionPort.delete(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

    private companion object {
        private const val VISIBILITY_REVISION = 0L
        private val logger = LoggerFactory.getLogger(HostSessionLifecycleService::class.java)
    }
}

private fun isFirstMemberPublication(
    state: String,
    previousVisibility: SessionRecordVisibility,
    requestedVisibility: SessionRecordVisibility,
): Boolean =
    state == "DRAFT" &&
        previousVisibility == SessionRecordVisibility.HOST_ONLY &&
        requestedVisibility != SessionRecordVisibility.HOST_ONLY

@Suppress("MaxLineLength")
private fun visibilityRequestHash(visibility: SessionRecordVisibility): String = Sha256.hex("next-book-visibility|${visibility.name}")

private fun UpdateHostSessionVisibilityCommand.toDecisionCommand(): HostActionDecisionCommand? {
    if (previewId == null || notificationDecision == null) return null
    return HostActionDecisionCommand(
        previewId = previewId,
        sessionId = sessionId,
        action = HostConfirmedAction.NEXT_BOOK_PUBLISH,
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        expectedDraftRevision = null,
        expectedLiveRevision = 0,
        requestHash = visibilityRequestHash(visibility),
        decision = notificationDecision,
    )
}

private fun HostActionPreview.toVisibilityPreview() =
    HostSessionVisibilityPreview(
        previewId = id,
        targetCount = targetCount,
        expectedInAppCount = expectedInAppCount,
        expectedEmailCount = expectedEmailCount,
        excludedCount = excludedCount,
        expiresAt = expiresAt,
    )

@Suppress("MaxLineLength")
private fun confirmationRequired(): Nothing = throw HostActionNotificationException(HostActionNotificationError.CONFIRMATION_REQUIRED)

private object NoopRecordNotificationEventUseCase : RecordNotificationEventUseCase {
    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) = Unit

    override fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    ) = Unit

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) = Unit

    override fun recordSessionReminderDue(targetDate: LocalDate) = Unit

    override fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) = Unit
}

private object NoopHostActionNotificationGate : ConfirmHostActionNotificationUseCase {
    override fun preview(
        host: com.readmates.shared.security.CurrentMember,
        command: HostActionPreviewCommand,
    ): HostActionPreview = error("Host action confirmation gate is not configured")

    override fun prepare(
        host: com.readmates.shared.security.CurrentMember,
        command: HostActionDecisionCommand,
    ): PreparedHostActionDecision = error("Host action confirmation gate is not configured")

    override fun complete(command: CompleteHostActionDecisionCommand): StoredHostActionDecision =
        error("Host action confirmation gate is not configured")
}

private object NoopConfirmedEventRecorder : RecordHostConfirmedNotificationEventUseCase {
    override fun record(command: RecordHostConfirmedNotificationEventCommand): UUID =
        error("Host-confirmed event recorder is not configured")
}
