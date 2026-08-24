package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostMutationReceiptRecord
import com.readmates.session.application.model.NotificationDecision
import com.readmates.session.application.port.out.HostMutationReceiptPort
import com.readmates.session.application.port.out.HostSessionProjectionPort
import com.readmates.sessionrecord.application.port.out.SessionRecordMutationReceiptPort
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Component
import java.time.Clock
import java.util.UUID

@Component
class SessionRecordHostMutationReceiptAdapter(
    private val projections: HostSessionProjectionPort,
    private val receipts: HostMutationReceiptPort,
    private val clock: Clock,
) : SessionRecordMutationReceiptPort {
    override fun recordCommitted(
        host: CurrentMember,
        sessionId: UUID,
        receiptId: UUID,
    ) {
        val existing = receipts.find(host.clubId, receiptId)
        if (existing != null) {
            check(existing.matches(host, sessionId)) { "Record apply receipt id was already used" }
            return
        }
        val projection =
            projections.loadProjection(host, sessionId)
                ?: throw HostSessionNotFoundException()
        receipts.insert(
            HostMutationReceiptRecord(
                receiptId = receiptId,
                clubId = host.clubId,
                actorMembershipId = host.membershipId,
                operation = HostMutationOperation.SESSION_RECORD_APPLY.name,
                resourceId = sessionId,
                resultingVersions = projection.versions,
                notificationDecision = NotificationDecision.NOT_SENT,
                dispatchReceiptId = null,
                createdAt = clock.instant(),
            ),
        )
    }

    override fun matchesCommitted(
        host: CurrentMember,
        sessionId: UUID,
        receiptId: UUID,
    ): Boolean = receipts.find(host.clubId, receiptId)?.matches(host, sessionId) == true
}

private fun HostMutationReceiptRecord.matches(
    host: CurrentMember,
    sessionId: UUID,
): Boolean =
    clubId == host.clubId &&
        actorMembershipId == host.membershipId &&
        operation == HostMutationOperation.SESSION_RECORD_APPLY.name &&
        resourceId == sessionId
