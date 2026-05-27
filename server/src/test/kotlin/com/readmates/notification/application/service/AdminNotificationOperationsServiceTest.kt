package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.AdminNotificationClubHealth
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationRelaySummary
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayEstimate
import com.readmates.notification.application.model.AdminNotificationStatusSummary
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class AdminNotificationOperationsServiceTest {
    @Test
    fun `support can read snapshot but cannot replay`() {
        val service = serviceWith(readPort = fakeReadPort())

        val snapshot = service.snapshot(platformAdmin(PlatformAdminRole.SUPPORT))

        assertThat(snapshot.outboxSummary.pending).isEqualTo(2)
    }

    @Test
    fun `memberless admin filters are passed to read port`() {
        val readPort = RecordingAdminNotificationReadPort()

        serviceWith(readPort = readPort).listEvents(
            admin = platformAdmin(PlatformAdminRole.OWNER),
            filter = AdminNotificationFilter(clubId = CLUB_ID, eventStatus = NotificationEventOutboxStatus.FAILED),
            pageRequest = PageRequest.cursor(requestedLimit = 20, rawCursor = null, defaultLimit = 50, maxLimit = 100),
        )

        assertThat(readPort.lastFilter?.clubId).isEqualTo(CLUB_ID)
        assertThat(readPort.lastFilter?.eventStatus).isEqualTo(NotificationEventOutboxStatus.FAILED)
        assertThat(readPort.lastPageRequest?.limit).isEqualTo(20)
    }

    @Test
    fun `support cannot confirm replay`() {
        val service = serviceWith(replayPort = replayPortWithOpenPreview())

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.SUPPORT),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )
        }.isInstanceOf(AccessDeniedException::class.java)
    }

    @Test
    fun `confirm replay rejects blank reason`() {
        val service = serviceWith(replayPort = replayPortWithOpenPreview())

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, " "),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) { error ->
            assertThat(error.error)
                .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_REQUIRED)
        }
    }

    @Test
    fun `confirm replay rejects expired preview`() {
        val service = serviceWith(replayPort = replayPortWithOpenPreview(expiresAt = TIMESTAMP.minusDays(1)))

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) { error ->
            assertThat(error.error)
                .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED)
        }
    }

    @Test
    fun `confirm replay rejects selection hash mismatch`() {
        val service = serviceWith(replayPort = replayPortWithOpenPreview())

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, "b".repeat(64), "Retry failed deliveries"),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) { error ->
            assertThat(error.error)
                .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_SELECTION_MISMATCH)
        }
    }

    @Test
    fun `confirm replay replays matching preview and writes audit metadata`() {
        val replayPort = replayPortWithOpenPreview(matchedCount = 3, replayedCount = 2)
        val auditPort = RecordingAdminNotificationAuditPort()
        val service = serviceWith(replayPort = replayPort, auditPort = auditPort)

        val result =
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OPERATOR),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )

        assertThat(result.replayedCount).isEqualTo(2)
        assertThat(result.skippedCount).isEqualTo(1)
        assertThat(replayPort.consumedPreviewIds).containsExactly(PREVIEW_ID)
        val event = auditPort.events.single()
        assertThat(event.actorPlatformRole).isEqualTo("OPERATOR")
        assertThat(event.metadataJson).contains("\"previewId\":\"$PREVIEW_ID\"")
        assertThat(event.metadataJson).contains("\"reason\":\"Retry failed deliveries\"")
        assertThat(event.metadataJson).contains("\"replayedCount\":2")
    }

    private fun serviceWith(
        readPort: AdminNotificationOperationsReadPort = fakeReadPort(),
        replayPort: RecordingAdminNotificationReplayPort = RecordingAdminNotificationReplayPort(),
        auditPort: AdminNotificationAuditPort = RecordingAdminNotificationAuditPort(),
    ): AdminNotificationOperationsService =
        AdminNotificationOperationsService(
            readPort,
            replayPort,
            auditPort,
            FixedAdminNotificationJson,
        )

    private fun platformAdmin(role: PlatformAdminRole): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            email = "admin@example.com",
            role = role,
        )

    private fun fakeReadPort(): AdminNotificationOperationsReadPort =
        object : AdminNotificationOperationsReadPort {
            override fun snapshot(): AdminNotificationOperationsSnapshot = adminSnapshot()

            override fun listEvents(
                filter: AdminNotificationFilter,
                pageRequest: PageRequest,
            ): CursorPage<AdminNotificationOutboxEvent> = CursorPage(emptyList(), null)

            override fun listDeliveries(
                filter: AdminNotificationFilter,
                pageRequest: PageRequest,
            ): CursorPage<AdminNotificationDelivery> = CursorPage(emptyList(), null)
        }
}

private fun replayPortWithOpenPreview(
    expiresAt: OffsetDateTime = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(10),
    matchedCount: Int = 3,
    replayedCount: Int = 3,
): RecordingAdminNotificationReplayPort =
    RecordingAdminNotificationReplayPort(
        previewRecord =
            AdminNotificationReplayPreviewRecord(
                previewId = PREVIEW_ID,
                actorUserId = ADMIN_USER_ID,
                filterJson = "{}",
                selectionHash = SELECTION_HASH,
                matchedCount = matchedCount,
                expiresAt = expiresAt,
            ),
        replayedCount = replayedCount,
    )

private class RecordingAdminNotificationReadPort : AdminNotificationOperationsReadPort {
    var lastFilter: AdminNotificationFilter? = null
    var lastPageRequest: PageRequest? = null

    override fun snapshot(): AdminNotificationOperationsSnapshot = adminSnapshot()

    override fun listEvents(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> {
        lastFilter = filter
        lastPageRequest = pageRequest
        return CursorPage(emptyList(), null)
    }

    override fun listDeliveries(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> = CursorPage(emptyList(), null)
}

private class RecordingAdminNotificationReplayPort(
    private val previewRecord: AdminNotificationReplayPreviewRecord? = null,
    private val replayedCount: Int = 0,
) : AdminNotificationReplayPort {
    val consumedPreviewIds = mutableListOf<UUID>()

    override fun estimateReplayableDeliveries(filter: AdminNotificationFilter): AdminNotificationReplayEstimate =
        AdminNotificationReplayEstimate(matchedCount = 3, estimatedByStatus = mapOf("FAILED" to 2, "DEAD" to 1))

    override fun createPreview(
        actorUserId: UUID,
        filterJson: String,
        selectionHash: String,
        matchedCount: Int,
        expiresAt: OffsetDateTime,
    ): UUID = PREVIEW_ID

    override fun loadOpenPreview(previewId: UUID): AdminNotificationReplayPreviewRecord? =
        previewRecord?.takeIf { it.previewId == previewId }

    override fun markPreviewConsumed(previewId: UUID): Boolean {
        consumedPreviewIds += previewId
        return true
    }

    override fun replayDeadOrFailedDeliveries(filter: AdminNotificationFilter): Int = replayedCount
}

private data class AuditEvent(
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val metadataJson: String,
)

private class RecordingAdminNotificationAuditPort : AdminNotificationAuditPort {
    val events = mutableListOf<AuditEvent>()

    override fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
    ) {
        events += AuditEvent(actorUserId, actorPlatformRole, metadataJson)
    }
}

private object FixedAdminNotificationJson : AdminNotificationJsonCodec {
    override fun filterJson(filter: AdminNotificationFilter): String = "{}"

    override fun metadataJson(
        previewId: UUID,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String =
        """
        {
          "previewId":"$previewId",
          "selectionHash":"$selectionHash",
          "reason":"$reason",
          "replayedCount":$replayedCount,
          "skippedCount":$skippedCount
        }
        """.trimIndent().replace("\n", "")
}

private fun adminSnapshot(): AdminNotificationOperationsSnapshot =
    AdminNotificationOperationsSnapshot(
        generatedAt = TIMESTAMP,
        outboxSummary =
            AdminNotificationStatusSummary(
                pending = 2,
                active = 1,
                failed = 0,
                dead = 0,
                sentOrPublishedLast24h = 3,
            ),
        deliverySummary =
            AdminNotificationStatusSummary(
                pending = 4,
                active = 1,
                failed = 1,
                dead = 0,
                sentOrPublishedLast24h = 9,
            ),
        relaySummary =
            AdminNotificationRelaySummary(
                publishing = 0,
                sending = 1,
                stalePublishing = 0,
                staleSending = 0,
            ),
        failureClusters = emptyList(),
        clubHealth =
            listOf(
                AdminNotificationClubHealth(
                    clubId = CLUB_ID,
                    slug = "reading-sai",
                    name = "Reading Sai",
                    pending = 2,
                    failed = 0,
                    dead = 0,
                    lastSuccessAt = TIMESTAMP,
                ),
            ),
        recentManualDispatches = emptyList(),
    )

private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
private val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
private const val SELECTION_HASH: String = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
private val TIMESTAMP: OffsetDateTime = OffsetDateTime.of(2026, 5, 27, 1, 2, 3, 0, ZoneOffset.UTC)
