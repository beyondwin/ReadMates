package com.readmates.session.application.service

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.ManualNotificationContentRevision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.session.application.HostSessionDetailResponse
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.HostSessionVisibilityUpdateResult
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.model.CorrectionPublicationPreview
import com.readmates.session.application.model.CorrectionPublicationVersionVector
import com.readmates.session.application.model.HostPublicProjectionEffect
import com.readmates.session.application.model.HostSessionChangeKind
import com.readmates.session.application.model.HostSessionChangeReceipt
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionDeletionBlocker
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.HostSessionLifecycleAction
import com.readmates.session.application.model.HostSessionLifecycleAuditEntry
import com.readmates.session.application.model.HostSessionLifecycleReasonCode
import com.readmates.session.application.model.HostSessionReverseCommand
import com.readmates.session.application.model.HostSessionTrashResponse
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.session.application.model.UpdateHostSessionVisibilityCommand
import com.readmates.session.application.model.normalized
import com.readmates.session.application.model.toDetail
import com.readmates.session.application.port.`in`.HostSessionLifecycleUseCase
import com.readmates.session.application.port.out.HostSessionDeletionPort
import com.readmates.session.application.port.out.HostSessionDraftPort
import com.readmates.session.application.port.out.HostSessionLifecycleAuditPort
import com.readmates.session.application.port.out.HostSessionLifecyclePort
import com.readmates.session.application.port.out.HostSessionTransitionResult
import com.readmates.session.application.port.out.HostSessionVisibilitySnapshot
import com.readmates.session.application.toPreviewResponse
import com.readmates.session.config.HostSessionLifecycleProperties
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.HostNotificationComposerContext
import com.readmates.sessionrecord.application.model.PublishSessionRecordCorrectionCommand
import com.readmates.sessionrecord.application.model.PublishSessionRecordCorrectionResult
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.sessionrecord.application.port.`in`.ApplySessionRecordUseCase
import com.readmates.sessionrecord.config.HostActionConfirmationProperties
import com.readmates.shared.cache.ReadCacheInvalidationPort
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import com.readmates.shared.listing.application.port.out.bump
import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.observability.RequestIdFilter
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.slf4j.LoggerFactory
import org.slf4j.MDC
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private data class VisibilityMutation(
    val result: HostSessionVisibilityUpdateResult,
    val publicProjectionEffect: HostPublicProjectionEffect?,
)

private data class LifecycleMutation(
    val detail: HostSessionDetailResponse,
    val publicProjectionEffect: HostPublicProjectionEffect?,
)

@Service
@Suppress("TooManyFunctions")
class HostSessionLifecycleService(
    private val lifecyclePort: HostSessionLifecyclePort,
    private val deletionPort: HostSessionDeletionPort,
    private val draftPort: HostSessionDraftPort,
    private val correctionPublisher: ApplySessionRecordUseCase,
    private val cacheInvalidation: ReadCacheInvalidationPort = ReadCacheInvalidationPort.Noop(),
    private val confirmationProperties: HostActionConfirmationProperties = HostActionConfirmationProperties(),
    private val lifecycleAudit: HostSessionLifecycleAuditPort = NoopHostSessionLifecycleAuditPort,
    private val metrics: HostSessionOperationalMetrics = HostSessionOperationalMetrics(SimpleMeterRegistry()),
    private val lifecycleProperties: HostSessionLifecycleProperties = HostSessionLifecycleProperties(),
    private val epochPort: HostListEpochPort = HostListEpochPort.Noop(),
    private val deletionTransaction: HostSessionDeletionTransaction =
        HostSessionDeletionTransaction(deletionPort, lifecycleAudit, epochPort),
    private val mutations: HostSessionMutationCoordinator? = null,
) : HostSessionLifecycleUseCase {
    @Transactional
    override fun updateVisibility(command: UpdateHostSessionVisibilityCommand): HostSessionVisibilityUpdateResult {
        val coordinator = mutations
        if (coordinator != null && command.accessScope != null) {
            return coordinator.execute(
                host = command.host,
                operation = HostMutationOperation.SESSION_EXPOSURE,
                resourceSlot = command.sessionId.toString(),
                idempotencyKey = command.idempotencyKey,
                payload = HostMutationPayloads.exposure(command),
                mutate = {
                    val outcome = updateVisibilityOnce(command)
                    HostMutationOutcome(
                        resourceId = command.sessionId,
                        result = outcome.result,
                        publicProjectionEffect = outcome.publicProjectionEffect,
                    )
                },
                replay = { _, projection ->
                    HostSessionVisibilityUpdateResult(
                        session = projection?.toDetail(command.sessionId) ?: throw HostSessionNotFoundException(),
                        composer = null,
                    )
                },
            )
        }
        return updateVisibilityOnce(command).result
    }

    private fun updateVisibilityOnce(command: UpdateHostSessionVisibilityCommand): VisibilityMutation {
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
        val write = draftPort.updateVisibility(command)
        val applied = draftPort.lockVisibilitySnapshot(HostSessionIdCommand(command.host, command.sessionId))
        if (command.accessScope == null && applied.detail.visibility != command.visibility) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        if (command.accessScope != null && applied.detail.accessScope != command.accessScope) {
            throw HostActionNotificationException(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        if (write.changed) {
            epochPort.bump(command.host.clubId, HostListEpochKind.RECORD)
            cacheInvalidation.evictClubContentAfterCommit(command.host.clubId)
        }
        return VisibilityMutation(
            result =
                HostSessionVisibilityUpdateResult(
                    session = applied.detail,
                    composer =
                        if (firstPublication && write.changed) {
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
                ),
            publicProjectionEffect = write.publicProjectionEffect,
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
        executeLifecycle(
            command = command,
            operation = HostMutationOperation.SESSION_OPEN,
            payload = HostMutationPayloads.resourceOnly(HostMutationOperation.SESSION_OPEN),
        ) {
            transition(
                command = command,
                action = HostSessionLifecycleAction.OPENED,
                from = "DRAFT",
                to = "OPEN",
                write = { lifecyclePort.open(command) },
            )
        }

    @Transactional
    override fun close(command: HostSessionIdCommand) =
        executeLifecycle(
            command = command,
            operation = HostMutationOperation.SESSION_CLOSE,
            payload = HostMutationPayloads.resourceOnly(HostMutationOperation.SESSION_CLOSE),
        ) {
            transition(
                command = command,
                action = HostSessionLifecycleAction.CLOSED,
                from = "OPEN",
                to = "CLOSED",
                write = { lifecyclePort.close(command) },
            )
        }

    @Transactional
    override fun publish(command: HostSessionIdCommand) =
        executeLifecycle(
            command = command,
            operation = HostMutationOperation.SESSION_PUBLISH,
            payload = HostMutationPayloads.resourceOnly(HostMutationOperation.SESSION_PUBLISH),
        ) {
            verifyPublishVector(command)
            transition(
                command = command,
                action = HostSessionLifecycleAction.PUBLISHED,
                from = "CLOSED",
                to = "PUBLISHED",
                write = { lifecyclePort.publish(command) },
            )
        }

    @Transactional
    override fun correctionPublish(command: HostSessionIdCommand) =
        command.expectedCorrectionVector.let { expected ->
            if (expected == null) throw InvalidSessionScheduleException()
            executeCorrectionPublication(command, expected)
        }

    override fun correctionPublishPreview(command: HostSessionIdCommand): CorrectionPublicationPreview {
        val projection =
            correctionPublisher.previewCorrection(command.host, command.sessionId)
                ?: throw HostSessionPublishNotAllowedException()
        val versions = projection.versions
        val correctionVersions =
            CorrectionPublicationVersionVector(
                sessionRevision = versions.sessionRevision,
                recordDraftRevision = versions.recordDraftRevision ?: throw HostSessionPublishNotAllowedException(),
                liveRecordRevision = versions.liveRecordRevision,
                exposureRevision = versions.exposureRevision,
                publicationRevision = versions.publicationRevision,
            )
        return CorrectionPublicationPreview(
            snapshotId = correctionVersions.snapshotIdentity(command.sessionId).snapshotId,
            versions = correctionVersions,
            state = projection.state,
            accessScope = SessionAccessScope.valueOf(projection.targetAudience.accessScope.name),
            siteVisibility = PublicSiteVisibility.valueOf(projection.targetAudience.siteVisibility.name),
            visibility = projection.targetAudience.visibility,
        )
    }

    @Transactional
    override fun reopen(command: HostSessionReverseCommand) =
        executeReverse(command) {
            reverseTransition(
                command = command,
                action = HostSessionLifecycleAction.REOPENED,
                from = "CLOSED",
                to = "OPEN",
                write = lifecyclePort::reopen,
            )
        }

    @Transactional
    override fun unpublish(command: HostSessionReverseCommand) =
        executeReverse(command) {
            reverseTransition(
                command = command,
                action = HostSessionLifecycleAction.UNPUBLISHED,
                from = "PUBLISHED",
                to = "CLOSED",
                write = lifecyclePort::unpublish,
            )
        }

    @Transactional
    override fun returnToDraft(command: HostSessionReverseCommand) =
        executeReverse(command) {
            reverseTransition(
                command = command,
                action = HostSessionLifecycleAction.RETURNED_TO_DRAFT,
                from = "OPEN",
                to = "DRAFT",
                write = lifecyclePort::returnToDraft,
            )
        }

    override fun deletionPreview(command: HostSessionIdCommand) = deletionPort.assess(command).toPreviewResponse()

    override fun delete(command: HostSessionIdCommand): HostSessionTrashResponse {
        val requestId = MDC.get(RequestIdFilter.MDC_KEY)?.takeIf(String::isNotBlank)
        val coordinator = mutations ?: return deleteRecordingOutcomes(command, requestId)
        return coordinator.execute(
            host = command.host,
            operation = HostMutationOperation.SESSION_TRASH,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.resourceOnly(HostMutationOperation.SESSION_TRASH),
            mutate = {
                val snapshot = coordinator.loadProjection(command.host, command.sessionId)
                HostMutationOutcome(
                    resourceId = command.sessionId,
                    result = deleteRecordingOutcomes(command, requestId),
                    projection = snapshot,
                )
            },
            replay = { _, _ ->
                val trashed =
                    deletionPort.findTrash(command) ?: throw HostSessionNotFoundException()
                HostSessionTrashResponse(
                    sessionId = trashed.sessionId.toString(),
                    sessionNumber = trashed.sessionNumber,
                    title = trashed.title,
                    state = trashed.state,
                    trashed = true,
                    deletedAt = trashed.deletedAt.toString(),
                    purgeAfter = trashed.purgeAfter.toString(),
                    counts = deletionPort.deletionCounts(command.host.clubId, command.sessionId),
                    sessionRevision = trashed.sessionRevision,
                )
            },
        )
    }

    @Suppress("TooGenericExceptionCaught") // record deletion failure metrics for every runtime failure before rethrow
    private fun deleteRecordingOutcomes(
        command: HostSessionIdCommand,
        requestId: String?,
    ): HostSessionTrashResponse =
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

    private fun verifyPublishVector(command: HostSessionIdCommand) {
        val expected = command.expectedPublishVector ?: return
        val current = currentVersions(command)
        if (expected.sessionRevision != current.sessionRevision ||
            expected.exposureRevision != current.exposureRevision ||
            expected.publicationRevision != current.publicationRevision ||
            expected.liveRecordRevision != (current.liveRecordRevision ?: 0L)
        ) {
            throw HostSessionRevisionConflictException(current, null, null)
        }
    }

    private fun publishCorrection(command: HostSessionIdCommand): UUID {
        val expected = command.expectedCorrectionVector ?: throw InvalidSessionScheduleException()
        return correctionPublisher
            .publishCorrection(
                command.host,
                PublishSessionRecordCorrectionCommand(
                    sessionId = command.sessionId,
                    expectedSessionRevision = expected.sessionRevision,
                    expectedDraftRevision = expected.recordDraftRevision,
                    expectedLiveRevision = expected.liveRecordRevision,
                    expectedExposureRevision = expected.exposureRevision,
                    expectedPublicationRevision = expected.publicationRevision,
                ),
            ).requireApplied()
    }

    private fun executeCorrectionPublication(
        command: HostSessionIdCommand,
        expected: CorrectionPublicationVersionVector,
    ): HostSessionDetailResponse {
        val coordinator = mutations
        if (coordinator == null) {
            publishCorrection(command)
            return draftPort.lockVisibilitySnapshot(command).detail
        }
        return coordinator.execute(
            host = command.host,
            operation = HostMutationOperation.SESSION_CORRECTION_PUBLISH,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.correction(expected),
            mutate = {
                val receiptId = publishCorrection(command)
                HostMutationOutcome(
                    resourceId = command.sessionId,
                    result = draftPort.lockVisibilitySnapshot(command).detail,
                    receiptId = receiptId,
                )
            },
            replay = { _, projection ->
                projection?.toDetail(command.sessionId) ?: throw HostSessionNotFoundException()
            },
        )
    }

    private fun currentVersions(command: HostSessionIdCommand) =
        mutations?.loadProjection(command.host, command.sessionId)?.versions
            ?: throw HostSessionNotFoundException()

    private fun executeLifecycle(
        command: HostSessionIdCommand,
        operation: HostMutationOperation,
        payload: CanonicalMutationPayload,
        mutate: () -> LifecycleMutation,
    ): HostSessionDetailResponse {
        val coordinator = mutations ?: return mutate().detail
        return coordinator.execute(
            host = command.host,
            operation = operation,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = payload,
            mutate = {
                val outcome = mutate()
                HostMutationOutcome(
                    resourceId = command.sessionId,
                    result = outcome.detail,
                    publicProjectionEffect = outcome.publicProjectionEffect,
                )
            },
            replay = { _, projection ->
                projection?.toDetail(command.sessionId) ?: throw HostSessionNotFoundException()
            },
        )
    }

    private fun executeReverse(
        command: HostSessionReverseCommand,
        mutate: () -> LifecycleMutation,
    ): HostSessionDetailResponse {
        val coordinator = mutations ?: return mutate().detail
        return coordinator.execute(
            host = command.host,
            operation = HostMutationOperation.SESSION_REVERSE,
            resourceSlot = command.sessionId.toString(),
            idempotencyKey = command.idempotencyKey,
            payload = HostMutationPayloads.reverse(command),
            mutate = {
                val outcome = mutate()
                HostMutationOutcome(
                    resourceId = command.sessionId,
                    result = outcome.detail,
                    publicProjectionEffect = outcome.publicProjectionEffect,
                )
            },
            replay = { _, projection ->
                projection?.toDetail(command.sessionId) ?: throw HostSessionNotFoundException()
            },
        )
    }

    private fun reverseTransition(
        command: HostSessionReverseCommand,
        action: HostSessionLifecycleAction,
        from: String,
        to: String,
        write: (HostSessionIdCommand) -> HostSessionTransitionResult,
    ): LifecycleMutation {
        val normalized = command.normalized(lifecycleProperties.requireReverseReason)
        val idCommand =
            HostSessionIdCommand(
                normalized.host,
                normalized.sessionId,
                normalized.expectedSessionRevision,
            )
        return transition(
            command = idCommand,
            action = action,
            from = from,
            to = to,
            reasonCode = normalized.reasonCode,
            reasonNote = normalized.reasonNote,
            write = { write(idCommand) },
        )
    }

    private fun transition(
        command: HostSessionIdCommand,
        action: HostSessionLifecycleAction,
        from: String,
        to: String,
        reasonCode: HostSessionLifecycleReasonCode? = null,
        reasonNote: String? = null,
        write: () -> HostSessionTransitionResult,
    ): LifecycleMutation {
        val requestId = MDC.get(RequestIdFilter.MDC_KEY)?.takeIf(String::isNotBlank)
        return recordTransitionFailure(command, action, requestId) {
            val result = write()
            if (result.changed) {
                epochPort.bump(command.host.clubId, *listEpochsForTransition(from, to).toTypedArray())
            }
            val changeId =
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
                } else {
                    null
                }
            if (result.changed) {
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
            LifecycleMutation(
                detail =
                    result.detail.copy(
                        changeReceipt =
                            changeId?.let { id ->
                                HostSessionChangeReceipt(
                                    changeId = id,
                                    kind = HostSessionChangeKind.LIFECYCLE,
                                    undoAvailable = true,
                                )
                            },
                    ),
                publicProjectionEffect = result.publicProjectionEffect,
            )
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

private fun listEpochsForTransition(
    from: String,
    to: String,
): Set<HostListEpochKind> {
    val states = setOf(from, to)
    return buildSet {
        if (states.any { state -> state in setOf("DRAFT", "OPEN") }) add(HostListEpochKind.MEETING)
        if (states.any { state -> state in setOf("CLOSED", "PUBLISHED") }) add(HostListEpochKind.RECORD)
    }
}

private object NoopHostSessionLifecycleAuditPort : HostSessionLifecycleAuditPort {
    override fun record(entry: HostSessionLifecycleAuditEntry): UUID? = null
}

private fun isFirstMemberPublication(
    state: String,
    previousVisibility: SessionRecordVisibility,
    requestedVisibility: SessionRecordVisibility,
): Boolean =
    state == "DRAFT" &&
        previousVisibility == SessionRecordVisibility.HOST_ONLY &&
        requestedVisibility != SessionRecordVisibility.HOST_ONLY

private fun PublishSessionRecordCorrectionResult.requireApplied(): UUID =
    when (this) {
        is PublishSessionRecordCorrectionResult.Applied -> receiptId
        is PublishSessionRecordCorrectionResult.RevisionConflict ->
            throw HostSessionRevisionConflictException(
                SessionVersionVector(
                    sessionRevision = current.sessionRevision,
                    exposureRevision = current.exposureRevision,
                    participantSetRevision = current.participantSetRevision,
                    recordDraftRevision = current.recordDraftRevision,
                    liveRecordRevision = current.liveRecordRevision.takeIf { it > 0 },
                    publicationRevision = current.publicationRevision,
                ),
                null,
                null,
            )
        PublishSessionRecordCorrectionResult.NotPublished -> throw HostSessionPublishNotAllowedException()
    }
