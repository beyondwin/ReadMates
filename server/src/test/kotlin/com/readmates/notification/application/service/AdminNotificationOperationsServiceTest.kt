package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.config.AdminNotificationReplayProperties
import com.readmates.notification.application.model.AdminNotificationClubHealth
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationRelaySummary
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplaySnapshot
import com.readmates.notification.application.model.AdminNotificationReplayTarget
import com.readmates.notification.application.model.AdminNotificationStatusSummary
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

class AdminNotificationOperationsServiceTest {
    @Test
    fun `support can read snapshot but cannot replay`() {
        val replayPort = RecordingAdminNotificationReplayPort()
        val service = serviceWith(readPort = fakeReadPort(), replayPort = replayPort)

        val snapshot = service.snapshot(platformAdmin(PlatformAdminRole.SUPPORT))

        assertThat(snapshot.outboxSummary.pending).isEqualTo(2)

        assertThatThrownBy {
            service.previewReplay(
                platformAdmin(PlatformAdminRole.SUPPORT),
                com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest(
                    AdminNotificationFilter(),
                ),
            )
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(replayPort.estimateCalls).isZero()
        assertThat(replayPort.createdPreviews).isEmpty()
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
        val replayPort = replayPortWithOpenPreview()
        val service = serviceWith(replayPort = replayPort)

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.SUPPORT),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(replayPort.loadCalls).isZero()
        assertThat(replayPort.consumedPreviews).isEmpty()
        assertThat(replayPort.replayedTransitions).isEmpty()
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
    fun `preview normalizes one clock instant and stores the identical microsecond expiry`() {
        val replayPort = RecordingAdminNotificationReplayPort()
        val clock = AdminReplayCountingClock(Instant.parse("2026-05-27T01:02:03.123456789Z"))
        val service = serviceWith(replayPort = replayPort, clock = clock)

        val preview =
            service.previewReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest(
                    AdminNotificationFilter(),
                ),
            )

        assertThat(clock.readCount).isEqualTo(1)
        assertThat(replayPort.createdPreviews.single().createdAt)
            .isEqualTo(OffsetDateTime.parse("2026-05-27T01:02:03.123456Z"))
        assertThat(replayPort.createdPreviews.single().expiresAt)
            .isEqualTo(OffsetDateTime.parse("2026-05-27T01:12:03.123456Z"))
        assertThat(preview.expiresAt).isEqualTo(replayPort.createdPreviews.single().expiresAt)
        assertThat(preview.expiresAt.nano % 1_000).isZero()
    }

    @Test
    fun `preview rejects estimates above the configured target cap before persistence`() {
        val replayPort = RecordingAdminNotificationReplayPort(matchedCount = 3)
        val service =
            serviceWith(
                replayPort = replayPort,
                replayProperties = AdminNotificationReplayProperties(maxTargets = 2),
            )

        assertThatThrownBy {
            service.previewReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest(
                    AdminNotificationFilter(),
                ),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) { error ->
            assertThat(error.error)
                .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_TOO_MANY_TARGETS)
        }
        assertThat(replayPort.createdPreviews).isEmpty()
    }

    @Test
    fun `another actor cannot confirm before any replay mutation`() {
        val replayPort = replayPortWithOpenPreview()
        val auditPort = RecordingAdminNotificationAuditPort()
        val clock = AdminReplayCountingClock(TIMESTAMP.toInstant())
        val service = serviceWith(replayPort = replayPort, auditPort = auditPort, clock = clock)

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER, OTHER_ADMIN_USER_ID),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )
        }.isInstanceOf(AccessDeniedException::class.java)

        assertThat(clock.readCount).isEqualTo(1)
        assertThat(replayPort.consumedPreviews).isEmpty()
        assertThat(replayPort.replayedTransitions).isEmpty()
        assertThat(auditPort.events).isEmpty()
    }

    @Test
    fun `confirm succeeds one microsecond before expiry and observes one normalized instant`() {
        val expiresAt = TIMESTAMP.plusMinutes(10)
        val now = expiresAt.minusNanos(1_000)
        val replayPort =
            replayPortWithOpenPreview(
                expiresAt = expiresAt,
                matchedCount = 3,
                replayedCount = 2,
                actorPlatformRole = "OPERATOR",
            )
        val auditPort = RecordingAdminNotificationAuditPort()
        val clock = AdminReplayCountingClock(now.toInstant().plusNanos(999))
        val service = serviceWith(replayPort = replayPort, auditPort = auditPort, clock = clock)

        val result =
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OPERATOR),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )

        assertThat(result.replayedCount).isEqualTo(2)
        assertThat(clock.readCount).isEqualTo(1)
        assertThat(replayPort.consumedPreviews.single().at).isEqualTo(now)
        assertThat(replayPort.replayedTransitions.single().at).isEqualTo(now)
        assertThat(auditPort.events.single().createdAt).isEqualTo(now)
    }

    @Test
    fun `confirm treats expiry equality as terminal before mutation`() {
        val expiresAt = TIMESTAMP.plusMinutes(10)
        val replayPort = replayPortWithOpenPreview(expiresAt = expiresAt)
        val auditPort = RecordingAdminNotificationAuditPort()
        val service =
            serviceWith(
                replayPort = replayPort,
                auditPort = auditPort,
                clock = Clock.fixed(expiresAt.toInstant(), ZoneOffset.UTC),
            )

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) { error ->
            assertThat(error.error)
                .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED)
        }
        assertThat(replayPort.consumedPreviews).isEmpty()
        assertThat(replayPort.replayedTransitions).isEmpty()
        assertThat(auditPort.events).isEmpty()
    }

    @Test
    fun `confirm rejects a reason above the code point bound before persistence`() {
        assertReasonRejectedBeforePersistence("a".repeat(501))
    }

    @Test
    fun `confirm rejects a reason above the UTF-8 byte bound before persistence`() {
        assertReasonRejectedBeforePersistence("🙂".repeat(251))
    }

    @Test
    fun `confirm accepts exact reason code point and UTF-8 byte boundaries`() {
        listOf("a".repeat(500), "🙂".repeat(250)).forEach { reason ->
            val replayPort = replayPortWithOpenPreview()
            val service = serviceWith(replayPort = replayPort)

            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, reason),
            )

            assertThat(replayPort.consumedPreviews).hasSize(1)
            assertThat(replayPort.replayedTransitions).hasSize(1)
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
        val replayPort = replayPortWithOpenPreview(matchedCount = 3, replayedCount = 2, actorPlatformRole = "OPERATOR")
        val auditPort = RecordingAdminNotificationAuditPort()
        val service = serviceWith(replayPort = replayPort, auditPort = auditPort)

        val result =
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OPERATOR),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, "Retry failed deliveries"),
            )

        assertThat(result.replayedCount).isEqualTo(2)
        assertThat(result.skippedCount).isEqualTo(1)
        assertThat(replayPort.consumedPreviews.map { it.previewId }).containsExactly(PREVIEW_ID)
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
        replayProperties: AdminNotificationReplayProperties = AdminNotificationReplayProperties(),
        clock: Clock = Clock.fixed(TIMESTAMP.toInstant(), ZoneOffset.UTC),
    ): AdminNotificationOperationsService =
        AdminNotificationOperationsService(
            readPort,
            replayPort,
            auditPort,
            FixedAdminNotificationJson,
            replayProperties,
            clock,
        )

    private fun platformAdmin(
        role: PlatformAdminRole,
        userId: UUID = ADMIN_USER_ID,
    ): CurrentPlatformAdmin =
        CurrentPlatformAdmin(
            userId = userId,
            email = "admin@example.com",
            role = role,
        )

    private fun assertReasonRejectedBeforePersistence(reason: String) {
        val replayPort = replayPortWithOpenPreview()
        val auditPort = RecordingAdminNotificationAuditPort()
        val service = serviceWith(replayPort = replayPort, auditPort = auditPort)

        assertThatThrownBy {
            service.confirmReplay(
                platformAdmin(PlatformAdminRole.OWNER),
                AdminNotificationReplayConfirmCommand(PREVIEW_ID, SELECTION_HASH, reason),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) { error ->
            assertThat(error.error)
                .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_TOO_LONG)
        }
        assertThat(replayPort.loadCalls).isZero()
        assertThat(replayPort.consumedPreviews).isEmpty()
        assertThat(replayPort.replayedTransitions).isEmpty()
        assertThat(auditPort.events).isEmpty()
    }

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
    expiresAt: OffsetDateTime = TIMESTAMP.plusMinutes(10),
    matchedCount: Int = 3,
    replayedCount: Int = 3,
    actorPlatformRole: String = "OWNER",
): RecordingAdminNotificationReplayPort =
    RecordingAdminNotificationReplayPort(
        previewRecord =
            AdminNotificationReplayPreviewRecord(
                previewId = PREVIEW_ID,
                contractVersion = 2,
                actorUserId = ADMIN_USER_ID,
                actorPlatformRole = actorPlatformRole,
                clubId = null,
                filterJson = "{}",
                selectionHash = SELECTION_HASH,
                matchedCount = matchedCount,
                expiresAt = expiresAt,
                consumedAt = null,
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
    private val matchedCount: Int = 3,
) : AdminNotificationReplayPort {
    var estimateCalls = 0
    var loadCalls = 0
    val createdPreviews = mutableListOf<CreatedPreview>()
    val consumedPreviews = mutableListOf<TimestampedPreview>()
    val replayedTransitions = mutableListOf<TimestampedReplay>()

    override fun loadSnapshot(
        filter: AdminNotificationFilter,
        targetLimit: Int,
    ): AdminNotificationReplaySnapshot {
        estimateCalls += 1
        return AdminNotificationReplaySnapshot(
            targets =
                List(matchedCount.coerceAtMost(targetLimit)) { index ->
                    AdminNotificationReplayTarget(
                        deliveryId = UUID(0, index.toLong() + 1),
                        clubId = CLUB_ID,
                        status = "FAILED",
                        attemptCount = 2,
                        failureCode = "MAIL_RETRYABLE",
                        updatedAt = TIMESTAMP,
                    )
                },
            excludedCount = 0,
            warnings = emptyList(),
        )
    }

    override fun createPreview(input: AdminNotificationReplayPreviewInsert): UUID {
        createdPreviews += CreatedPreview(input.createdAt, input.expiresAt)
        return PREVIEW_ID
    }

    override fun lockPreview(previewId: UUID): AdminNotificationReplayPreviewRecord? {
        loadCalls += 1
        return previewRecord?.takeIf { it.previewId == previewId }
    }

    override fun findConfirmation(previewId: UUID): AdminNotificationReplayConfirmation? = null

    override fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): Int {
        replayedTransitions += TimestampedReplay(AdminNotificationFilter(), replayedAt)
        return replayedCount
    }

    override fun createConfirmation(input: AdminNotificationReplayConfirmationInsert): UUID = CONFIRMATION_ID

    override fun consumePreview(
        previewId: UUID,
        confirmationId: UUID,
        consumedAt: OffsetDateTime,
    ): Boolean {
        consumedPreviews += TimestampedPreview(previewId, consumedAt)
        return true
    }
}

private data class CreatedPreview(
    val createdAt: OffsetDateTime,
    val expiresAt: OffsetDateTime,
)

private data class TimestampedPreview(
    val previewId: UUID,
    val at: OffsetDateTime,
)

private data class TimestampedReplay(
    val filter: AdminNotificationFilter,
    val at: OffsetDateTime,
)

private data class AuditEvent(
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val metadataJson: String,
    val createdAt: OffsetDateTime,
)

private class RecordingAdminNotificationAuditPort : AdminNotificationAuditPort {
    val events = mutableListOf<AuditEvent>()

    override fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
        createdAt: OffsetDateTime,
    ): UUID {
        events += AuditEvent(actorUserId, actorPlatformRole, metadataJson, createdAt)
        return AUDIT_ID
    }
}

private class AdminReplayCountingClock(
    private val fixedInstant: Instant,
    private val zone: ZoneId = ZoneOffset.UTC,
) : Clock() {
    var readCount: Int = 0

    override fun getZone(): ZoneId = zone

    override fun withZone(zone: ZoneId): Clock = AdminReplayCountingClock(fixedInstant, zone)

    override fun instant(): Instant {
        readCount += 1
        return fixedInstant
    }
}

private object FixedAdminNotificationJson : AdminNotificationJsonCodec {
    override fun filterJson(filter: AdminNotificationFilter): String = "{}"

    override fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
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
private val OTHER_ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000102")
private val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000901")
private val CONFIRMATION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000902")
private val AUDIT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000903")
private const val SELECTION_HASH: String = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
private val TIMESTAMP: OffsetDateTime = OffsetDateTime.of(2026, 5, 27, 1, 2, 3, 0, ZoneOffset.UTC)
