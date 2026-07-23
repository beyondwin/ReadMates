package com.readmates.notification.application.service

import com.readmates.notification.application.model.CompleteHostActionDecisionCommand
import com.readmates.notification.application.model.HostActionDecisionCommand
import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.HostActionPreview
import com.readmates.notification.application.model.HostActionPreviewCommand
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.model.PreparedHostActionDecision
import com.readmates.notification.application.port.`in`.ConfirmHostActionNotificationUseCase
import com.readmates.notification.application.port.out.HostActionNotificationPort
import com.readmates.notification.application.port.out.HostActionNotificationPreviewRecord
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.Sha256
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.util.UUID

private const val HOST_ACTION_PREVIEW_TTL_MINUTES = 5L

@Service
class HostActionNotificationGateService(
    private val port: HostActionNotificationPort,
    private val clock: () -> OffsetDateTime = { OffsetDateTime.now() },
) : ConfirmHostActionNotificationUseCase {
    override fun preview(
        host: CurrentMember,
        command: HostActionPreviewCommand,
    ): HostActionPreview {
        val expiresAt = clock().plusMinutes(HOST_ACTION_PREVIEW_TTL_MINUTES)
        val counts = port.countTargets(host.clubId, command.sessionId, command.eventType)
        val record =
            HostActionNotificationPreviewRecord(
                UUID.randomUUID(),
                host.clubId,
                command.sessionId,
                host.membershipId,
                command.action,
                command.eventType,
                selectionHash(host, command),
                command.expectedDraftRevision,
                command.expectedLiveRevision,
                counts,
                expiresAt,
            )
        port.insertPreview(record)
        return HostActionPreview(
            record.id,
            counts.targetCount,
            counts.expectedInAppCount,
            counts.expectedEmailCount,
            counts.excludedCount,
            expiresAt,
        )
    }

    @Transactional
    override fun prepare(
        host: CurrentMember,
        command: HostActionDecisionCommand,
    ): PreparedHostActionDecision {
        val preview =
            port.lockPreview(command.previewId, host.clubId, host.membershipId)
                ?: fail(HostActionNotificationError.PREVIEW_NOT_FOUND)
        if (!preview.expiresAt.isAfter(clock())) fail(HostActionNotificationError.PREVIEW_EXPIRED)
        val selection =
            HostActionPreviewCommand(
                command.sessionId,
                command.action,
                command.eventType,
                command.expectedDraftRevision,
                command.expectedLiveRevision,
                command.requestHash,
            )
        if (!preview.matches(command, selectionHash(host, selection))) {
            fail(HostActionNotificationError.PREVIEW_MISMATCH)
        }
        val currentCounts = port.countTargets(host.clubId, command.sessionId, command.eventType)
        if (currentCounts != preview.counts) fail(HostActionNotificationError.TARGETS_CHANGED)
        if (command.decision == NotificationDecision.SEND && currentCounts.targetCount == 0) {
            fail(HostActionNotificationError.AUDIENCE_EMPTY)
        }
        return PreparedHostActionDecision(
            preview.id,
            preview.clubId,
            preview.sessionId,
            preview.hostMembershipId,
            preview.action,
            preview.eventType,
            command.decision,
            preview.counts,
        )
    }

    @Transactional
    override fun complete(command: CompleteHostActionDecisionCommand): StoredHostActionDecision {
        port.findDecision(command.prepared.previewId)?.let { return it }
        if ((command.prepared.decision == NotificationDecision.SEND) != (command.eventId != null)) {
            fail(HostActionNotificationError.INVALID_DECISION)
        }
        val preview =
            port.lockPreview(
                command.prepared.previewId,
                command.prepared.clubId,
                command.prepared.hostMembershipId,
            ) ?: fail(HostActionNotificationError.PREVIEW_NOT_FOUND)
        return port.completeDecision(
            preview,
            command.prepared.decision,
            command.liveRevision,
            command.eventId,
            clock(),
        )
    }

    override fun findCompleted(
        host: CurrentMember,
        command: HostActionDecisionCommand,
    ): StoredHostActionDecision? {
        val decision = port.findDecision(command.previewId) ?: return null
        val preview =
            port.lockPreview(command.previewId, host.clubId, host.membershipId)
                ?: fail(HostActionNotificationError.PREVIEW_NOT_FOUND)
        val selection =
            HostActionPreviewCommand(
                command.sessionId,
                command.action,
                command.eventType,
                command.expectedDraftRevision,
                command.expectedLiveRevision,
                command.requestHash,
            )
        val matchesDecision =
            decision.clubId == host.clubId &&
                decision.hostMembershipId == host.membershipId &&
                decision.sessionId == command.sessionId &&
                decision.action == command.action &&
                decision.eventType == command.eventType &&
                decision.decision == command.decision
        if (!preview.matches(command, selectionHash(host, selection)) || !matchesDecision) {
            fail(HostActionNotificationError.PREVIEW_ALREADY_CONSUMED)
        }
        return decision
    }

    private fun selectionHash(
        host: CurrentMember,
        command: HostActionPreviewCommand,
    ): String =
        Sha256.hex(
            listOf(
                host.clubId,
                host.membershipId,
                command.sessionId,
                command.action,
                command.eventType,
                command.expectedDraftRevision,
                command.expectedLiveRevision,
                command.requestHash,
            ).joinToString("|"),
        )

    private fun fail(error: HostActionNotificationError): Nothing = throw HostActionNotificationException(error)

    private fun HostActionNotificationPreviewRecord.matches(
        command: HostActionDecisionCommand,
        expectedSelectionHash: String,
    ): Boolean =
        sessionId == command.sessionId &&
            action == command.action &&
            eventType == command.eventType &&
            expectedDraftRevision == command.expectedDraftRevision &&
            expectedLiveRevision == command.expectedLiveRevision &&
            requestHash == expectedSelectionHash
}
