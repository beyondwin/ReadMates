package com.readmates.session.application.service

import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.shared.cache.ReadCacheInvalidationPort
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
) : HostSessionLifecycleUseCase {
    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionDetailResponse {
        val detail = draftPort.updateVisibility(command)
        if (detail.state == "DRAFT" && detail.visibility != SessionRecordVisibility.HOST_ONLY) {
            recordNotificationEventUseCase.recordNextBookPublished(
                clubId = command.host.clubId,
                sessionId = command.sessionId,
                sessionNumber = detail.sessionNumber,
                bookTitle = detail.bookTitle,
            )
        }
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return detail
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
