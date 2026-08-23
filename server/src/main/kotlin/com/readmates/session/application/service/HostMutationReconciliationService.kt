package com.readmates.session.application.service

import com.readmates.session.application.model.HostMutationNotAuthorizedException
import com.readmates.session.application.model.HostMutationReceiptRecord
import com.readmates.session.application.model.HostMutationReceiptResult
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.port.`in`.HostMutationReconciliationResult
import com.readmates.session.application.port.`in`.ReconcileHostMutationCommand
import com.readmates.session.application.port.`in`.ReconcileHostMutationUseCase
import com.readmates.session.application.port.out.HostMutationReceiptPort
import com.readmates.session.application.port.out.HostSessionProjectionPort
import com.readmates.session.application.requireHost
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.mutation.application.model.InvalidMutationIdempotencyKeyException
import com.readmates.shared.mutation.application.model.MutationIdempotencyStatus
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.model.UnknownMutationOperationException
import com.readmates.shared.mutation.application.service.MutationIdempotencyService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class HostMutationReconciliationService(
    private val idempotency: MutationIdempotencyService,
    private val receipts: HostMutationReceiptPort,
    private val projectionPort: HostSessionProjectionPort,
) : ReconcileHostMutationUseCase {
    @Transactional(readOnly = true)
    @Suppress("ReturnCount", "ThrowsCount")
    override fun reconcile(command: ReconcileHostMutationCommand): HostMutationReconciliationResult {
        if (!command.host.isHost) {
            throw HostMutationNotAuthorizedException()
        }
        requireHost(command.host)
        if (!RESOURCE_SLOT.matches(command.resourceSlot) || !IDEMPOTENCY_KEY.matches(command.idempotencyKey)) {
            throw InvalidMutationIdempotencyKeyException()
        }
        if (command.operation.isBlank()) {
            throw UnknownMutationOperationException()
        }
        val identity =
            MutationIdentity(
                clubId = command.host.clubId,
                actorMembershipId = command.host.membershipId,
                operation = command.operation,
                resourceSlot = command.resourceSlot,
                idempotencyKey = command.idempotencyKey,
            )
        val stored = idempotency.lookup(identity) ?: return HostMutationReconciliationResult.NotExecuted
        return when (stored.status) {
            MutationIdempotencyStatus.IN_PROGRESS -> HostMutationReconciliationResult.Pending
            MutationIdempotencyStatus.COMPLETED -> {
                val receiptId = stored.receiptId ?: return HostMutationReconciliationResult.Pending
                val record =
                    receipts.find(command.host.clubId, receiptId)
                        ?: return HostMutationReconciliationResult.NotExecuted
                val current = projectionPort.loadProjection(command.host, record.resourceId, includeTrashed = true)
                HostMutationReconciliationResult.Committed(
                    receipt = record.toResult(current ?: record.redactedProjection()),
                    current = current,
                )
            }
        }
    }

    private companion object {
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
        val RESOURCE_SLOT = Regex("^[A-Za-z0-9._-]{1,128}$")
    }
}

private fun HostMutationReceiptRecord.toResult(projection: HostProjectionSnapshot) =
    HostMutationReceiptResult(
        receiptId = receiptId.toString(),
        operation = operation,
        resourceId = resourceId.toString(),
        resultingVersions = resultingVersions,
        notificationDecision = notificationDecision,
        projection = projection,
    )

private fun HostMutationReceiptRecord.redactedProjection(): HostProjectionSnapshot =
    HostProjectionSnapshot(
        snapshotId = resultingVersions.snapshotIdentity(resourceId).snapshotId,
        sessionId = resourceId.toString(),
        sessionNumber = 0,
        title = "",
        bookTitle = "",
        bookAuthor = "",
        date = "",
        startTime = "",
        endTime = "",
        locationLabel = "",
        state = "GONE",
        versions = resultingVersions,
        accessScope = SessionAccessScope.HOST_ONLY,
        siteVisibility = PublicSiteVisibility.HIDDEN,
        visibility = SessionRecordVisibility.HOST_ONLY,
    )
