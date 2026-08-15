package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplaySnapshot
import com.readmates.notification.application.model.AdminNotificationReplayTarget
import com.readmates.notification.application.model.adminNotificationReplaySelectionHash
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.CsvSource
import org.junit.jupiter.params.provider.EnumSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
internal class JdbcAdminNotificationReplayAdapterTest(
    @param:Autowired private val adapter: JdbcAdminNotificationReplayAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdPreviewIds = linkedSetOf<UUID>()

    @AfterEach
    fun cleanup() {
        createdPreviewIds.forEach { previewId ->
            jdbcTemplate.update(
                """
                update admin_notification_replay_previews
                set consumed_at = null, consumed_confirmation_id = null
                where id = ?
                """.trimIndent(),
                previewId.toString(),
            )
            jdbcTemplate.update(
                "delete from admin_notification_replay_confirmations where preview_id = ?",
                previewId.toString(),
            )
            jdbcTemplate.update("delete from admin_notification_replay_previews where id = ?", previewId.toString())
        }
        createdPreviewIds.clear()
        jdbcTemplate.update("delete from platform_audit_events where id = ?", AUDIT_ID.toString())
        jdbcTemplate.update("delete from notification_deliveries where event_id = ?", EVENT_ID.toString())
        jdbcTemplate.update("delete from notification_event_outbox where id = ?", EVENT_ID.toString())
    }

    @Test
    fun `snapshot selects only exact bounded targets and reports fixed exclusion warnings`() {
        seedEvent()
        insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
        insertDelivery(AMBIGUOUS_ID, "FAILED", "MAIL_AMBIGUOUS")
        insertDelivery(EXPIRED_ID, "DEAD", "DELIVERY_EXPIRED")
        insertDelivery(INVALID_ID, "FAILED", "DELIVERY_CONTENT_INVALID")
        insertDelivery(NULL_ERROR_ID, "FAILED", null)
        insertDelivery(NONCANONICAL_ID, "FAILED", "mail_retryable")
        insertDelivery(UNKNOWN_ID, "DEAD", "MAIL_UNKNOWN")

        val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 2)

        assertThat(snapshot.targets.map { it.deliveryId }).containsExactly(TARGET_ID)
        assertThat(snapshot.excludedCount).isEqualTo(6)
        assertThat(snapshot.warnings).containsExactlyInAnyOrder(
            "MAIL_AMBIGUOUS",
            "DELIVERY_EXPIRED",
            "DELIVERY_CONTENT_INVALID",
            "FAILURE_CODE_MISSING",
            "FAILURE_CODE_NONCANONICAL",
            "FAILURE_CODE_UNKNOWN",
        )
    }

    @Test
    fun `snapshot query returns at most the requested max plus one target`() {
        seedEvent()
        insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
        insertDelivery(SECOND_TARGET_ID, "DEAD", "MAIL_PERMANENT")
        insertDelivery(THIRD_TARGET_ID, "FAILED", "MAIL_RETRYABLE")

        val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 2)

        assertThat(snapshot.targets).hasSize(2)
    }

    @Test
    fun `legacy channel status and failure code bytes are excluded and never reset`() {
        seedEvent()
        withNonEnforcedReplayValueChecks {
            insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
            insertDelivery(LOWER_CHANNEL_ID, "FAILED", "MAIL_RETRYABLE", channel = "email")
            insertDelivery(PADDED_CHANNEL_ID, "FAILED", "MAIL_RETRYABLE", channel = "EMAIL ")
            insertDelivery(LOWER_STATUS_ID, "failed", "MAIL_RETRYABLE")
            insertDelivery(PADDED_STATUS_ID, "FAILED ", "MAIL_RETRYABLE")
            insertDelivery(UNKNOWN_STATUS_ID, "UNKNOWN", "MAIL_RETRYABLE")
            insertDelivery(LOWER_FAILURE_ID, "FAILED", "mail_retryable")
            insertDelivery(PADDED_FAILURE_ID, "FAILED", "MAIL_RETRYABLE ")

            val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 9)
            val at = OffsetDateTime.parse("2026-05-27T01:03:03.123456Z")
            val selectionHash =
                adminNotificationReplaySelectionHash(AdminNotificationFilter(clubId = CLUB_ID), snapshot.targets)
            val previewId = adapter.createPreview(previewInsert(snapshot.targets, selectionHash, at))
            createdPreviewIds += previewId

            assertThat(snapshot.targets.map { it.deliveryId }).containsExactly(TARGET_ID)
            assertThat(snapshot.excludedCount).isEqualTo(7)
            assertThat(snapshot.warnings).containsExactlyInAnyOrder(
                "CHANNEL_NONCANONICAL",
                "STATUS_NONCANONICAL",
                "FAILURE_CODE_NONCANONICAL",
            )
            assertThat(adapter.replayPreviewTargets(previewId, at)).isEqualTo(1)
            assertThat(deliveryState(TARGET_ID).first()).isEqualTo("PENDING")
            assertThat(deliveryState(LOWER_CHANNEL_ID).first()).isEqualTo("FAILED")
            assertThat(deliveryState(PADDED_CHANNEL_ID).first()).isEqualTo("FAILED")
            assertThat(deliveryState(LOWER_STATUS_ID).first()).isEqualTo("failed")
            assertThat(deliveryState(PADDED_STATUS_ID).first()).isEqualTo("FAILED ")
            assertThat(deliveryState(UNKNOWN_STATUS_ID).first()).isEqualTo("UNKNOWN")
            assertThat(deliveryState(LOWER_FAILURE_ID)[2]).isEqualTo("mail_retryable")
            assertThat(deliveryState(PADDED_FAILURE_ID)[2]).isEqualTo("MAIL_RETRYABLE ")
        }
    }

    @ParameterizedTest
    @CsvSource(
        "FAILED,failed,Failed,DEAD",
        "DEAD,dead,Dead,FAILED",
    )
    fun `requested email status counts only its semantic channel and status lookalikes`(
        requestedStatus: NotificationDeliveryStatus,
        lowerStatus: String,
        mixedStatus: String,
        oppositeStatus: String,
    ) {
        seedEvent()
        withNonEnforcedReplayValueChecks {
            insertDelivery(TARGET_ID, requestedStatus.name, "MAIL_RETRYABLE")
            insertDelivery(SECOND_TARGET_ID, oppositeStatus, "MAIL_RETRYABLE")
            insertDelivery(LOWER_CHANNEL_ID, requestedStatus.name, "MAIL_RETRYABLE", channel = "email")
            insertDelivery(MIXED_CHANNEL_ID, requestedStatus.name, "MAIL_RETRYABLE", channel = "Email")
            insertDelivery(PADDED_CHANNEL_ID, requestedStatus.name, "MAIL_RETRYABLE", channel = "EMAIL ")
            insertDelivery(LOWER_STATUS_ID, lowerStatus, "MAIL_RETRYABLE")
            insertDelivery(MIXED_STATUS_ID, mixedStatus, "MAIL_RETRYABLE")
            insertDelivery(PADDED_STATUS_ID, "${requestedStatus.name} ", "MAIL_RETRYABLE")

            val snapshot =
                adapter.loadSnapshot(
                    AdminNotificationFilter(
                        clubId = CLUB_ID,
                        channel = NotificationChannel.EMAIL,
                        deliveryStatus = requestedStatus,
                    ),
                    8,
                )

            assertThat(snapshot.targets.map { it.deliveryId }).containsExactly(TARGET_ID)
            assertThat(snapshot.excludedCount).isEqualTo(6)
            assertThat(snapshot.warnings).containsExactly(
                "CHANNEL_NONCANONICAL",
                "STATUS_NONCANONICAL",
            )
        }
    }

    @Test
    fun `ineligible requested filters stay empty without broadening exclusions`() {
        seedEvent()
        insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")

        val inApp =
            adapter.loadSnapshot(
                AdminNotificationFilter(clubId = CLUB_ID, channel = NotificationChannel.IN_APP),
                2,
            )
        val pending =
            adapter.loadSnapshot(
                AdminNotificationFilter(clubId = CLUB_ID, deliveryStatus = NotificationDeliveryStatus.PENDING),
                2,
            )

        assertThat(inApp).isEqualTo(AdminNotificationReplaySnapshot(emptyList(), 0, emptyList()))
        assertThat(pending).isEqualTo(AdminNotificationReplaySnapshot(emptyList(), 0, emptyList()))
    }

    @ParameterizedTest
    @EnumSource(ReplayCasMutation::class)
    fun `confirmation CAS skips each independently changed target tuple element`(mutation: ReplayCasMutation) {
        seedEvent()
        insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
        val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 2)
        val at = OffsetDateTime.parse("2026-05-27T01:03:03.123456Z")
        val selectionHash =
            adminNotificationReplaySelectionHash(AdminNotificationFilter(clubId = CLUB_ID), snapshot.targets)
        val previewId = adapter.createPreview(previewInsert(snapshot.targets, selectionHash, at))
        createdPreviewIds += previewId

        val currentDeliveryId = applyCasMutation(mutation, at)

        assertThat(adapter.replayPreviewTargets(previewId, at.plusMinutes(1))).isZero()
        assertThat(deliveryState(currentDeliveryId).first()).isNotEqualTo("PENDING")
    }

    @ParameterizedTest
    @EnumSource(ReplayByteExactCasMutation::class)
    fun `CAS rejects byte lookalikes changed after snapshot`(mutation: ReplayByteExactCasMutation) {
        seedEvent()
        withNonEnforcedReplayValueChecks {
            insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
            val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 2)
            val at = OffsetDateTime.parse("2026-05-27T01:03:03.123456Z")
            val selectionHash =
                adminNotificationReplaySelectionHash(AdminNotificationFilter(clubId = CLUB_ID), snapshot.targets)
            val previewId = adapter.createPreview(previewInsert(snapshot.targets, selectionHash, at))
            createdPreviewIds += previewId
            updateDelivery(
                "${mutation.column} = ?, updated_at = ?",
                mutation.lookalike,
                snapshot.targets
                    .single()
                    .updatedAt
                    .toLocalDateTime(),
            )

            assertThat(adapter.replayPreviewTargets(previewId, at.plusMinutes(1))).isZero()
            assertThat(deliveryState(TARGET_ID).first()).isNotEqualTo("PENDING")
        }
    }

    @Test
    fun `v2 preview stores exact targets and confirmation CAS skips changed rows and active leases`() {
        seedEvent()
        insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
        insertDelivery(SECOND_TARGET_ID, "DEAD", "MAIL_PERMANENT")
        insertDelivery(THIRD_TARGET_ID, "FAILED", "MAIL_RETRYABLE")
        val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 4)
        val createdAt = OffsetDateTime.parse("2026-05-27T01:02:03.123456Z")
        val selectionHash =
            adminNotificationReplaySelectionHash(
                AdminNotificationFilter(clubId = CLUB_ID),
                snapshot.targets,
            )

        val previewId =
            adapter.createPreview(
                previewInsert(snapshot.targets, selectionHash, createdAt),
            )
        createdPreviewIds += previewId
        jdbcTemplate.update(
            "update notification_deliveries set attempt_count = attempt_count + 1 where id = ?",
            SECOND_TARGET_ID.toString(),
        )
        jdbcTemplate.update(
            "update notification_deliveries set locked_at = ? where id = ?",
            createdAt.plusSeconds(1).toLocalDateTime(),
            THIRD_TARGET_ID.toString(),
        )
        insertDelivery(NEW_FAILURE_ID, "FAILED", "MAIL_RETRYABLE")

        val replayed = adapter.replayPreviewTargets(previewId, createdAt.plusMinutes(1))

        assertThat(replayed).isEqualTo(1)
        assertThat(deliveryState(TARGET_ID)).containsExactly(
            "PENDING",
            "0",
            null,
            createdAt.plusMinutes(1).toLocalDateTime().toString(),
        )
        assertThat(deliveryState(SECOND_TARGET_ID).first()).isEqualTo("DEAD")
        assertThat(deliveryState(THIRD_TARGET_ID).first()).isEqualTo("FAILED")
        assertThat(deliveryState(NEW_FAILURE_ID).first()).isEqualTo("FAILED")
        val locked = adapter.lockPreview(previewId)
        assertThat(locked?.contractVersion).isEqualTo(2)
        assertThat(locked?.actorPlatformRole).isEqualTo("OWNER")
        assertThat(locked?.clubId).isEqualTo(CLUB_ID)
    }

    @Test
    fun `receipt and paired consumption preserve one immutable confirmation result`() {
        seedEvent()
        insertDelivery(TARGET_ID, "FAILED", "MAIL_RETRYABLE")
        val snapshot = adapter.loadSnapshot(AdminNotificationFilter(clubId = CLUB_ID), 2)
        val at = OffsetDateTime.parse("2026-05-27T01:02:03.123456Z")
        val selectionHash =
            adminNotificationReplaySelectionHash(
                AdminNotificationFilter(clubId = CLUB_ID),
                snapshot.targets,
            )
        val previewId = adapter.createPreview(previewInsert(snapshot.targets, selectionHash, at))
        createdPreviewIds += previewId
        insertAudit(at)

        val confirmationId =
            adapter.createConfirmation(
                AdminNotificationReplayConfirmationInsert(
                    previewId,
                    ADMIN_USER_ID,
                    "OWNER",
                    CLUB_ID,
                    selectionHash,
                    1,
                    0,
                    AUDIT_ID,
                    at,
                ),
            )

        assertThat(adapter.consumePreview(previewId, confirmationId, at)).isTrue()
        assertThat(adapter.findConfirmation(previewId)?.confirmationId).isEqualTo(confirmationId)
        assertThat(adapter.findConfirmation(previewId)?.replayedCount).isEqualTo(1)
        assertThat(adapter.lockPreview(previewId)?.consumedAt).isEqualTo(at)
    }

    private fun previewInsert(
        targets: List<AdminNotificationReplayTarget>,
        selectionHash: String,
        createdAt: OffsetDateTime,
    ) = AdminNotificationReplayPreviewInsert(
        contractVersion = 2,
        actorUserId = ADMIN_USER_ID,
        actorPlatformRole = "OWNER",
        clubId = CLUB_ID,
        filterJson = "{\"clubId\":\"$CLUB_ID\"}",
        selectionHash = selectionHash,
        targets = targets,
        createdAt = createdAt,
        expiresAt = createdAt.plusMinutes(10),
    )

    private fun seedEvent() {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, dedupe_key, created_at, updated_at
            ) values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?),
              'FAILED', ?, 1, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            EVENT_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            SESSION_ID.toString(),
            CLUB_ID.toString(),
            "task3-event-$EVENT_ID",
        )
    }

    private fun insertDelivery(
        id: UUID,
        status: String,
        error: String?,
        channel: String = "EMAIL",
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, 2, ?, '2026-05-27 01:02:03.123456', '2026-05-27 01:02:03.123456')
            """.trimIndent(),
            id.toString(),
            EVENT_ID.toString(),
            CLUB_ID.toString(),
            MEMBER_ID.toString(),
            channel,
            status,
            "task3-delivery-$id",
            error,
        )
    }

    private fun <T> withNonEnforcedReplayValueChecks(block: () -> T): T {
        jdbcTemplate.execute(
            "alter table notification_deliveries alter check notification_deliveries_channel_check not enforced",
        )
        jdbcTemplate.execute(
            "alter table notification_deliveries alter check notification_deliveries_status_check not enforced",
        )
        return try {
            block()
        } finally {
            jdbcTemplate.update("delete from notification_deliveries where event_id = ?", EVENT_ID.toString())
            jdbcTemplate.execute(
                "alter table notification_deliveries alter check notification_deliveries_channel_check enforced",
            )
            jdbcTemplate.execute(
                "alter table notification_deliveries alter check notification_deliveries_status_check enforced",
            )
        }
    }

    private fun insertAudit(at: OffsetDateTime) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, event_type, metadata_json, created_at)
            values (?, ?, 'OWNER', 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED', json_object(), ?)
            """.trimIndent(),
            AUDIT_ID.toString(),
            ADMIN_USER_ID.toString(),
            at.toLocalDateTime(),
        )
    }

    private fun applyCasMutation(
        mutation: ReplayCasMutation,
        at: OffsetDateTime,
    ): UUID =
        when (mutation) {
            ReplayCasMutation.CHANNEL -> updateDelivery("channel = 'IN_APP'")
            ReplayCasMutation.STATUS -> updateDelivery("status = 'DEAD'")
            ReplayCasMutation.FAILURE_CODE -> updateDelivery("last_error = 'MAIL_PERMANENT'")
            ReplayCasMutation.ATTEMPT_COUNT -> updateDelivery("attempt_count = attempt_count + 1")
            ReplayCasMutation.UPDATED_AT ->
                updateDelivery(
                    "updated_at = ?",
                    at.plusNanos(1_000).toLocalDateTime(),
                )
            ReplayCasMutation.LOCKED_AT ->
                updateDelivery(
                    "locked_at = ?",
                    at.toLocalDateTime(),
                )
            ReplayCasMutation.CLUB_ID -> {
                jdbcTemplate.update(
                    "update admin_notification_replay_preview_targets set club_id = ? where preview_id = ?",
                    SECOND_CLUB_ID.toString(),
                    createdPreviewIds.single().toString(),
                )
                TARGET_ID
            }
            ReplayCasMutation.DELIVERY_ID -> {
                updateDelivery("id = ?", MUTATED_DELIVERY_ID.toString())
                MUTATED_DELIVERY_ID
            }
        }

    private fun updateDelivery(
        assignment: String,
        vararg args: Any,
    ): UUID {
        jdbcTemplate.update(
            "update notification_deliveries set $assignment where id = ?",
            *args,
            TARGET_ID.toString(),
        )
        return TARGET_ID
    }

    private fun deliveryState(id: UUID): List<String?> =
        jdbcTemplate.queryForObject(
            "select status, attempt_count, last_error, updated_at from notification_deliveries where id = ?",
            { rs, _ -> listOf(rs.getString(1), rs.getString(2), rs.getString(3), rs.getObject(4).toString()) },
            id.toString(),
        )
}

internal enum class ReplayCasMutation {
    CHANNEL,
    STATUS,
    FAILURE_CODE,
    ATTEMPT_COUNT,
    UPDATED_AT,
    LOCKED_AT,
    CLUB_ID,
    DELIVERY_ID,
}

internal enum class ReplayByteExactCasMutation(
    val column: String,
    val lookalike: String,
) {
    CHANNEL_LOWER("channel", "email"),
    CHANNEL_MIXED("channel", "Email"),
    CHANNEL_PADDED("channel", "EMAIL "),
    STATUS_LOWER("status", "failed"),
    STATUS_MIXED("status", "Failed"),
    STATUS_PADDED("status", "FAILED "),
    FAILURE_CODE_LOWER("last_error", "mail_retryable"),
    FAILURE_CODE_MIXED("last_error", "Mail_Retryable"),
    FAILURE_CODE_PADDED("last_error", "MAIL_RETRYABLE "),
}

private val AUDIT_ID = UUID.fromString("00000000-0000-0000-0000-000000009003")
private val EVENT_ID = UUID.fromString("00000000-0000-0000-0000-000000009010")
private val TARGET_ID = UUID.fromString("00000000-0000-0000-0000-000000009011")
private val SECOND_TARGET_ID = UUID.fromString("00000000-0000-0000-0000-000000009012")
private val THIRD_TARGET_ID = UUID.fromString("00000000-0000-0000-0000-000000009013")
private val NEW_FAILURE_ID = UUID.fromString("00000000-0000-0000-0000-000000009020")
private val AMBIGUOUS_ID = UUID.fromString("00000000-0000-0000-0000-000000009014")
private val EXPIRED_ID = UUID.fromString("00000000-0000-0000-0000-000000009015")
private val INVALID_ID = UUID.fromString("00000000-0000-0000-0000-000000009016")
private val NULL_ERROR_ID = UUID.fromString("00000000-0000-0000-0000-000000009017")
private val NONCANONICAL_ID = UUID.fromString("00000000-0000-0000-0000-000000009018")
private val UNKNOWN_ID = UUID.fromString("00000000-0000-0000-0000-000000009019")
private val LOWER_CHANNEL_ID = UUID.fromString("00000000-0000-0000-0000-000000009021")
private val MIXED_CHANNEL_ID = UUID.fromString("00000000-0000-0000-0000-000000009028")
private val PADDED_CHANNEL_ID = UUID.fromString("00000000-0000-0000-0000-000000009022")
private val LOWER_STATUS_ID = UUID.fromString("00000000-0000-0000-0000-000000009023")
private val MIXED_STATUS_ID = UUID.fromString("00000000-0000-0000-0000-000000009029")
private val PADDED_STATUS_ID = UUID.fromString("00000000-0000-0000-0000-000000009024")
private val UNKNOWN_STATUS_ID = UUID.fromString("00000000-0000-0000-0000-000000009025")
private val LOWER_FAILURE_ID = UUID.fromString("00000000-0000-0000-0000-000000009026")
private val PADDED_FAILURE_ID = UUID.fromString("00000000-0000-0000-0000-000000009027")
private val MUTATED_DELIVERY_ID = UUID.fromString("00000000-0000-0000-0000-000000009030")
private val CLUB_ID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val SECOND_CLUB_ID = UUID.fromString("00000000-0000-0000-0000-000000000002")
private val SESSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val MEMBER_ID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val ADMIN_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000101")
