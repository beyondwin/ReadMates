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
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionVisibilityPreview
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.PreviewHostSessionVisibilityCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
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
        val current = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        requireLegacyVisibilityWriteAllowed(current, command.visibility)
        val binding = current.visibilityBinding(command.visibility)
        val decisionCommand = command.toDecisionCommand(binding)
        if (confirmationProperties.required && decisionCommand != null) {
            notificationGate.findCompleted(command.host, decisionCommand)?.let { completed ->
                return replayVisibilityUpdate(command, current, completed)
            }
        }
        val firstPublication =
            isFirstMemberPublication(current.detail.state, current.detail.visibility, command.visibility)
        if (confirmationProperties.required && !firstPublication && decisionCommand != null) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        val prepared =
            if (confirmationProperties.required && firstPublication) {
                notificationGate.prepare(command.host, decisionCommand ?: confirmationRequired())
            } else {
                null
            }
        draftPort.updateVisibility(command)
        val applied = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        if (applied.detail.visibility != command.visibility) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        if (prepared != null) {
            confirmVisibilityUpdate(prepared, applied)
        } else if (firstPublication) {
            recordLegacyNextBookNotification(command, applied.detail)
        }
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return applied.detail
    }

    private fun requireLegacyVisibilityWriteAllowed(
        current: HostSessionVisibilitySnapshot,
        requested: SessionRecordVisibility,
    ) {
        if (current.detail.state in setOf("CLOSED", "PUBLISHED") &&
            current.detail.visibility != requested
        ) {
            throw HostSessionRecordStagingRequiredException()
        }
    }

    @Transactional
    override fun previewVisibility(command: PreviewHostSessionVisibilityCommand): HostSessionVisibilityPreview {
        val current = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        if (!isFirstMemberPublication(current.detail.state, current.detail.visibility, command.visibility)) {
            throw HostActionNotificationException(HostActionNotificationError.CONFIRMATION_REQUIRED)
        }
        val binding = current.visibilityBinding(command.visibility)
        val preview =
            notificationGate.preview(
                command.host,
                HostActionPreviewCommand(
                    sessionId = command.sessionId,
                    action = HostConfirmedAction.NEXT_BOOK_PUBLISH,
                    eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                    expectedDraftRevision = null,
                    expectedLiveRevision = binding.contentRevision,
                    requestHash = binding.requestHash,
                ),
            )
        return preview.toVisibilityPreview()
    }

    private fun confirmVisibilityUpdate(
        prepared: PreparedHostActionDecision,
        applied: HostSessionVisibilitySnapshot,
    ) {
        val eventId =
            if (prepared.decision == NotificationDecision.SEND) {
                confirmedEventRecorder.record(
                    RecordHostConfirmedNotificationEventCommand(
                        clubId = prepared.clubId,
                        sessionId = prepared.sessionId,
                        sessionNumber = applied.detail.sessionNumber,
                        bookTitle = applied.detail.bookTitle,
                        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                        revision = applied.contentRevision(),
                    ),
                )
            } else {
                null
            }
        notificationGate.complete(
            CompleteHostActionDecisionCommand(
                prepared = prepared,
                liveRevision = applied.contentRevision(),
                eventId = eventId,
            ),
        )
    }

    private fun replayVisibilityUpdate(
        command: UpdateHostSessionVisibilityCommand,
        current: HostSessionVisibilitySnapshot,
        completed: StoredHostActionDecision,
    ): HostSessionDetailResponse {
        if (current.detail.visibility != command.visibility ||
            current.contentRevision() != completed.liveRevision
        ) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_ALREADY_CONSUMED)
        }
        return current.detail
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

private data class HostSessionVisibilityBinding(
    val contentRevision: Long,
    val requestHash: String,
)

@Suppress("MaxLineLength")
private fun HostSessionVisibilitySnapshot.visibilityBinding(targetVisibility: SessionRecordVisibility): HostSessionVisibilityBinding {
    val revision = contentRevision()
    return HostSessionVisibilityBinding(
        contentRevision = revision,
        requestHash =
            Sha256.hex(
                visibilityFrame(
                    "schema" to "next-book-visibility:v2",
                    "sessionId" to detail.sessionId,
                    "state" to detail.state,
                    "sourceVisibility" to detail.visibility.name,
                    "targetVisibility" to targetVisibility.name,
                    "contentRevision" to revision.toString(),
                    "sessionNumber" to detail.sessionNumber.toString(),
                    "bookTitle" to detail.bookTitle,
                    "eventType" to NotificationEventType.NEXT_BOOK_PUBLISHED.name,
                ),
            ),
    )
}

private fun HostSessionVisibilitySnapshot.contentRevision(): Long =
    Sha256
        .hex(
            visibilityFrame(
                "contentUpdatedAt" to contentUpdatedAt.toInstant().toString(),
                "sessionId" to detail.sessionId,
                "state" to detail.state,
                "visibility" to detail.visibility.name,
                "sessionNumber" to detail.sessionNumber.toString(),
                "bookTitle" to detail.bookTitle,
            ),
        ).take(CONTENT_REVISION_HEX_LENGTH)
        .toLong(HASH_RADIX)

private fun visibilityFrame(vararg fields: Pair<String, String>): String =
    buildString {
        fields.forEach { (name, value) ->
            append(name).append('=')
            append(value.toByteArray(Charsets.UTF_8).size).append(':').append(value).append(';')
        }
    }

@Suppress("MaxLineLength")
private fun UpdateHostSessionVisibilityCommand.toDecisionCommand(binding: HostSessionVisibilityBinding): HostActionDecisionCommand? {
    if (previewId == null || notificationDecision == null) return null
    return HostActionDecisionCommand(
        previewId = previewId,
        sessionId = sessionId,
        action = HostConfirmedAction.NEXT_BOOK_PUBLISH,
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        expectedDraftRevision = null,
        expectedLiveRevision = binding.contentRevision,
        requestHash = binding.requestHash,
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

private const val CONTENT_REVISION_HEX_LENGTH = 15
private const val HASH_RADIX = 16

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
