package com.readmates.session.application.service

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.HostSessionDeletionResponse
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionVisibilityUpdateResult
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionDeletionBlocker
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionReverseCommand
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.normalized
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.application.toPreviewResponse
import com.readmates.session.config.HostSessionLifecycleProperties
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.observability.RequestIdFilter
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
@Suppress("TooManyFunctions")
class HostSessionLifecycleService(
    private val lifecyclePort: HostSessionLifecyclePort,
    private val deletionPort: HostSessionDeletionPort,
    private val draftPort: HostSessionDraftPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val confirmationProperties: HostActionConfirmationProperties = HostActionConfirmationProperties(),
    private val lifecycleAudit: HostSessionLifecycleAuditPort = NoopHostSessionLifecycleAuditPort,
    private val metrics: HostSessionOperationalMetrics = HostSessionOperationalMetrics(SimpleMeterRegistry()),
    private val lifecycleProperties: HostSessionLifecycleProperties = HostSessionLifecycleProperties(),
    private val deletionTransaction: HostSessionDeletionTransaction =
        HostSessionDeletionTransaction(deletionPort, lifecycleAudit),
) : HostSessionLifecycleUseCase {
    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
        val current = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        if (command.accessScope == null) {
            requireLegacyVisibilityWriteAllowed(current, command.visibility)
        }
        val firstPublication =
            if (command.accessScope == null) {
                isFirstMemberPublication(current.detail.state, current.detail.visibility, command.visibility)
            } else {
                current.detail.state == "DRAFT" &&
                    current.detail.accessScope == SessionAccessScope.HOST_ONLY &&
                    command.accessScope == SessionAccessScope.GUEST_READABLE
            }
        draftPort.updateVisibility(command)
        val applied = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        if (command.accessScope == null && applied.detail.visibility != command.visibility) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        if (command.accessScope != null && applied.detail.accessScope != command.accessScope) {
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
        transition(
            command = command,
            action = HostSessionLifecycleAction.OPENED,
            from = "DRAFT",
            to = "OPEN",
            write = { lifecyclePort.open(command) },
        )

    @Transactional
    override fun close(command: HostSessionIdCommand) =
        transition(
            command = command,
            action = HostSessionLifecycleAction.CLOSED,
            from = "OPEN",
            to = "CLOSED",
            write = { lifecyclePort.close(command) },
        )

    @Transactional
    override fun publish(command: HostSessionIdCommand) =
        transition(
            command = command,
            action = HostSessionLifecycleAction.PUBLISHED,
            from = "CLOSED",
            to = "PUBLISHED",
            write = { lifecyclePort.publish(command) },
        )

    @Transactional
    override fun reopen(command: HostSessionReverseCommand) =
        reverseTransition(
            command = command,
            action = HostSessionLifecycleAction.REOPENED,
            from = "CLOSED",
            to = "OPEN",
            write = lifecyclePort::reopen,
        )

    @Transactional
    override fun unpublish(command: HostSessionReverseCommand) =
        reverseTransition(
            command = command,
            action = HostSessionLifecycleAction.UNPUBLISHED,
            from = "PUBLISHED",
            to = "CLOSED",
            write = lifecyclePort::unpublish,
        )

    @Transactional
    override fun returnToDraft(command: HostSessionReverseCommand) =
        reverseTransition(
            command = command,
            action = HostSessionLifecycleAction.RETURNED_TO_DRAFT,
            from = "OPEN",
            to = "DRAFT",
            write = lifecyclePort::returnToDraft,
        )

    override fun deletionPreview(command: HostSessionIdCommand) = deletionPort.assess(command).toPreviewResponse()

    override fun delete(command: HostSessionIdCommand): HostSessionDeletionResponse {
        val requestId = MDC.get(RequestIdFilter.MDC_KEY)?.takeIf(String::isNotBlank)
        return deleteRecordingOutcomes(command, requestId)
    }

    @Suppress("TooGenericExceptionCaught") // record deletion failure metrics for every runtime failure before rethrow
    private fun deleteRecordingOutcomes(
        command: HostSessionIdCommand,
        requestId: String?,
    ): HostSessionDeletionResponse =
        try {
            deletionTransaction.delete(command).also {
                cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
                metrics.lifecycle(HostSessionLifecycleAction.DELETED, "deleted")
                logger.info(
                    "Session lifecycle action={} outcome={} requestId={} clubId={} sessionId={}",
                    HostSessionLifecycleAction.DELETED,
                    "deleted",
                    requestId,
                    command.host.clubId,
                    command.sessionId,
                )
            }
        } catch (blocked: HostSessionDeletionBlockedException) {
            throwRecordedBlockedDeletion(command, requestId, blocked.blockers)
        } catch (failure: DataIntegrityViolationException) {
            val reassessment = deletionPort.assess(command)
            if (!reassessment.canDelete) {
                throwRecordedBlockedDeletion(command, requestId, reassessment.blockers)
            }
            throwRecordedFailedDeletion(command, requestId, failure)
        } catch (failure: RuntimeException) {
            throwRecordedFailedDeletion(command, requestId, failure)
        }

    private fun throwRecordedBlockedDeletion(
        command: HostSessionIdCommand,
        requestId: String?,
        blockers: List<HostSessionDeletionBlocker>,
    ): Nothing {
        val blocked = HostSessionDeletionBlockedException(blockers)
        recordBlockedDeletion(command, requestId, blocked)
        throw blocked
    }

    private fun throwRecordedFailedDeletion(
        command: HostSessionIdCommand,
        requestId: String?,
        failure: RuntimeException,
    ): Nothing {
        recordFailedDeletion(command, requestId, failure)
        throw failure
    }

    private fun reverseTransition(
        command: HostSessionReverseCommand,
        action: HostSessionLifecycleAction,
        from: String,
        to: String,
        write: (HostSessionIdCommand) -> HostSessionTransitionResult,
    ): HostSessionDetailResponse {
        val normalized = command.normalized(lifecycleProperties.requireReverseReason)
        val idCommand = HostSessionIdCommand(normalized.host, normalized.sessionId)
        val detail =
            transition(
                command = idCommand,
                action = action,
                from = from,
                to = to,
                reasonCode = normalized.reasonCode,
                reasonNote = normalized.reasonNote,
                write = { write(idCommand) },
            )
        return detail
    }

    private fun transition(
        command: HostSessionIdCommand,
        action: HostSessionLifecycleAction,
        from: String,
        to: String,
        reasonCode: HostSessionLifecycleReasonCode? = null,
        reasonNote: String? = null,
        write: () -> HostSessionTransitionResult,
    ): HostSessionDetailResponse {
        val requestId = MDC.get(RequestIdFilter.MDC_KEY)?.takeIf(String::isNotBlank)
        return recordTransitionFailure(command, action, requestId) {
            val result = write()
            if (result.changed) {
                lifecycleAudit.record(
                    HostSessionLifecycleAuditEntry(
                        host = command.host,
                        sessionId = command.sessionId,
                        action = action,
                        fromState = from,
                        toState = to,
                        reasonCode = reasonCode,
                        reasonNote = reasonNote,
                    ),
                )
                cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
                if (reasonCode == HostSessionLifecycleReasonCode.LEGACY_UNSPECIFIED) {
                    metrics.legacyReason()
                }
                logger.info(
                    "Session lifecycle action={} outcome={} requestId={} clubId={} " +
                        "sessionId={} fromState={} toState={}",
                    action,
                    "changed",
                    requestId,
                    command.host.clubId,
                    command.sessionId,
                    from,
                    to,
                )
            }
            metrics.lifecycle(action, if (result.changed) "changed" else "unchanged")
            result.detail
        }
    }

    @Suppress("TooGenericExceptionCaught") // record transition failure metrics for every runtime failure before rethrow
    private fun <T> recordTransitionFailure(
        command: HostSessionIdCommand,
        action: HostSessionLifecycleAction,
        requestId: String?,
        write: () -> T,
    ): T =
        try {
            write()
        } catch (failure: RuntimeException) {
            metrics.lifecycle(action, "failure")
            logger.warn(
                "Session lifecycle action={} outcome=failure requestId={} clubId={} sessionId={}",
                action,
                requestId,
                command.host.clubId,
                command.sessionId,
                failure,
            )
            throw failure
        }

    private fun recordBlockedDeletion(
        command: HostSessionIdCommand,
        requestId: String?,
        blocked: HostSessionDeletionBlockedException,
    ) {
        metrics.lifecycle(HostSessionLifecycleAction.DELETED, "blocked")
        metrics.deletionBlocked(blocked.blockers)
        logger.info(
            "Session lifecycle action={} outcome={} requestId={} clubId={} sessionId={} blockers={}",
            HostSessionLifecycleAction.DELETED,
            "blocked",
            requestId,
            command.host.clubId,
            command.sessionId,
            blocked.blockers.joinToString(",") { it.code.name },
        )
    }

    private fun recordFailedDeletion(
        command: HostSessionIdCommand,
        requestId: String?,
        failure: RuntimeException,
    ) {
        metrics.lifecycle(HostSessionLifecycleAction.DELETED, "failure")
        logger.warn(
            "Session lifecycle action={} outcome=failure requestId={} clubId={} sessionId={}",
            HostSessionLifecycleAction.DELETED,
            requestId,
            command.host.clubId,
            command.sessionId,
            failure,
        )
    }

    private companion object {
        private val logger = LoggerFactory.getLogger(HostSessionLifecycleService::class.java)
    }
}

private object NoopHostSessionLifecycleAuditPort : HostSessionLifecycleAuditPort {
    override fun record(entry: HostSessionLifecycleAuditEntry) = Unit
}

private fun isFirstMemberPublication(
    state: String,
    previousVisibility: SessionRecordVisibility,
    requestedVisibility: SessionRecordVisibility,
): Boolean =
    state == "DRAFT" &&
        previousVisibility == SessionRecordVisibility.HOST_ONLY &&
        requestedVisibility != SessionRecordVisibility.HOST_ONLY
