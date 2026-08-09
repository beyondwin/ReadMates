package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.paging.PageRequest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.Duration
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val CLEANUP_ADMIN_NOTIFICATION_OPERATIONS_SQL = """
    delete from platform_audit_events
    where event_type = 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED'
      and json_unquote(json_extract(metadata_json, '$.selectionHash')) = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    delete from admin_notification_replay_previews
    where selection_hash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where id = '00000000-0000-0000-0000-000000007801';
    delete from host_action_notification_decisions
    where id = '00000000-0000-0000-0000-000000007901';
    delete from host_action_notification_previews
    where id = '00000000-0000-0000-0000-000000007801';
    delete from notification_manual_dispatches
    where event_id in (
      '00000000-0000-0000-0000-000000007501',
      '00000000-0000-0000-0000-000000007502',
      '00000000-0000-0000-0000-000000007503',
      '00000000-0000-0000-0000-000000007504'
    );
    delete from notification_deliveries
    where event_id in (
      '00000000-0000-0000-0000-000000007501',
      '00000000-0000-0000-0000-000000007502',
      '00000000-0000-0000-0000-000000007503',
      '00000000-0000-0000-0000-000000007504'
    );
    delete from notification_event_outbox
    where id in (
      '00000000-0000-0000-0000-000000007501',
      '00000000-0000-0000-0000-000000007502',
      '00000000-0000-0000-0000-000000007503',
      '00000000-0000-0000-0000-000000007504'
    );
    delete from memberships where id = '00000000-0000-0000-0000-000000008002';
    delete from users where id = '00000000-0000-0000-0000-000000008001';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_ADMIN_NOTIFICATION_OPERATIONS_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_ADMIN_NOTIFICATION_OPERATIONS_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminNotificationOperationsAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val hostLedgerAdapter: JdbcNotificationEventOutboxAdapter,
    @param:Autowired private val runtimeProperties: NotificationRuntimeProperties,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminNotificationOperationsAdapter(jdbcTemplate, runtimeProperties) }

    @Test
    fun `snapshot and ledgers expose safe admin notification operations`() {
        seedOperationsRows()

        val snapshot = adapter.snapshot()
        val eventPage =
            adapter.listEvents(
                AdminNotificationFilter(),
                PageRequest.cursor(1, null, defaultLimit = 50, maxLimit = 100),
            )
        val deliveryPage =
            adapter.listDeliveries(
                AdminNotificationFilter(deliveryStatus = NotificationDeliveryStatus.DEAD),
                PageRequest.cursor(1, null, defaultLimit = 50, maxLimit = 100),
            )

        assertThat(snapshot.clubHealth.map { it.slug }).contains("reading-sai", "sample-book-club")
        assertThat(eventPage.items).hasSize(1)
        assertThat(eventPage.nextCursor).isNotBlank()
        assertThat(deliveryPage.items).hasSize(1)
        assertThat(deliveryPage.nextCursor).isNotBlank()
        assertThat(deliveryPage.items.single().maskedRecipient).contains("***@")
        assertThat(deliveryPage.items.single().maskedRecipient).doesNotContain("member1@example.com")
        assertThat(snapshot.failureClusters.map { it.safeErrorCode }).allSatisfy { safeCode ->
            assertThat(safeCode).doesNotContain("@")
            assertThat(safeCode.lowercase()).doesNotContain("token")
            assertThat(safeCode.lowercase()).doesNotContain("sql")
            assertThat(safeCode.lowercase()).doesNotContain("smtp")
        }
    }

    @Test
    fun `host and admin ledgers distinguish automatic manual and host confirmed sources`() {
        seedOperationsRows()
        seedHostConfirmedDecision()

        val adminEvents =
            adapter.listEvents(
                AdminNotificationFilter(clubId = BASELINE_CLUB_ID),
                PageRequest.cursor(20, null, defaultLimit = 50, maxLimit = 100),
            )
        val hostEvents =
            hostLedgerAdapter.listHostEvents(
                BASELINE_CLUB_ID,
                null,
                PageRequest.cursor(20, null, defaultLimit = 50, maxLimit = 100),
            )

        assertThat(adminEvents.items.associate { it.eventId to it.source })
            .containsEntry(FAILED_EVENT_ID, NotificationDispatchSource.AUTOMATIC)
            .containsEntry(MANUAL_EVENT_ID, NotificationDispatchSource.MANUAL)
            .containsEntry(HOST_CONFIRMED_EVENT_ID, NotificationDispatchSource.HOST_CONFIRMED)
        assertThat(hostEvents.items.associate { it.id to it.source })
            .containsEntry(FAILED_EVENT_ID, NotificationDispatchSource.AUTOMATIC)
            .containsEntry(MANUAL_EVENT_ID, NotificationDispatchSource.MANUAL)
            .containsEntry(HOST_CONFIRMED_EVENT_ID, NotificationDispatchSource.HOST_CONFIRMED)
        assertThat(hostEvents.items.single { it.id == MANUAL_EVENT_ID }.manualDispatch).isNotNull()
    }

    @Test
    fun `relay summary uses one typed non-default lease for publishing and sending staleness`() {
        seedOperationsRows()
        val lease = Duration.ofMinutes(7).plusSeconds(30).plusMillis(500)
        val leaseMicros = 450_500_000L
        val leaseAdapter =
            JdbcAdminNotificationOperationsAdapter(
                jdbcTemplate = jdbcTemplate,
                runtimeProperties = notificationRuntimeProperties(lease),
            )
        setOutboxLease(FAILED_EVENT_ID, -leaseMicros)
        setOutboxLease(SECOND_CLUB_EVENT_ID, -(leaseMicros - 5_000_000L))
        setDeliveryLease(DEAD_DELIVERY_ID, -leaseMicros)
        setDeliveryLease(SECOND_DELIVERY_ID, -(leaseMicros - 5_000_000L))

        val relaySummary = leaseAdapter.snapshot().relaySummary

        assertThat(relaySummary.publishing).isEqualTo(2)
        assertThat(relaySummary.stalePublishing).isEqualTo(1)
        assertThat(relaySummary.sending).isEqualTo(2)
        assertThat(relaySummary.staleSending).isEqualTo(1)
    }

    @Test
    fun `replay estimate keeps every requested delivery filter conjunctive and fail closed`() {
        seedOperationsRows()
        seedReplayFilterRows()

        val inApp = replayCount(AdminNotificationFilter(channel = NotificationChannel.IN_APP))
        val pending = replayCount(AdminNotificationFilter(deliveryStatus = NotificationDeliveryStatus.PENDING))
        val sent = replayCount(AdminNotificationFilter(deliveryStatus = NotificationDeliveryStatus.SENT))
        val baselineFailed =
            replayCount(
                AdminNotificationFilter(
                    clubId = BASELINE_CLUB_ID,
                    channel = NotificationChannel.EMAIL,
                    deliveryStatus = NotificationDeliveryStatus.FAILED,
                ),
            )
        val baselineDead =
            replayCount(
                AdminNotificationFilter(
                    clubId = BASELINE_CLUB_ID,
                    channel = NotificationChannel.EMAIL,
                    deliveryStatus = NotificationDeliveryStatus.DEAD,
                ),
            )
        val secondClubFailed =
            replayCount(
                AdminNotificationFilter(
                    clubId = SECOND_CLUB_ID,
                    channel = NotificationChannel.EMAIL,
                    deliveryStatus = NotificationDeliveryStatus.FAILED,
                ),
            )

        assertThat(inApp).isZero()
        assertThat(pending).isZero()
        assertThat(sent).isZero()
        assertThat(baselineFailed).isEqualTo(1)
        assertThat(baselineDead).isEqualTo(1)
        assertThat(secondClubFailed).isEqualTo(1)
    }

    @Test
    fun `replay estimate requires byte exact channel status and failure code independently`() {
        seedOperationsRows()
        seedReplayFilterRows()

        val baselineClub =
            withNonEnforcedReplayValueChecks {
                paddedReplayFilterRows().forEach(::insertDelivery)
                replayCount(AdminNotificationFilter(clubId = BASELINE_CLUB_ID))
            }

        assertThat(baselineClub).isEqualTo(2)
    }

    @Test
    fun `replay persistence uses only explicit microsecond application timestamps`() {
        seedOperationsRows()
        seedReplayFilterRows()
        val createdAt = OffsetDateTime.parse("2026-05-27T01:02:03.123456Z")
        val expiresAt = OffsetDateTime.parse("2026-05-27T01:12:03.123456Z")
        val replayedAt = OffsetDateTime.parse("2026-05-27T01:03:04.654321Z")

        val previewId =
            adapter.createPreview(
                actorUserId = ADMIN_USER_ID,
                filterJson = "{}",
                selectionHash = REPLAY_SELECTION_HASH,
                matchedCount = 1,
                createdAt = createdAt,
                expiresAt = expiresAt,
            )
        adapter.markPreviewConsumed(previewId, replayedAt)
        val replayed =
            adapter.replayDeadOrFailedDeliveries(
                AdminNotificationFilter(
                    clubId = BASELINE_CLUB_ID,
                    deliveryStatus = NotificationDeliveryStatus.FAILED,
                ),
                replayedAt,
            )
        adapter.writeReplayConfirmed(
            actorUserId = ADMIN_USER_ID,
            actorPlatformRole = "OWNER",
            metadataJson = "{\"selectionHash\":\"$REPLAY_SELECTION_HASH\"}",
            createdAt = replayedAt,
        )

        val previewTimes =
            jdbcTemplate.queryForMap(
                "select created_at, expires_at, consumed_at from admin_notification_replay_previews where id = ?",
                previewId.toString(),
            )
        assertThat(previewTimes.getValue("created_at")).isEqualTo(createdAt.toLocalDateTime())
        assertThat(previewTimes.getValue("expires_at")).isEqualTo(expiresAt.toLocalDateTime())
        assertThat(previewTimes.getValue("consumed_at")).isEqualTo(replayedAt.toLocalDateTime())
        assertThat(replayed).isEqualTo(1)
        assertThat(deliveryTimestamp(REPLAY_FAILED_DELIVERY_ID, "next_attempt_at")).isEqualTo(replayedAt)
        assertThat(deliveryTimestamp(REPLAY_FAILED_DELIVERY_ID, "updated_at")).isEqualTo(replayedAt)
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select created_at
                from platform_audit_events
                where event_type = 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED'
                  and json_unquote(json_extract(metadata_json, '$.selectionHash')) = ?
                """.trimIndent(),
                LocalDateTime::class.java,
                REPLAY_SELECTION_HASH,
            ),
        ).isEqualTo(replayedAt.toLocalDateTime())
    }

    private fun setOutboxLease(
        eventId: UUID,
        offsetMicros: Long,
    ) {
        jdbcTemplate.update(
            """
            update notification_event_outbox
            set status = 'PUBLISHING',
                locked_at = timestampadd(MICROSECOND, ?, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            offsetMicros,
            eventId.toString(),
        )
    }

    private fun setDeliveryLease(
        deliveryId: UUID,
        offsetMicros: Long,
    ) {
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = timestampadd(MICROSECOND, ?, utc_timestamp(6))
            where id = ?
            """.trimIndent(),
            offsetMicros,
            deliveryId.toString(),
        )
    }

    private fun seedOperationsRows() {
        seedSecondClubMember()
        seedOutboxRows()
        seedDeliveryRows()
        seedManualDispatch()
    }

    private fun seedSecondClubMember() {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, 'admin-notification-second-club-user', 'second-club-member@example.com', 'Second Club Member', 'Second', 'GOOGLE')
            on duplicate key update email = values(email), name = values(name), short_name = values(short_name)
            """.trimIndent(),
            SECOND_USER_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'Second', 'globe-notebook')
            on duplicate key update status = values(status), short_name = values(short_name)
            """.trimIndent(),
            SECOND_MEMBERSHIP_ID.toString(),
            SECOND_CLUB_ID.toString(),
            SECOND_USER_ID.toString(),
        )
    }

    private fun seedOutboxRows() {
        insertEvent(
            FAILED_EVENT_ID,
            BASELINE_CLUB_ID,
            "FAILED",
            "SMTP 550 token=abc member1@example.com SQLSTATE 42S02",
        )
        insertEvent(MANUAL_EVENT_ID, BASELINE_CLUB_ID, "PUBLISHED", null)
        insertEvent(HOST_CONFIRMED_EVENT_ID, BASELINE_CLUB_ID, "PUBLISHED", null)
        insertEvent(SECOND_CLUB_EVENT_ID, SECOND_CLUB_ID, "FAILED", "mailbox unavailable")
    }

    private fun seedDeliveryRows() {
        insertDelivery(
            DeliverySeed(
                id = DEAD_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "DEAD",
                lastError = "SMTP 550 member1@example.com",
            ),
        )
        insertDelivery(
            DeliverySeed(
                id = SECOND_DELIVERY_ID,
                eventId = SECOND_CLUB_EVENT_ID,
                clubId = SECOND_CLUB_ID,
                membershipId = SECOND_MEMBERSHIP_ID,
                status = "DEAD",
                lastError = "provider timeout",
            ),
        )
    }

    private fun seedReplayFilterRows() {
        (eligibleReplayFilterRows() + ineligibleReplayFilterRows()).forEach(::insertDelivery)
    }

    private fun eligibleReplayFilterRows(): List<DeliverySeed> =
        listOf(
            DeliverySeed(
                id = REPLAY_FAILED_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = "MAIL_RETRYABLE",
            ),
            DeliverySeed(
                id = REPLAY_DEAD_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "DEAD",
                lastError = "MAIL_PERMANENT",
            ),
            DeliverySeed(
                id = REPLAY_SECOND_CLUB_DELIVERY_ID,
                eventId = SECOND_CLUB_EVENT_ID,
                clubId = SECOND_CLUB_ID,
                membershipId = SECOND_MEMBERSHIP_ID,
                status = "FAILED",
                lastError = "MAIL_RETRYABLE",
            ),
        )

    private fun ineligibleReplayFilterRows(): List<DeliverySeed> =
        ineligibleStatusRows() +
            nonExactChannelRows() +
            nonExactStatusRows() +
            nonExactFailureCodeRows()

    private fun ineligibleStatusRows(): List<DeliverySeed> =
        listOf(
            DeliverySeed(
                id = REPLAY_PENDING_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "PENDING",
                lastError = "MAIL_RETRYABLE",
            ),
            DeliverySeed(
                id = REPLAY_SENT_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "SENT",
                lastError = "MAIL_RETRYABLE",
            ),
            DeliverySeed(
                id = REPLAY_IN_APP_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                channel = "IN_APP",
                status = "FAILED",
                lastError = "MAIL_RETRYABLE",
            ),
        )

    private fun nonExactChannelRows(): List<DeliverySeed> =
        listOf(
            DeliverySeed(
                id = REPLAY_LOWERCASE_CHANNEL_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                channel = "email",
                status = "FAILED",
                lastError = "MAIL_RETRYABLE",
            ),
            DeliverySeed(
                id = REPLAY_MIXED_CHANNEL_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                channel = "Email",
                status = "FAILED",
                lastError = "MAIL_RETRYABLE",
            ),
        )

    private fun nonExactStatusRows(): List<DeliverySeed> =
        listOf(
            DeliverySeed(
                id = REPLAY_LOWERCASE_STATUS_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "failed",
                lastError = "MAIL_RETRYABLE",
            ),
            DeliverySeed(
                id = REPLAY_MIXED_STATUS_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "Failed",
                lastError = "MAIL_RETRYABLE",
            ),
        )

    private fun paddedReplayFilterRows(): List<DeliverySeed> =
        listOf(
            DeliverySeed(
                id = REPLAY_PADDED_CHANNEL_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                channel = "EMAIL ",
                status = "FAILED",
                lastError = "MAIL_RETRYABLE",
            ),
            DeliverySeed(
                id = REPLAY_PADDED_STATUS_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED ",
                lastError = "MAIL_RETRYABLE",
            ),
        )

    private fun nonExactFailureCodeRows(): List<DeliverySeed> =
        listOf(
            DeliverySeed(
                id = REPLAY_LOWERCASE_FAILURE_CODE_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = "mail_retryable",
            ),
            DeliverySeed(
                id = REPLAY_MIXED_FAILURE_CODE_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = "Mail_Retryable",
            ),
            DeliverySeed(
                id = REPLAY_PADDED_FAILURE_CODE_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = "MAIL_RETRYABLE ",
            ),
            DeliverySeed(
                id = REPLAY_NULL_FAILURE_CODE_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = null,
            ),
            DeliverySeed(
                id = REPLAY_BLANK_FAILURE_CODE_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = "",
            ),
            DeliverySeed(
                id = REPLAY_UNKNOWN_FAILURE_CODE_DELIVERY_ID,
                eventId = FAILED_EVENT_ID,
                clubId = BASELINE_CLUB_ID,
                membershipId = BASELINE_MEMBER_ID,
                status = "FAILED",
                lastError = "MAIL_UNKNOWN",
            ),
        )

    private fun seedManualDispatch() {
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, session_id, event_type, requested_by_membership_id,
              requested_channels, audience, target_count, expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, 'SESSION_REMINDER_DUE', ?, 'BOTH', 'ALL_ACTIVE_MEMBERS', 2, 2, 1, false, 'NOW')
            """.trimIndent(),
            MANUAL_DISPATCH_ID.toString(),
            BASELINE_CLUB_ID.toString(),
            MANUAL_EVENT_ID.toString(),
            BASELINE_SESSION_ID.toString(),
            BASELINE_HOST_MEMBERSHIP_ID.toString(),
        )
    }

    private fun seedHostConfirmedDecision() {
        jdbcTemplate.update(
            """
            insert into host_action_notification_previews (
              id, club_id, session_id, host_membership_id, action_type, event_type, request_hash,
              expected_draft_revision, expected_live_revision, target_count, expected_in_app_count,
              expected_email_count, excluded_count, expires_at
            )
            values (?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', ?, 2, 1, 2, 2, 1, 1, timestampadd(MINUTE, 5, utc_timestamp(6)))
            """.trimIndent(),
            HOST_PREVIEW_ID.toString(),
            BASELINE_CLUB_ID.toString(),
            BASELINE_SESSION_ID.toString(),
            BASELINE_HOST_MEMBERSHIP_ID.toString(),
            "a".repeat(64),
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_decisions (
              id, preview_id, club_id, session_id, host_membership_id, action_type, event_type,
              live_revision, decision, target_count, expected_in_app_count, expected_email_count,
              excluded_count, event_id
            )
            values (?, ?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', 11, 'SEND', 2, 2, 1, 1, ?)
            """.trimIndent(),
            HOST_DECISION_ID.toString(),
            HOST_PREVIEW_ID.toString(),
            BASELINE_CLUB_ID.toString(),
            BASELINE_SESSION_ID.toString(),
            BASELINE_HOST_MEMBERSHIP_ID.toString(),
            HOST_CONFIRMED_EVENT_ID.toString(),
        )
        jdbcTemplate.update(
            """
            update host_action_notification_previews
            set consumed_at = utc_timestamp(6), consumed_decision_id = ?
            where id = ?
            """.trimIndent(),
            HOST_DECISION_ID.toString(),
            HOST_PREVIEW_ID.toString(),
        )
    }

    private fun insertEvent(
        id: UUID,
        clubId: UUID,
        status: String,
        lastError: String?,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?), ?, ?, 1, ?, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            id.toString(),
            clubId.toString(),
            BASELINE_SESSION_ID.toString(),
            BASELINE_SESSION_ID.toString(),
            status,
            clubId.toString(),
            lastError,
            "admin-notification-operations-$id",
        )
    }

    private fun insertDelivery(seed: DeliverySeed) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, ?, ?, ?, 2, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            seed.id.toString(),
            seed.eventId.toString(),
            seed.clubId.toString(),
            seed.membershipId.toString(),
            seed.channel,
            seed.status,
            "admin-notification-operations-delivery-${seed.id}",
            seed.lastError,
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
            jdbcTemplate.update(
                "delete from notification_deliveries where id in (?, ?)",
                REPLAY_PADDED_CHANNEL_DELIVERY_ID.toString(),
                REPLAY_PADDED_STATUS_DELIVERY_ID.toString(),
            )
            jdbcTemplate.execute(
                "alter table notification_deliveries alter check notification_deliveries_channel_check enforced",
            )
            jdbcTemplate.execute(
                "alter table notification_deliveries alter check notification_deliveries_status_check enforced",
            )
        }
    }

    private fun deliveryTimestamp(
        deliveryId: UUID,
        column: String,
    ): OffsetDateTime =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select $column from notification_deliveries where id = ?",
                LocalDateTime::class.java,
                deliveryId.toString(),
            ),
        ).atOffset(ZoneOffset.UTC)

    private fun replayCount(filter: AdminNotificationFilter) = adapter.estimateReplayableDeliveries(filter).matchedCount
}

private data class DeliverySeed(
    val id: UUID,
    val eventId: UUID,
    val clubId: UUID,
    val membershipId: UUID,
    val channel: String = "EMAIL",
    val status: String,
    val lastError: String?,
)

private fun notificationRuntimeProperties(claimLease: Duration): NotificationRuntimeProperties =
    NotificationRuntimeProperties(
        worker = NotificationRuntimeProperties.Worker(claimLease = claimLease),
    )

private val BASELINE_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val SECOND_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
private val BASELINE_MEMBER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val BASELINE_HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
private val BASELINE_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val SECOND_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000008001")
private val SECOND_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000008002")
private val FAILED_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007501")
private val MANUAL_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007502")
private val SECOND_CLUB_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007503")
private val HOST_CONFIRMED_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007504")
private val DEAD_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007601")
private val SECOND_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007602")
private val REPLAY_FAILED_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007603")
private val REPLAY_DEAD_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007604")
private val REPLAY_PENDING_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007605")
private val REPLAY_SENT_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007606")
private val REPLAY_IN_APP_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007607")
private val REPLAY_SECOND_CLUB_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007608")
private val REPLAY_LOWERCASE_CHANNEL_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007609")
private val REPLAY_MIXED_CHANNEL_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007610")
private val REPLAY_PADDED_CHANNEL_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007611")
private val REPLAY_LOWERCASE_STATUS_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007612")
private val REPLAY_MIXED_STATUS_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007613")
private val REPLAY_PADDED_STATUS_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007614")
private val REPLAY_LOWERCASE_FAILURE_CODE_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007615")
private val REPLAY_MIXED_FAILURE_CODE_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007616")
private val REPLAY_PADDED_FAILURE_CODE_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007617")
private val REPLAY_NULL_FAILURE_CODE_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007618")
private val REPLAY_BLANK_FAILURE_CODE_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007619")
private val REPLAY_UNKNOWN_FAILURE_CODE_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007620")
private val MANUAL_DISPATCH_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007701")
private val HOST_PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007801")
private val HOST_DECISION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007901")
private val ADMIN_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
private const val REPLAY_SELECTION_HASH: String = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
