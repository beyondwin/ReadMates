package com.readmates.notification.application.service

import com.readmates.auth.domain.MembershipRole
import com.readmates.notification.application.model.CompleteHostActionDecisionCommand
import com.readmates.notification.application.model.HostActionDecisionCommand
import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.HostActionPreviewCommand
import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.port.out.HostActionNotificationPort
import com.readmates.notification.application.port.out.HostActionNotificationPreviewRecord
import com.readmates.notification.application.port.out.StoredHostActionDecision
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.security.CurrentMember
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class HostActionNotificationGateServiceTest {
    private val now = OffsetDateTime.parse("2026-07-23T08:00:00Z")
    private val port = FakeHostActionNotificationPort()
    private val service = HostActionNotificationGateService(port) { now }

    @Test
    fun `preview stores only counts and a request hash`() {
        port.currentCounts = COUNTS

        val preview = service.preview(HOST, previewCommand())

        assertThat(preview.targetCount).isEqualTo(3)
        assertThat(preview.expectedInAppCount).isEqualTo(3)
        assertThat(preview.expectedEmailCount).isEqualTo(2)
        assertThat(preview.excludedCount).isEqualTo(1)
        assertThat(preview.expiresAt).isEqualTo(now.plusMinutes(5))
        assertThat(port.insertedPreview)
            .usingRecursiveComparison()
            .ignoringFields("id")
            .isEqualTo(
                HostActionNotificationPreviewRecord(
                    id = port.insertedPreview!!.id,
                    clubId = HOST.clubId,
                    sessionId = SESSION_ID,
                    hostMembershipId = HOST.membershipId,
                    action = HostConfirmedAction.SESSION_RECORD_APPLY,
                    eventType = NotificationEventType.SESSION_RECORD_UPDATED,
                    requestHash = selectionHash(HOST, previewCommand()),
                    expectedDraftRevision = 4,
                    expectedLiveRevision = 2,
                    counts = COUNTS,
                    expiresAt = now.plusMinutes(5),
                ),
            )
    }

    @Test
    fun `prepare rejects expired preview`() {
        val preview = storedPreview(expiresAt = now.minusNanos(1))
        port.previews[preview.id] = preview

        assertThatThrownBy { service.prepare(HOST, decisionCommand(preview.id)) }
            .isInstanceOf(HostActionNotificationException::class.java)
            .extracting("error")
            .isEqualTo(HostActionNotificationError.PREVIEW_EXPIRED)
    }

    @Test
    fun `prepare rejects another host or changed revisions`() {
        val preview = storedPreview()
        port.previews[preview.id] = preview

        assertThatThrownBy { service.prepare(OTHER_HOST, decisionCommand(preview.id)) }
            .isInstanceOf(HostActionNotificationException::class.java)
            .extracting("error")
            .isEqualTo(HostActionNotificationError.PREVIEW_NOT_FOUND)

        assertThatThrownBy {
            service.prepare(
                HOST,
                decisionCommand(preview.id).copy(expectedLiveRevision = 3),
            )
        }.isInstanceOf(HostActionNotificationException::class.java)
            .extracting("error")
            .isEqualTo(HostActionNotificationError.PREVIEW_MISMATCH)
    }

    @Test
    fun `send requires a nonzero eligible audience`() {
        val preview = storedPreview(counts = HostActionTargetCounts(0, 0, 0, 0))
        port.previews[preview.id] = preview
        port.currentCounts = preview.counts

        assertThatThrownBy { service.prepare(HOST, decisionCommand(preview.id, NotificationDecision.SEND)) }
            .isInstanceOf(HostActionNotificationException::class.java)
            .extracting("error")
            .isEqualTo(HostActionNotificationError.AUDIENCE_EMPTY)
    }

    @Test
    fun `complete skip records a decision without an event id`() {
        val preview = storedPreview()
        port.previews[preview.id] = preview
        port.currentCounts = preview.counts
        val prepared = service.prepare(HOST, decisionCommand(preview.id, NotificationDecision.SKIP))

        val stored =
            service.complete(
                CompleteHostActionDecisionCommand(
                    prepared = prepared,
                    liveRevision = 3,
                    eventId = null,
                ),
            )

        assertThat(stored.decision).isEqualTo(NotificationDecision.SKIP)
        assertThat(stored.eventId).isNull()
        assertThat(port.previews.getValue(preview.id).consumedDecisionId).isEqualTo(stored.id)
    }

    @Test
    fun `completed preview returns the stored decision idempotently`() {
        val preview = storedPreview()
        port.previews[preview.id] = preview
        port.currentCounts = preview.counts
        val prepared = service.prepare(HOST, decisionCommand(preview.id, NotificationDecision.SEND))
        val eventId = UUID.nameUUIDFromBytes("event".toByteArray())
        val command =
            CompleteHostActionDecisionCommand(
                prepared = prepared,
                liveRevision = 3,
                eventId = eventId,
            )

        val first = service.complete(command)
        val second = service.complete(command)

        assertThat(second).isEqualTo(first)
        assertThat(port.insertCount).isEqualTo(1)
    }

    private fun previewCommand() =
        HostActionPreviewCommand(
            sessionId = SESSION_ID,
            action = HostConfirmedAction.SESSION_RECORD_APPLY,
            eventType = NotificationEventType.SESSION_RECORD_UPDATED,
            expectedDraftRevision = 4,
            expectedLiveRevision = 2,
            requestHash = REQUEST_HASH,
        )

    private fun decisionCommand(
        previewId: UUID,
        decision: NotificationDecision = NotificationDecision.SKIP,
    ) = HostActionDecisionCommand(
        previewId = previewId,
        sessionId = SESSION_ID,
        action = HostConfirmedAction.SESSION_RECORD_APPLY,
        eventType = NotificationEventType.SESSION_RECORD_UPDATED,
        expectedDraftRevision = 4,
        expectedLiveRevision = 2,
        requestHash = REQUEST_HASH,
        decision = decision,
    )

    private fun storedPreview(
        expiresAt: OffsetDateTime = now.plusMinutes(5),
        counts: HostActionTargetCounts = COUNTS,
    ) = HostActionNotificationPreviewRecord(
        id = UUID.randomUUID(),
        clubId = HOST.clubId,
        sessionId = SESSION_ID,
        hostMembershipId = HOST.membershipId,
        action = HostConfirmedAction.SESSION_RECORD_APPLY,
        eventType = NotificationEventType.SESSION_RECORD_UPDATED,
        requestHash = selectionHash(HOST, previewCommand()),
        expectedDraftRevision = 4,
        expectedLiveRevision = 2,
        counts = counts,
        expiresAt = expiresAt,
    )

    private fun selectionHash(
        host: CurrentMember,
        command: HostActionPreviewCommand,
    ): String =
        com.readmates.shared.security.Sha256.hex(
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
}

private class FakeHostActionNotificationPort : HostActionNotificationPort {
    var currentCounts = COUNTS
    var insertedPreview: HostActionNotificationPreviewRecord? = null
    val previews = mutableMapOf<UUID, HostActionNotificationPreviewRecord>()
    private val decisions = mutableMapOf<UUID, StoredHostActionDecision>()
    var insertCount = 0

    override fun countTargets(
        clubId: UUID,
        sessionId: UUID,
        eventType: NotificationEventType,
    ): HostActionTargetCounts = currentCounts

    override fun insertPreview(record: HostActionNotificationPreviewRecord): UUID {
        insertedPreview = record
        previews[record.id] = record
        return record.id
    }

    override fun lockPreview(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): HostActionNotificationPreviewRecord? =
        previews[previewId]?.takeIf {
            it.clubId == clubId && it.hostMembershipId == hostMembershipId
        }

    override fun findDecision(previewId: UUID): StoredHostActionDecision? = decisions[previewId]

    override fun completeDecision(
        preview: HostActionNotificationPreviewRecord,
        decision: NotificationDecision,
        liveRevision: Long,
        eventId: UUID?,
        now: OffsetDateTime,
    ): StoredHostActionDecision {
        decisions[preview.id]?.let { return it }
        insertCount += 1
        val stored =
            StoredHostActionDecision(
                id = UUID.randomUUID(),
                previewId = preview.id,
                clubId = preview.clubId,
                sessionId = preview.sessionId,
                hostMembershipId = preview.hostMembershipId,
                action = preview.action,
                eventType = preview.eventType,
                liveRevision = liveRevision,
                decision = decision,
                counts = preview.counts,
                eventId = eventId,
                createdAt = now,
            )
        decisions[preview.id] = stored
        previews[preview.id] =
            preview.copy(
                consumedAt = now,
                consumedDecisionId = stored.id,
            )
        return stored
    }
}

private val CLUB_ID: UUID = UUID.nameUUIDFromBytes("club".toByteArray())
private val SESSION_ID: UUID = UUID.nameUUIDFromBytes("session".toByteArray())
private val HOST =
    CurrentMember(
        userId = UUID.nameUUIDFromBytes("host-user".toByteArray()),
        membershipId = UUID.nameUUIDFromBytes("host-membership".toByteArray()),
        clubId = CLUB_ID,
        clubSlug = "reading-sai",
        email = "host@example.com",
        displayName = "Host",
        accountName = "Host",
        role = MembershipRole.HOST,
    )
private val OTHER_HOST =
    HOST.copy(
        userId = UUID.nameUUIDFromBytes("other-host-user".toByteArray()),
        membershipId = UUID.nameUUIDFromBytes("other-host-membership".toByteArray()),
    )
private val COUNTS = HostActionTargetCounts(3, 3, 2, 1)
private const val REQUEST_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
