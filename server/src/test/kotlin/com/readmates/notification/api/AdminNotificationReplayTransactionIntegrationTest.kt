package com.readmates.notification.api

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.adapter.out.persistence.JdbcAdminNotificationReplayAdapter
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.model.AdminNotificationReplaySnapshot
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.assertj.core.api.Assertions.catchThrowable
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.EnumSource
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.core.env.Environment
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.DriverManager
import java.time.Clock
import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

private typealias ReplayAdapter = JdbcAdminNotificationReplayAdapter
private typealias ReplayConfirmation = AdminNotificationReplayConfirmation

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Import(AdminNotificationReplayTransactionIntegrationTest.TestConfig::class)
@Tag("integration")
internal class AdminNotificationReplayTransactionIntegrationTest(
    @param:Autowired private val useCase: ManageAdminNotificationOperationsUseCase,
    @param:Autowired private val replayPort: SwitchableReplayPort,
    @param:Autowired private val auditPort: SwitchableAuditPort,
    @param:Autowired private val clock: MutableReplayClock,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val environment: Environment,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val previewIds = linkedSetOf<UUID>()

    @AfterEach
    fun cleanup() {
        replayPort.failureStage = null
        replayPort.beforeLock = {}
        auditPort.failAfterInsert = false
        previewIds.forEach { previewId ->
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
            jdbcTemplate.update(
                """
                delete from platform_audit_events
                where event_type = 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED'
                  and json_unquote(json_extract(metadata_json, '$.previewId')) = ?
                """.trimIndent(),
                previewId.toString(),
            )
            jdbcTemplate.update("delete from admin_notification_replay_previews where id = ?", previewId.toString())
        }
        previewIds.clear()
        jdbcTemplate.update("delete from notification_deliveries where event_id = ?", EVENT_ID.toString())
        jdbcTemplate.update("delete from notification_event_outbox where id = ?", EVENT_ID.toString())
    }

    @Test
    fun `two concurrent confirms converge on one receipt audit and delivery reset`() {
        seedFailedDelivery()
        clock.set(BASE_TIME)
        val preview = preview()
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results =
                List(2) {
                    CompletableFuture.supplyAsync(
                        {
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS))
                            confirm(preview.previewId, preview.selectionHash)
                        },
                        executor,
                    )
                }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()

            assertThat(results.map { it.get(10, TimeUnit.SECONDS) }).allSatisfy {
                assertThat(it.replayedCount).isEqualTo(1)
                assertThat(it.skippedCount).isZero()
            }
            assertReplayCardinality(preview.previewId, receipts = 1, audits = 1)
            assertThat(deliveryStatus()).isEqualTo("PENDING")
            assertOneConfirmationTimestamp(preview.previewId, BASE_TIME)
            assertThat(eventOutboxState()).containsExactly("FAILED", 1)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `overlapping previews deterministically let only one exact target transition win`() {
        seedFailedDelivery()
        clock.set(BASE_TIME)
        val previews = listOf(preview(), preview())
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results =
                previews.map { preview ->
                    CompletableFuture.supplyAsync(
                        {
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS))
                            confirm(preview.previewId, preview.selectionHash)
                        },
                        executor,
                    )
                }
            check(ready.await(10, TimeUnit.SECONDS))
            start.countDown()

            assertThat(results.map { it.get(10, TimeUnit.SECONDS).replayedCount }.sorted()).containsExactly(0, 1)
            previews.forEach { assertReplayCardinality(it.previewId, receipts = 1, audits = 1) }
        } finally {
            executor.shutdownNow()
        }
    }

    @ParameterizedTest
    @EnumSource(FailureStage::class)
    fun `companion persistence failure rolls back preview delivery audit receipt and consumption`(stage: FailureStage) {
        seedFailedDelivery()
        clock.set(BASE_TIME)
        if (stage == FailureStage.PREVIEW_INSERT) {
            replayPort.failureStage = stage
            assertThatThrownBy { preview() }.isInstanceOf(InjectedReplayFailure::class.java)
            assertThat(previewCount()).isZero()
            assertThat(targetCount()).isZero()
            return
        }
        val preview = preview()
        replayPort.failureStage = stage.takeUnless { it == FailureStage.AUDIT_INSERT }
        auditPort.failAfterInsert = stage == FailureStage.AUDIT_INSERT

        assertThatThrownBy { confirm(preview.previewId, preview.selectionHash) }
            .isInstanceOfAny(InjectedReplayFailure::class.java, NotificationApplicationException::class.java)

        assertThat(deliveryStatus()).isEqualTo("FAILED")
        assertReplayCardinality(preview.previewId, receipts = 0, audits = 0)
        assertThat(consumedAt(preview.previewId)).isNull()
    }

    @Test
    fun `clock is read after preview lock so expiry while waiting rejects without mutation`() {
        seedFailedDelivery()
        clock.set(BASE_TIME)
        val preview = preview()
        openConnection().use { blocker ->
            blocker.autoCommit = false
            blocker
                .prepareStatement("select id from admin_notification_replay_previews where id = ? for update")
                .use { statement ->
                    statement.setString(1, preview.previewId.toString())
                    statement.executeQuery().use { check(it.next()) }
                }
            val lockAttempted = CountDownLatch(1)
            replayPort.beforeLock = { lockAttempted.countDown() }
            val executor = Executors.newSingleThreadExecutor()
            try {
                val result =
                    CompletableFuture.runAsync(
                        { confirm(preview.previewId, preview.selectionHash) },
                        executor,
                    )
                check(lockAttempted.await(10, TimeUnit.SECONDS))
                clock.set(BASE_TIME.plusSeconds(600))
                blocker.commit()

                assertThatThrownBy { result.get(10, TimeUnit.SECONDS) }
                    .hasRootCauseInstanceOf(NotificationApplicationException::class.java)
                assertThat(deliveryStatus()).isEqualTo("FAILED")
                assertReplayCardinality(preview.previewId, receipts = 0, audits = 0)
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun `lost response retry returns the persisted receipt even after expiry`() {
        seedFailedDelivery()
        clock.set(BASE_TIME)
        val preview = preview()
        val first = confirm(preview.previewId, preview.selectionHash)
        clock.set(BASE_TIME.plusSeconds(601))

        val retry = confirm(preview.previewId, preview.selectionHash)

        assertThat(retry).isEqualTo(first)
        assertReplayCardinality(preview.previewId, receipts = 1, audits = 1)
    }

    @ParameterizedTest
    @ValueSource(booleans = [false, true])
    fun `open and consumed v1 previews require a new preview without mutation`(consumed: Boolean) {
        seedFailedDelivery()
        clock.set(BASE_TIME)
        val previewId = UUID.randomUUID()
        previewIds += previewId
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (
              id, actor_user_id, filter_json, selection_hash, matched_count,
              expires_at, consumed_at, created_at, contract_version
            ) values (?, ?, json_object('clubId', ?), ?, 1, ?, ?, ?, 1)
            """.trimIndent(),
            previewId.toString(),
            ADMIN_USER_ID.toString(),
            CLUB_ID.toString(),
            "a".repeat(64),
            BASE_TIME.plusMinutes(10).toLocalDateTime(),
            BASE_TIME.takeIf { consumed }?.toLocalDateTime(),
            BASE_TIME.toLocalDateTime(),
        )

        val failure = catchThrowable { confirm(previewId, "a".repeat(64)) }

        assertThat(failure).isInstanceOf(NotificationApplicationException::class.java)
        assertThat((failure as NotificationApplicationException).error)
            .isEqualTo(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REPREVIEW_REQUIRED)
        assertThat(deliveryStatus()).isEqualTo("FAILED")
        assertReplayCardinality(previewId, receipts = 0, audits = 0)
        assertThat(targetCount()).isZero()
    }

    private fun preview() =
        useCase
            .previewReplay(
                ADMIN,
                AdminNotificationReplayPreviewRequest(AdminNotificationFilter(clubId = CLUB_ID)),
            ).also { previewIds += it.previewId }

    private fun confirm(
        previewId: UUID,
        selectionHash: String,
    ) = useCase.confirmReplay(
        ADMIN,
        AdminNotificationReplayConfirmCommand(previewId, selectionHash, "Retry after provider recovery"),
    )

    private fun seedFailedDelivery() {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, dedupe_key, created_at, updated_at
            ) values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?),
              'FAILED', ?, 1, ?, ?, ?)
            """.trimIndent(),
            EVENT_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            SESSION_ID.toString(),
            CLUB_ID.toString(),
            "task3-tx-event-$EVENT_ID",
            BASE_TIME.toLocalDateTime(),
            BASE_TIME.toLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            ) values (?, ?, ?, ?, 'EMAIL', 'FAILED', ?, 2, 'MAIL_RETRYABLE', ?, ?)
            """.trimIndent(),
            DELIVERY_ID.toString(),
            EVENT_ID.toString(),
            CLUB_ID.toString(),
            MEMBER_ID.toString(),
            "task3-tx-delivery-$DELIVERY_ID",
            BASE_TIME.toLocalDateTime(),
            BASE_TIME.toLocalDateTime(),
        )
    }

    private fun assertReplayCardinality(
        previewId: UUID,
        receipts: Int,
        audits: Int,
    ) {
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from admin_notification_replay_confirmations where preview_id = ?",
                Int::class.java,
                previewId.toString(),
            ),
        ).isEqualTo(receipts)
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select count(*) from platform_audit_events
                where event_type = 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED'
                  and json_unquote(json_extract(metadata_json, '$.previewId')) = ?
                """.trimIndent(),
                Int::class.java,
                previewId.toString(),
            ),
        ).isEqualTo(audits)
    }

    private fun assertOneConfirmationTimestamp(
        previewId: UUID,
        expected: OffsetDateTime,
    ) {
        val timestamps =
            jdbcTemplate.queryForObject(
                """
                select delivery.next_attempt_at, delivery.updated_at, audit.created_at,
                       confirmation.confirmed_at, preview.consumed_at
                from notification_deliveries delivery
                join admin_notification_replay_previews preview on preview.id = ?
                join admin_notification_replay_confirmations confirmation on confirmation.preview_id = preview.id
                join platform_audit_events audit on audit.id = confirmation.platform_audit_event_id
                where delivery.id = ?
                """.trimIndent(),
                { resultSet, _ -> (1..5).map { resultSet.getObject(it, LocalDateTime::class.java) } },
                previewId.toString(),
                DELIVERY_ID.toString(),
            )
        assertThat(timestamps).containsOnly(expected.toLocalDateTime())
    }

    private fun eventOutboxState(): List<Any> =
        jdbcTemplate.queryForObject(
            "select status, attempt_count from notification_event_outbox where id = ?",
            { resultSet, _ -> listOf(resultSet.getString(1), resultSet.getInt(2)) },
            EVENT_ID.toString(),
        )

    private fun deliveryStatus(): String =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select status from notification_deliveries where id = ?",
                String::class.java,
                DELIVERY_ID.toString(),
            ),
        )

    private fun consumedAt(previewId: UUID): Any? =
        jdbcTemplate.queryForObject(
            "select consumed_at from admin_notification_replay_previews where id = ?",
            Any::class.java,
            previewId.toString(),
        )

    private fun previewCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from admin_notification_replay_previews where actor_user_id = ? and created_at = ?",
            Int::class.java,
            ADMIN_USER_ID.toString(),
            BASE_TIME.toLocalDateTime(),
        )!!

    private fun targetCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from admin_notification_replay_preview_targets where delivery_id = ?",
            Int::class.java,
            DELIVERY_ID.toString(),
        )!!

    private fun openConnection() =
        DriverManager.getConnection(
            environment.getRequiredProperty("spring.datasource.url"),
            environment.getRequiredProperty("spring.datasource.username"),
            environment.getRequiredProperty("spring.datasource.password"),
        )

    @TestConfiguration(proxyBeanMethods = false)
    internal class TestConfig {
        @Bean
        @Primary
        fun mutableReplayClock(): MutableReplayClock = MutableReplayClock(BASE_TIME.toInstant())

        @Bean
        @Primary
        fun switchableReplayPort(adapter: ReplayAdapter): SwitchableReplayPort = SwitchableReplayPort(adapter)

        @Bean
        @Primary
        fun switchableAuditPort(adapter: ReplayAdapter): SwitchableAuditPort = SwitchableAuditPort(adapter)
    }
}

internal enum class FailureStage { PREVIEW_INSERT, TARGET_UPDATE, AUDIT_INSERT, RECEIPT_INSERT, CONSUME }

internal class InjectedReplayFailure : RuntimeException("injected replay transaction failure")

internal class SwitchableReplayPort(
    private val delegate: JdbcAdminNotificationReplayAdapter,
) : AdminNotificationReplayPort {
    @Volatile var failureStage: FailureStage? = null

    @Volatile var beforeLock: () -> Unit = {}

    override fun loadSnapshot(
        filter: AdminNotificationFilter,
        targetLimit: Int,
    ): AdminNotificationReplaySnapshot = delegate.loadSnapshot(filter, targetLimit)

    override fun createPreview(input: AdminNotificationReplayPreviewInsert): UUID =
        delegate.createPreview(input).also {
            if (failureStage == FailureStage.PREVIEW_INSERT) throw InjectedReplayFailure()
        }

    override fun lockPreview(previewId: UUID): AdminNotificationReplayPreviewRecord? {
        beforeLock()
        return delegate.lockPreview(previewId)
    }

    override fun findConfirmation(previewId: UUID): ReplayConfirmation? = delegate.findConfirmation(previewId)

    override fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): Int =
        delegate.replayPreviewTargets(previewId, replayedAt).also {
            if (failureStage ==
                FailureStage.TARGET_UPDATE
            ) {
                throw InjectedReplayFailure()
            }
        }

    override fun createConfirmation(input: AdminNotificationReplayConfirmationInsert): UUID =
        delegate.createConfirmation(input).also {
            if (failureStage == FailureStage.RECEIPT_INSERT) throw InjectedReplayFailure()
        }

    override fun consumePreview(
        previewId: UUID,
        confirmationId: UUID,
        consumedAt: OffsetDateTime,
    ): Boolean {
        val consumed = delegate.consumePreview(previewId, confirmationId, consumedAt)
        return if (failureStage == FailureStage.CONSUME) false else consumed
    }
}

internal class SwitchableAuditPort(
    private val delegate: JdbcAdminNotificationReplayAdapter,
) : AdminNotificationAuditPort {
    @Volatile var failAfterInsert = false

    override fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
        createdAt: OffsetDateTime,
    ): UUID =
        delegate.writeReplayConfirmed(actorUserId, actorPlatformRole, metadataJson, createdAt).also {
            if (failAfterInsert) throw InjectedReplayFailure()
        }
}

internal class MutableReplayClock(
    initial: Instant,
) : Clock() {
    private val instant = AtomicReference(initial)

    fun set(value: OffsetDateTime) = instant.set(value.toInstant())

    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant = instant.get()
}

private val ADMIN =
    CurrentPlatformAdmin(
        UUID.fromString("00000000-0000-0000-0000-000000000101"),
        "admin@example.com",
        PlatformAdminRole.OWNER,
    )
private val ADMIN_USER_ID = ADMIN.userId
private val CLUB_ID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val MEMBER_ID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val SESSION_ID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val EVENT_ID = UUID.fromString("00000000-0000-0000-0000-000000009101")
private val DELIVERY_ID = UUID.fromString("00000000-0000-0000-0000-000000009102")
private val BASE_TIME = OffsetDateTime.parse("2026-05-27T01:02:03.123456Z")
