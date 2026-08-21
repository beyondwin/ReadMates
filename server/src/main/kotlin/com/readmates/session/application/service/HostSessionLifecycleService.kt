package com.readmates.session.application.service

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionVisibilityUpdateResult
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
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostSessionLifecycleService(
    private val lifecyclePort: HostSessionLifecyclePort,
    private val deletionPort: HostSessionDeletionPort,
    private val draftPort: HostSessionDraftPort,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val confirmationProperties: HostActionConfirmationProperties = HostActionConfirmationProperties(),
    private val lifecycleAudit: HostSessionLifecycleAuditPort = NoopHostSessionLifecycleAuditPort,
    private val metrics: HostSessionOperationalMetrics = HostSessionOperationalMetrics(SimpleMeterRegistry()),
    private val lifecycleProperties: HostSessionLifecycleProperties = HostSessionLifecycleProperties(),
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

    override fun deletionPreview(command: HostSessionIdCommand) = deletionPort.deletionPreview(command)

    @Transactional
    override fun delete(command: HostSessionIdCommand) =
        deletionPort.delete(command).also { cacheInvalidation.evictClubContentAfterCommit(command.host.clubId) }

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
        if (command.reasonCode == null) {
            metrics.legacyReason()
        }
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
        try {
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
                logger.info(
                    "Session lifecycle action={} outcome={} requestId={} clubId={} sessionId={} fromState={} toState={}",
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
            return result.detail
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
