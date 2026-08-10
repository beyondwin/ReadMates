package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.config.AdminNotificationReplayProperties
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplaySnapshot
import com.readmates.notification.application.model.AdminNotificationReplayTarget
import com.readmates.notification.application.model.adminNotificationReplaySelectionHash
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
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

class AdminNotificationReplayServiceTest {
    @Test
    fun `preview persists exact v2 targets scope role and bounded warnings`() {
        val target = replayTarget()
        val replayPort =
            ReplayPortFake(
                snapshot =
                    AdminNotificationReplaySnapshot(
                        listOf(target),
                        2,
                        listOf("MAIL_AMBIGUOUS", "FAILURE_CODE_UNKNOWN"),
                    ),
            )
        val service = service(replayPort)

        val preview =
            service.previewReplay(
                admin(PlatformAdminRole.OPERATOR),
                com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest(
                    AdminNotificationFilter(clubId = CLUB_ID),
                ),
            )

        val inserted = replayPort.previewInserts.single()
        assertThat(replayPort.requestedLimit).isEqualTo(1_001)
        assertThat(inserted.contractVersion).isEqualTo(2)
        assertThat(inserted.actorPlatformRole).isEqualTo("OPERATOR")
        assertThat(inserted.clubId).isEqualTo(CLUB_ID)
        assertThat(inserted.targets).containsExactly(target)
        assertThat(inserted.selectionHash).isEqualTo(
            adminNotificationReplaySelectionHash(inserted.filter, listOf(target)),
        )
        assertThat(preview.excludedCount).isEqualTo(2)
        assertThat(preview.warnings).containsExactly("MAIL_AMBIGUOUS", "FAILURE_CODE_UNKNOWN")
    }

    @Test
    fun `preview fails before insert when bounded target query returns max plus one`() {
        val replayPort =
            ReplayPortFake(
                snapshot = AdminNotificationReplaySnapshot(List(3) { replayTarget(it) }, 0, emptyList()),
            )

        assertThatThrownBy {
            service(replayPort, AdminNotificationReplayProperties(maxTargets = 2)).previewReplay(
                admin(PlatformAdminRole.OWNER),
                com.readmates.notification.application.model
                    .AdminNotificationReplayPreviewRequest(AdminNotificationFilter()),
            )
        }.isInstanceOfSatisfying(NotificationApplicationException::class.java) {
            assertThat(it.error).isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_TOO_MANY_TARGETS)
        }
        assertThat(replayPort.previewInserts).isEmpty()
    }

    @Test
    fun `confirm locks before reading clock then atomically persists audit receipt and consumption`() {
        val clock = ReplayCountingClock(CONFIRMED_AT.toInstant())
        val replayPort = ReplayPortFake(preview = openV2Preview(), replayedCount = 1)
        replayPort.onLock = { assertThat(clock.readCount).isZero() }
        val auditPort = ReplayAuditFake()

        val result = service(replayPort, clock = clock, auditPort = auditPort).confirmReplay(admin(), confirmCommand())

        assertThat(clock.readCount).isEqualTo(1)
        assertThat(result.replayedCount).isEqualTo(1)
        assertThat(result.skippedCount).isEqualTo(1)
        assertThat(replayPort.calls).containsExactly("lock", "receipt", "replay", "confirmation", "consume")
        assertThat(replayPort.replayedAt).isEqualTo(CONFIRMED_AT)
        assertThat(auditPort.createdAt).isEqualTo(CONFIRMED_AT)
        assertThat(replayPort.confirmationInsert?.platformAuditEventId).isEqualTo(AUDIT_ID)
        assertThat(replayPort.confirmationInsert?.confirmedAt).isEqualTo(CONFIRMED_AT)
        assertThat(replayPort.consumedAt).isEqualTo(CONFIRMED_AT)
    }

    @Test
    fun `matching stored v2 receipt is returned after expiry without replay or another audit`() {
        val replayPort =
            ReplayPortFake(
                preview =
                    openV2Preview(
                        expiresAt = CONFIRMED_AT.minusMinutes(1),
                        consumedAt = CONFIRMED_AT.minusMinutes(2),
                    ),
                confirmation = confirmation(),
            )
        val auditPort = ReplayAuditFake()

        val result = service(replayPort, auditPort = auditPort).confirmReplay(admin(), confirmCommand())

        assertThat(result.replayedCount).isEqualTo(1)
        assertThat(result.skippedCount).isEqualTo(1)
        assertThat(replayPort.calls).containsExactly("lock", "receipt")
        assertThat(auditPort.calls).isZero()
    }

    @Test
    fun `legacy open and consumed previews require a new preview without receipt lookup or mutation`() {
        listOf(null, CONFIRMED_AT.minusMinutes(1)).forEach { consumedAt ->
            val replayPort = ReplayPortFake(preview = openV2Preview(contractVersion = 1, consumedAt = consumedAt))

            assertThatThrownBy { service(replayPort).confirmReplay(admin(), confirmCommand()) }
                .isInstanceOfSatisfying(NotificationApplicationException::class.java) {
                    assertThat(it.error).isEqualTo(
                        NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REPREVIEW_REQUIRED,
                    )
                }
            assertThat(replayPort.calls).containsExactly("lock")
        }
    }

    @Test
    fun `actor hash and role are validated before a stored receipt can be disclosed`() {
        val mismatches =
            listOf(
                admin(userId = OTHER_USER_ID) to confirmCommand(),
                admin() to confirmCommand(selectionHash = "b".repeat(64)),
                admin(PlatformAdminRole.OPERATOR) to confirmCommand(),
            )
        mismatches.forEach { (admin, command) ->
            val replayPort = ReplayPortFake(preview = openV2Preview(), confirmation = confirmation())
            assertThatThrownBy { service(replayPort).confirmReplay(admin, command) }
                .isInstanceOfAny(AccessDeniedException::class.java, NotificationApplicationException::class.java)
            assertThat(replayPort.calls).containsExactly("lock")
        }
    }

    private fun service(
        replayPort: ReplayPortFake,
        properties: AdminNotificationReplayProperties = AdminNotificationReplayProperties(),
        clock: Clock = Clock.fixed(CONFIRMED_AT.toInstant(), ZoneOffset.UTC),
        auditPort: AdminNotificationAuditPort = ReplayAuditFake(),
    ) = AdminNotificationOperationsService(
        readPort = ReplayEmptyReadPort,
        replayPort = replayPort,
        auditPort = auditPort,
        jsonCodec = ReplayJson,
        replayProperties = properties,
        clock = clock,
    )
}

private object ReplayEmptyReadPort : AdminNotificationOperationsReadPort {
    override fun snapshot(): AdminNotificationOperationsSnapshot = error("not used")

    override fun listEvents(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> = CursorPage(emptyList(), null)

    override fun listDeliveries(
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> = CursorPage(emptyList(), null)
}

private object ReplayJson : AdminNotificationJsonCodec {
    override fun filterJson(filter: AdminNotificationFilter): String = "{}"

    override fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String = "{\"previewId\":\"$previewId\"}"
}

private class ReplayPortFake(
    private val snapshot: AdminNotificationReplaySnapshot =
        AdminNotificationReplaySnapshot(listOf(replayTarget()), 0, emptyList()),
    private val preview: AdminNotificationReplayPreviewRecord? = null,
    private val confirmation: AdminNotificationReplayConfirmation? = null,
    private val replayedCount: Int = 0,
) : AdminNotificationReplayPort {
    var requestedLimit: Int? = null
    var onLock: () -> Unit = {}
    val previewInserts = mutableListOf<AdminNotificationReplayPreviewInsert>()
    val calls = mutableListOf<String>()
    var replayedAt: OffsetDateTime? = null
    var confirmationInsert: AdminNotificationReplayConfirmationInsert? = null
    var consumedAt: OffsetDateTime? = null

    override fun loadSnapshot(
        filter: AdminNotificationFilter,
        targetLimit: Int,
    ): AdminNotificationReplaySnapshot {
        requestedLimit = targetLimit
        return snapshot
    }

    override fun createPreview(input: AdminNotificationReplayPreviewInsert): UUID {
        previewInserts += input
        return PREVIEW_ID
    }

    override fun lockPreview(previewId: UUID): AdminNotificationReplayPreviewRecord? {
        calls += "lock"
        onLock()
        return preview
    }

    override fun findConfirmation(previewId: UUID): AdminNotificationReplayConfirmation? {
        calls += "receipt"
        return confirmation
    }

    override fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): Int {
        calls += "replay"
        this.replayedAt = replayedAt
        return replayedCount
    }

    override fun createConfirmation(input: AdminNotificationReplayConfirmationInsert): UUID {
        calls += "confirmation"
        confirmationInsert = input
        return CONFIRMATION_ID
    }

    override fun consumePreview(
        previewId: UUID,
        confirmationId: UUID,
        consumedAt: OffsetDateTime,
    ): Boolean {
        calls += "consume"
        this.consumedAt = consumedAt
        return true
    }
}

private class ReplayAuditFake : AdminNotificationAuditPort {
    var calls = 0
    var createdAt: OffsetDateTime? = null

    override fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
        createdAt: OffsetDateTime,
    ): UUID {
        calls += 1
        this.createdAt = createdAt
        return AUDIT_ID
    }
}

private fun openV2Preview(
    expiresAt: OffsetDateTime = CONFIRMED_AT.plusMinutes(10),
    contractVersion: Int = 2,
    consumedAt: OffsetDateTime? = null,
) = AdminNotificationReplayPreviewRecord(
    previewId = PREVIEW_ID,
    contractVersion = contractVersion,
    actorUserId = ADMIN_USER_ID,
    actorPlatformRole = "OWNER",
    clubId = CLUB_ID,
    filterJson = "{}",
    selectionHash = SELECTION_HASH,
    matchedCount = 2,
    expiresAt = expiresAt,
    consumedAt = consumedAt,
)

private fun confirmation() =
    AdminNotificationReplayConfirmation(
        confirmationId = CONFIRMATION_ID,
        previewId = PREVIEW_ID,
        actorUserId = ADMIN_USER_ID,
        actorPlatformRole = "OWNER",
        clubId = CLUB_ID,
        selectionHash = SELECTION_HASH,
        replayedCount = 1,
        skippedCount = 1,
        confirmedAt = CONFIRMED_AT.minusMinutes(2),
    )

private fun replayTarget(index: Int = 0) =
    AdminNotificationReplayTarget(
        deliveryId = UUID.fromString("00000000-0000-0000-0000-${(11 + index).toString().padStart(12, '0')}"),
        clubId = CLUB_ID,
        status = "FAILED",
        attemptCount = 2,
        failureCode = "MAIL_RETRYABLE",
        updatedAt = OffsetDateTime.parse("2026-05-27T01:02:03.123456Z"),
    )

private fun admin(
    role: PlatformAdminRole = PlatformAdminRole.OWNER,
    userId: UUID = ADMIN_USER_ID,
) = CurrentPlatformAdmin(userId, "admin@example.com", role)

private fun confirmCommand(selectionHash: String = SELECTION_HASH) =
    AdminNotificationReplayConfirmCommand(PREVIEW_ID, selectionHash, "Retry failed deliveries")

private class ReplayCountingClock(
    private val current: Instant,
) : Clock() {
    var readCount = 0

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant {
        readCount += 1
        return current
    }
}

private val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000031")
private val CONFIRMATION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000032")
private val AUDIT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000033")
private val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
private val OTHER_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000102")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val CONFIRMED_AT: OffsetDateTime = OffsetDateTime.parse("2026-05-27T01:02:03.123456Z")
private const val SELECTION_HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
