package com.readmates.shared.mutation.adapter.out.persistence

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import com.readmates.session.adapter.out.persistence.JdbcHostMutationReceiptAdapter
import com.readmates.session.application.model.HostMutationReceiptRecord
import com.readmates.session.application.model.NotificationDecision
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.shared.mutation.application.model.CanonicalMutationPayload
import com.readmates.shared.mutation.application.model.DigestKeyRetirementRejectedException
import com.readmates.shared.mutation.application.model.HostMutationOperation
import com.readmates.shared.mutation.application.model.IdempotencyKeyReusedException
import com.readmates.shared.mutation.application.model.MutationClaimResult
import com.readmates.shared.mutation.application.model.MutationIdentity
import com.readmates.shared.mutation.application.service.MutationIdempotencyMetrics
import com.readmates.shared.mutation.application.service.MutationIdempotencyService
import com.readmates.shared.mutation.config.MutationIdempotencyProperties
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_MUTATION_IDEMPOTENCY_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_MUTATION_IDEMPOTENCY_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcMutationIdempotencyAdapterDbTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val clock = MutableClock(Instant.parse("2026-08-22T00:00:00Z"))
    private val registry = SimpleMeterRegistry()
    private val adapter = JdbcMutationIdempotencyAdapter(jdbcTemplate)
    private val receipts = JdbcHostMutationReceiptAdapter(jdbcTemplate)
    private val transactionTemplate = TransactionTemplate(transactionManager)
    private lateinit var logAppender: ListAppender<ILoggingEvent>
    private lateinit var logger: Logger

    @BeforeEach
    fun captureLogs() {
        logger = LoggerFactory.getLogger(JdbcMutationIdempotencyAdapter::class.java) as Logger
        logAppender = ListAppender<ILoggingEvent>().apply { start() }
        logger.addAppender(logAppender)
        logger.level = Level.DEBUG
    }

    @AfterEach
    fun detachLogs() {
        logger.detachAppender(logAppender)
        logAppender.stop()
    }

    @Test
    @Timeout(30)
    fun `concurrent claims keep a single in progress owner`() {
        val identity = identity("concurrent-claim-key")
        val started = CountDownLatch(2)
        val release = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val first =
                executor.submit<MutationClaimResult> {
                    transactionTemplate.execute {
                        val claimed = service().claim(identity, payload())
                        started.countDown()
                        check(release.await(10, TimeUnit.SECONDS))
                        claimed
                    }
                }
            val second =
                executor.submit<MutationClaimResult> {
                    started.countDown()
                    check(started.await(10, TimeUnit.SECONDS))
                    transactionTemplate.execute { service().claim(identity, payload()) }
                }
            check(started.await(10, TimeUnit.SECONDS))
            release.countDown()
            val results = listOf(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS))
            assertThat(results.filterIsInstance<MutationClaimResult.Claimed>()).hasSize(1)
            assertThat(results.filterIsInstance<MutationClaimResult.InProgress>()).hasSize(1)
            assertThat(rowCount(identity)).isEqualTo(1)
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `same key and payload replays the stored receipt`() {
        val identity = identity("replay-key")
        val claimed = service().claim(identity, payload())
        assertThat(claimed).isInstanceOf(MutationClaimResult.Claimed::class.java)
        val receiptId = insertReceipt()
        service().complete(identity, receiptId)
        val replayed = service().claim(identity, payload())
        assertThat(replayed).isEqualTo(MutationClaimResult.Replayed(identity, receiptId))
        assertThat(rowCount(identity)).isEqualTo(1)
    }

    @Test
    fun `same key with a different payload is conflict`() {
        val identity = identity("reuse-key")
        service().claim(identity, payload(meetingPasscode = "alpha"))
        assertThatThrownBy { service().claim(identity, payload(meetingPasscode = "beta")) }
            .isInstanceOf(IdempotencyKeyReusedException::class.java)
            .hasMessage("IDEMPOTENCY_KEY_REUSED")
        assertThat(rowCount(identity)).isEqualTo(1)
    }

    @Test
    fun `in progress recovery returns pending for the same digest`() {
        val identity = identity("pending-key")
        assertThat(service().claim(identity, payload())).isInstanceOf(MutationClaimResult.Claimed::class.java)
        assertThat(service().claim(identity, payload())).isEqualTo(MutationClaimResult.InProgress(identity))
    }

    @Test
    fun `rotated current key can still replay a previous-key row`() {
        val identity = identity("rotation-key")
        val original = service(properties = keyPair(current = KEY_V1, currentVersion = KEY_V1_VERSION))
        original.claim(identity, payload())
        val receiptId = insertReceipt()
        original.complete(identity, receiptId)
        val rotated =
            service(
                properties =
                    keyPair(
                        current = KEY_V2,
                        currentVersion = KEY_V2_VERSION,
                        previous = KEY_V1,
                        previousVersion = KEY_V1_VERSION,
                    ),
            )
        assertThat(rotated.claim(identity, payload())).isEqualTo(MutationClaimResult.Replayed(identity, receiptId))
    }

    @Test
    fun `referenced digest key retirement is fail closed until purge and buffer elapse`() {
        val identity = identity("retire-key")
        val v1 = service(properties = keyPair(current = KEY_V1, currentVersion = KEY_V1_VERSION))
        v1.claim(identity, payload())
        val rotated =
            service(
                properties =
                    keyPair(
                        current = KEY_V2,
                        currentVersion = KEY_V2_VERSION,
                        previous = KEY_V1,
                        previousVersion = KEY_V1_VERSION,
                    ),
            )
        assertThatThrownBy { rotated.retirePreviousKey() }
            .isInstanceOf(DigestKeyRetirementRejectedException::class.java)
        clock.instant = clock.instant.plus(Duration.ofHours(25))
        assertThat(rotated.purgeExpired(50)).isEqualTo(1)
        assertThatThrownBy { rotated.retirePreviousKey() }
            .isInstanceOf(DigestKeyRetirementRejectedException::class.java)
        clock.instant = clock.instant.plus(Duration.ofHours(24))
        rotated.retirePreviousKey()
        val retired = service(properties = keyPair(current = KEY_V2, currentVersion = KEY_V2_VERSION))
        assertThat(retired.claim(identity("post-retire-key"), payload()))
            .isInstanceOf(MutationClaimResult.Claimed::class.java)
    }

    @Test
    fun `V55 admin takedown references block key retirement and purge through shared retention`() {
        insertAdminTakedownOperationalRows()
        adapter.markReferenced(KEY_V1_VERSION, clock.instant)
        val rotated =
            service(
                properties =
                    keyPair(
                        current = KEY_V2,
                        currentVersion = KEY_V2_VERSION,
                        previous = KEY_V1,
                        previousVersion = KEY_V1_VERSION,
                    ),
            )

        assertThat(adapter.countByDigestKeyVersion(KEY_V1_VERSION)).isEqualTo(1)
        assertThat(adapter.referencedDigestKeyVersions()).contains(KEY_V1_VERSION)
        assertThatThrownBy { rotated.retirePreviousKey() }
            .isInstanceOf(DigestKeyRetirementRejectedException::class.java)

        clock.instant = clock.instant.plus(Duration.ofHours(24)).plusSeconds(1)
        assertThat(rotated.purgeExpired(50)).isEqualTo(2)
        assertThat(adminTakedownPreviewCount()).isZero()
        assertThat(adminTakedownIdempotencyCount()).isZero()
        assertThatThrownBy { rotated.retirePreviousKey() }
            .isInstanceOf(DigestKeyRetirementRejectedException::class.java)
        clock.instant = clock.instant.plus(Duration.ofHours(24))
        rotated.retirePreviousKey()
    }

    private fun insertAdminTakedownOperationalRows() {
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_previews (
              id, actor_user_id_snapshot, actor_platform_role_snapshot,
              club_id_snapshot, session_id_snapshot, publication_id_snapshot,
              target_generation, current_surfaces_json, expires_at, created_at
            ) values (?, ?, 'OWNER', ?, ?, ?, 1, json_array('ORIGIN'), ?, ?)
            """.trimIndent(),
            ADMIN_PREVIEW_ID.toString(),
            ACTOR_ID.toString(),
            CLUB_ID.toString(),
            RESOURCE_ID.toString(),
            RESOURCE_ID.toString(),
            clock.instant
                .plus(Duration.ofHours(24))
                .atOffset(ZoneOffset.UTC)
                .toLocalDateTime(),
            clock.instant.atOffset(ZoneOffset.UTC).toLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_idempotency (
              actor_user_id, operation, club_id, publication_id, idempotency_key,
              request_hmac, canonical_schema_version, digest_key_version,
              created_at, expires_at
            ) values (?, 'EMERGENCY_PUBLIC_TAKEDOWN', ?, ?, 'admin-retire-key',
                      unhex(sha2('synthetic-admin-request', 256)), 1, ?, ?, ?)
            """.trimIndent(),
            ACTOR_ID.toString(),
            CLUB_ID.toString(),
            RESOURCE_ID.toString(),
            KEY_V1_VERSION,
            clock.instant.atOffset(ZoneOffset.UTC).toLocalDateTime(),
            clock.instant
                .plus(Duration.ofHours(24))
                .atOffset(ZoneOffset.UTC)
                .toLocalDateTime(),
        )
    }

    @Test
    fun `purge removes only operational rows older than twenty four hours`() {
        val expired = identity("expired-key")
        val live = identity("live-key")
        val v1 = service()
        v1.claim(expired, payload())
        clock.instant = clock.instant.plus(Duration.ofHours(24)).plusSeconds(1)
        v1.claim(live, payload(meetingPasscode = "later"))
        val receiptId = insertReceipt()
        assertThat(v1.purgeExpired(50)).isEqualTo(1)
        assertThat(rowCount(expired)).isZero()
        assertThat(rowCount(live)).isEqualTo(1)
        receipts.insert(
            HostMutationReceiptRecord(
                receiptId = receiptId,
                clubId = CLUB_ID,
                actorMembershipId = ACTOR_ID,
                operation = HostMutationOperation.SESSION_BASIC_SAVE.name,
                resourceId = RESOURCE_ID,
                resultingVersions = SessionVersionVector.INITIAL,
                notificationDecision = NotificationDecision.NOT_SENT,
                dispatchReceiptId = null,
                createdAt = clock.instant(),
            ),
        )
        assertThat(receiptCount(receiptId)).isEqualTo(1)
        assertThat(v1.purgeExpired(50)).isZero()
        assertThat(receiptCount(receiptId)).isEqualTo(1)
    }

    @Test
    fun `tables logs and receipt dto never persist raw canonical url passcode sha or hmac secret`() {
        val identity = identity("secret-key")
        val claimed =
            service().claim(
                identity,
                payload(meetingUrl = SENSITIVE_URL, meetingPasscode = SENSITIVE_PASSCODE),
            )
        assertThat(claimed).isInstanceOf(MutationClaimResult.Claimed::class.java)
        val receiptId = insertReceipt()
        receipts.insert(
            HostMutationReceiptRecord(
                receiptId = receiptId,
                clubId = CLUB_ID,
                actorMembershipId = ACTOR_ID,
                operation = HostMutationOperation.SESSION_BASIC_SAVE.name,
                resourceId = RESOURCE_ID,
                resultingVersions = SessionVersionVector.INITIAL,
                notificationDecision = NotificationDecision.NOT_SENT,
                dispatchReceiptId = null,
                createdAt = clock.instant(),
            ),
        )
        service().complete(identity, receiptId)
        val stored =
            jdbcTemplate.queryForMap(
                """
                select club_id, actor_membership_id, operation, resource_slot, idempotency_key,
                       canonical_schema_version, digest_key_version, hex(request_hmac) as hmac_hex,
                       status, receipt_id
                from mutation_idempotency_keys
                where idempotency_key = ?
                """.trimIndent(),
                identity.idempotencyKey,
            )
        val joined = stored.values.joinToString(" ") { it?.toString().orEmpty() }
        assertThat(joined).doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE, KEY_V1, "canonical")
        val columns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database()
                  and table_name in ('mutation_idempotency_keys', 'host_session_mutation_receipts')
                """.trimIndent(),
                String::class.java,
            )
        assertThat(columns).doesNotContain("meeting_url", "meeting_passcode", "canonical_payload", "request_sha256")
        assertThat(importedKeys("mutation_idempotency_keys")).isEmpty()
        assertThat(importedKeys("host_session_mutation_receipts")).isEmpty()
        val receipt = receipts.find(CLUB_ID, receiptId)
        assertThat(receipt?.notificationDecision).isEqualTo(NotificationDecision.NOT_SENT)
        assertThat(receipt.toString()).doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE, KEY_V1)
        assertThat(logAppender.list.joinToString { it.formattedMessage })
            .doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE, KEY_V1)
        val hmac = stored["hmac_hex"].toString()
        assertThat(hmac).hasSize(64)
        assertThat(hmac.lowercase()).doesNotContain(SENSITIVE_URL, SENSITIVE_PASSCODE)
    }

    @Test
    fun `startup validator fails closed when referenced key cannot be replayed`() {
        val identity = identity("orphan-key")
        service(properties = keyPair(current = KEY_V1, currentVersion = ORPHAN_KEY_VERSION)).claim(identity, payload())
        val validator =
            com.readmates.shared.mutation.config.MutationIdempotencyStartupValidator(
                keyPair(current = KEY_V2, currentVersion = KEY_V2_VERSION),
                adapter,
                org.springframework.mock.env
                    .MockEnvironment(),
            )
        assertThatThrownBy { validator.validate() }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("digest key")
    }

    private fun service(): MutationIdempotencyService = service(defaultProperties())

    private fun defaultProperties() = keyPair(current = KEY_V1, currentVersion = KEY_V1_VERSION)

    private fun service(properties: MutationIdempotencyProperties) =
        MutationIdempotencyService(adapter, properties, clock, MutationIdempotencyMetrics(registry))

    private fun payload(
        meetingUrl: String? = null,
        meetingPasscode: String? = "alpha",
    ) = CanonicalMutationPayload.SessionFields.applyDefaults(
        operation = HostMutationOperation.SESSION_BASIC_SAVE,
        title = "주간 모임",
        bookTitle = "책",
        bookAuthor = "저자",
        date = "2026-08-22",
        meetingUrl = meetingUrl,
        meetingPasscode = meetingPasscode,
    )

    private fun identity(key: String) =
        MutationIdentity(
            clubId = CLUB_ID,
            actorMembershipId = ACTOR_ID,
            operation = HostMutationOperation.SESSION_BASIC_SAVE.name,
            resourceSlot = RESOURCE_ID.toString(),
            idempotencyKey = key,
        )

    private fun insertReceipt(): UUID = UUID.fromString("cccccccc-0000-4000-8000-000000000099")

    private fun rowCount(identity: MutationIdentity): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from mutation_idempotency_keys
            where club_id = ? and actor_membership_id = ? and operation = ?
              and resource_slot = ? and idempotency_key = ?
            """.trimIndent(),
            Int::class.java,
            identity.clubId.toString(),
            identity.actorMembershipId.toString(),
            identity.operation,
            identity.resourceSlot,
            identity.idempotencyKey,
        ) ?: 0

    private fun receiptCount(receiptId: UUID): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from host_session_mutation_receipts where id = ?",
            Int::class.java,
            receiptId.toString(),
        ) ?: 0

    private fun adminTakedownIdempotencyCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from admin_public_takedown_idempotency where idempotency_key = 'admin-retire-key'",
            Int::class.java,
        ) ?: 0

    private fun adminTakedownPreviewCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from admin_public_takedown_previews where id = ?",
            Int::class.java,
            ADMIN_PREVIEW_ID.toString(),
        ) ?: 0

    private fun importedKeys(tableName: String): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select constraint_name
                from information_schema.referential_constraints
                where constraint_schema = database() and table_name = ?
                """.trimIndent(),
                String::class.java,
                tableName,
            ).filterNotNull()

    private class MutableClock(
        var instant: Instant,
    ) : Clock() {
        override fun getZone() = ZoneOffset.UTC

        override fun withZone(zone: java.time.ZoneId) = this

        override fun instant() = instant
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000053001")
        val ACTOR_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000053002")
        val RESOURCE_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000053010")
        val ADMIN_PREVIEW_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000053011")
        const val KEY_V1 = "test-mutation-identity-v1-key"
        const val KEY_V2 = "test-mutation-identity-v2-key"
        const val KEY_V1_VERSION = 5_301
        const val KEY_V2_VERSION = 5_302
        const val ORPHAN_KEY_VERSION = 5_309
        const val SENSITIVE_URL = "https://meet.example.com/private-room"
        const val SENSITIVE_PASSCODE = "room-passcode-value"

        fun keyPair(
            current: String,
            currentVersion: Int,
            previous: String = "",
            previousVersion: Int = 0,
        ) = MutationIdempotencyProperties(
            currentKey = current,
            currentKeyVersion = currentVersion,
            previousKey = previous,
            previousKeyVersion = previousVersion,
            retention = Duration.ofHours(24),
            previousKeyRolloutBuffer = Duration.ofHours(24),
            allowEmptySecret = false,
        )
    }
}

private const val CLEANUP_MUTATION_IDEMPOTENCY_SQL = """
delete from admin_public_takedown_previews
where id = 'aaaaaaaa-0000-4000-8000-000000053011';
delete from admin_public_takedown_idempotency
where idempotency_key = 'admin-retire-key';
delete from mutation_idempotency_keys
where club_id = 'aaaaaaaa-0000-4000-8000-000000053001';
delete from host_session_mutation_receipts
where club_id = 'aaaaaaaa-0000-4000-8000-000000053001';
delete from mutation_digest_key_state
where digest_key_version in (5301, 5302, 5309);
"""
