package com.readmates.session.application.model

import java.time.Instant
import java.util.UUID

enum class NotificationDecision {
    NOT_SENT,
    DISPATCH_REFERENCED,
}

data class HostMutationReceiptRecord(
    val receiptId: UUID,
    val clubId: UUID,
    val actorMembershipId: UUID,
    val operation: String,
    val resourceId: UUID,
    val resultingVersions: SessionVersionVector,
    val notificationDecision: NotificationDecision,
    val dispatchReceiptId: UUID?,
    val createdAt: Instant,
    val publicProjectionEffect: HostPublicProjectionEffect? = null,
) {
    init {
        require(operation.isNotBlank()) { "operation must not be blank" }
        if (notificationDecision == NotificationDecision.NOT_SENT) {
            require(dispatchReceiptId == null) { "NOT_SENT receipts cannot reference a dispatch" }
        } else {
            require(dispatchReceiptId != null) { "DISPATCH_REFERENCED receipts require a dispatch id" }
        }
    }

    override fun toString(): String =
        "HostMutationReceiptRecord(receiptId=$receiptId, operation=$operation, resourceId=$resourceId, " +
            "notificationDecision=$notificationDecision)"
}

data class HostPublicProjectionEffect(
    val convergenceId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID?,
    val generation: Long,
    val clubGeneration: Long,
    val liveRecordRevision: Long?,
    val originReadable: Boolean,
)
