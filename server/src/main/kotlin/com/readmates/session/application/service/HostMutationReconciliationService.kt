package com.readmates.session.application.service

import com.readmates.session.application.model.AttendanceVersion
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
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

private typealias NotExecuted = HostMutationReconciliationResult.NotExecuted

@Service
class HostMutationReconciliationService(
    private val idempotency: MutationIdempotencyService,
    private val receipts: HostMutationReceiptPort,
    private val projectionPort: HostSessionProjectionPort,
) : ReconcileHostMutationUseCase {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
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
        val stored = idempotency.lookup(identity) ?: return currentNotExecuted(command)
        return when (stored.status) {
            MutationIdempotencyStatus.IN_PROGRESS -> HostMutationReconciliationResult.Pending
            MutationIdempotencyStatus.COMPLETED -> {
                val receiptId = stored.receiptId ?: return HostMutationReconciliationResult.Pending
                val record =
                    receipts.find(command.host.clubId, receiptId)
                        ?: return currentNotExecuted(command)
                val state = currentState(command.host, record.resourceId)
                HostMutationReconciliationResult.Committed(
                    receipt = record.toResult(state.projection ?: record.redactedProjection()),
                    current = state.projection,
                    attendanceVersions = state.attendanceVersions,
                    attendanceSnapshotId = state.attendanceSnapshotId,
                )
            }
        }
    }

    private fun currentNotExecuted(command: ReconcileHostMutationCommand): NotExecuted {
        val sessionId =
            runCatching { UUID.fromString(command.resourceSlot) }.getOrNull()
                ?: return HostMutationReconciliationResult.NotExecuted()
        val state = currentState(command.host, sessionId)
        return HostMutationReconciliationResult.NotExecuted(
            current = state.projection,
            attendanceVersions = state.attendanceVersions,
            attendanceSnapshotId = state.attendanceSnapshotId,
        )
    }

    private fun currentState(
        host: CurrentMember,
        sessionId: UUID,
    ): CurrentMutationState {
        val projection =
            projectionPort.loadProjection(host, sessionId, includeTrashed = true)
                ?: return CurrentMutationState()
        val attendanceVersions = projectionPort.loadAttendanceVersions(host, sessionId)
        return CurrentMutationState(
            projection = projection,
            attendanceVersions = attendanceVersions,
            attendanceSnapshotId =
                "att:${attendanceVersions.joinToString(",") { "${it.membershipId}:${it.attendanceRevision}" }}",
        )
    }

    private companion object {
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
        val RESOURCE_SLOT = Regex("^[A-Za-z0-9._-]{1,128}$")
    }
}

private data class CurrentMutationState(
    val projection: HostProjectionSnapshot? = null,
    val attendanceVersions: List<AttendanceVersion> = emptyList(),
    val attendanceSnapshotId: String? = null,
)

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
