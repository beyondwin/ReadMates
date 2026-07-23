package com.readmates.session.application.service

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionVisibilityUpdateResult
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.cache.ReadCacheInvalidationPort
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionLifecycleService(
    private val lifecyclePort: HostSessionLifecyclePort,
    private val deletionPort: HostSessionDeletionPort,
    private val draftPort: HostSessionDraftPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val confirmationProperties: HostActionConfirmationProperties = HostActionConfirmationProperties(),
) : HostSessionLifecycleUseCase {
    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
        val current = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        requireLegacyVisibilityWriteAllowed(current, command.visibility)
        val firstPublication =
            isFirstMemberPublication(current.detail.state, current.detail.visibility, command.visibility)
        draftPort.updateVisibility(command)
        val applied = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        if (applied.detail.visibility != command.visibility) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        return HostSessionVisibilityUpdateResult(
            session = applied.detail,
            composer =
                if (firstPublication) {
                    HostNotificationComposerContext(
                        sessionId = command.sessionId,
                        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                        contentRevision =
                            ManualNotificationContentRevision.nextBook(
                                command.sessionId,
                                applied.detail.sessionNumber,
                                applied.detail.bookTitle,
                                applied.detail.visibility.name,
                            ),
                    )
                } else {
                    null
                },
        )
    }

    private fun requireLegacyVisibilityWriteAllowed(
        current: HostSessionVisibilitySnapshot,
        requested: SessionRecordVisibility,
    ) {
        if (confirmationProperties.required &&
            current.detail.state in setOf("CLOSED", "PUBLISHED") &&
            current.detail.visibility != requested
        ) {
            throw HostSessionRecordStagingRequiredException()
        }
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
