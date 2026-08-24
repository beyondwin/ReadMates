package com.readmates.session.application.service

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostMutationReceiptRecord
import com.readmates.session.application.model.HostProjectionSnapshot
import com.readmates.session.application.model.HostPublicProjectionEffect
import com.readmates.session.application.model.NotificationDecision
import com.readmates.session.application.port.out.HostMutationReceiptPort
import com.readmates.session.application.port.out.HostSessionProjectionPort
import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.mutation.application.model.MutationClaimResult
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.model.MutationPendingException
import com.readmates.shared.mutation.application.service.MutationIdempotencyService
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.UUID

data class HostMutationOutcome<T>(
    val resourceId: UUID,
    val result: T,
    val projection: HostProjectionSnapshot? = null,
    val notificationDecision: NotificationDecision = NotificationDecision.NOT_SENT,
    val dispatchReceiptId: UUID? = null,
    val receiptId: UUID? = null,
    val publicProjectionEffect: HostPublicProjectionEffect? = null,
)

@Service
class HostSessionMutationCoordinator(
    private val idempotency: MutationIdempotencyService,
    private val receipts: HostMutationReceiptPort,
    private val projectionPort: HostSessionProjectionPort,
    private val clock: Clock,
) {
    fun loadProjection(
        host: CurrentMember,
        sessionId: UUID,
    ): HostProjectionSnapshot? = projectionPort.loadProjection(host, sessionId)

    fun attendanceSnapshotId(
        host: CurrentMember,
        sessionId: UUID,
    ): String = projectionPort.attendanceSnapshotId(host, sessionId)

    fun <T> execute(
        host: CurrentMember,
        operation: HostMutationOperation,
        resourceSlot: String,
        idempotencyKey: String?,
        payload: CanonicalMutationPayload,
        mutate: () -> HostMutationOutcome<T>,
        replay: (HostMutationReceiptRecord, HostProjectionSnapshot?) -> T,
    ): T {
        val identity =
            MutationIdentity(
                clubId = host.clubId,
                actorMembershipId = host.membershipId,
                operation = operation.name,
                resourceSlot = resourceSlot,
                idempotencyKey = idempotencyKey ?: generatedKey(),
            )
        return when (val claim = idempotency.claim(identity, payload)) {
            is MutationClaimResult.Claimed -> {
                val outcome = mutate()
                val projection =
                    outcome.projection
                        ?: projectionPort.loadProjection(host, outcome.resourceId)
                        ?: throw HostSessionNotFoundException()
                val record =
                    HostMutationReceiptRecord(
                        receiptId = outcome.receiptId ?: UUID.randomUUID(),
                        clubId = host.clubId,
                        actorMembershipId = host.membershipId,
                        operation = operation.name,
                        resourceId = outcome.resourceId,
                        resultingVersions = projection.versions,
                        notificationDecision = outcome.notificationDecision,
                        dispatchReceiptId = outcome.dispatchReceiptId,
                        createdAt = clock.instant(),
                        publicProjectionEffect = outcome.publicProjectionEffect,
                    )
                receipts.insert(record)
                idempotency.complete(identity, record.receiptId)
                outcome.result
            }
            is MutationClaimResult.Replayed -> {
                val record =
                    receipts.find(host.clubId, claim.receiptId)
                        ?: throw HostSessionNotFoundException()
                replay(record, projectionPort.loadProjection(host, record.resourceId))
            }
            is MutationClaimResult.InProgress -> throw MutationPendingException()
        }
    }

    private fun generatedKey(): String = "k${UUID.randomUUID().toString().replace("-", "")}"
}
