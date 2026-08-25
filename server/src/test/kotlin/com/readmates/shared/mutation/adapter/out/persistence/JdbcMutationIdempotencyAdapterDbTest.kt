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
        val original = service(properties = keyPair(current = KEY_V1, currentVersion = 1))
        original.claim(identity, payload())
        val receiptId = insertReceipt()
        original.complete(identity, receiptId)
        val rotated =
            service(
                properties =
                    keyPair(
                        current = KEY_V2,
                        currentVersion = 2,
                        previous = KEY_V1,
                        previousVersion = 1,
                    ),
            )
        assertThat(rotated.claim(identity, payload())).isEqualTo(MutationClaimResult.Replayed(identity, receiptId))
    }

    @Test
    fun `referenced digest key retirement is fail closed until purge and buffer elapse`() {
        val identity = identity("retire-key")
        val v1 = service(properties = keyPair(current = KEY_V1, currentVersion = 1))
        v1.claim(identity, payload())
        val rotated =
            service(
                properties =
                    keyPair(
                        current = KEY_V2,
                        currentVersion = 2,
                        previous = KEY_V1,
                        previousVersion = 1,
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
        val retired = service(properties = keyPair(current = KEY_V2, currentVersion = 2))
        assertThat(retired.claim(identity("post-retire-key"), payload())).isInstanceOf(MutationClaimResult.Claimed::class.java)
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
        val claimed = service().claim(identity, payload(meetingUrl = SENSITIVE_URL, meetingPasscode = SENSITIVE_PASSCODE))
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
        service(properties = keyPair(current = KEY_V1, currentVersion = 9)).claim(identity, payload())
        val validator =
            com.readmates.shared.mutation.config.MutationIdempotencyStartupValidator(
                keyPair(current = KEY_V2, currentVersion = 2),
                adapter,
                org.springframework.mock.env
                    .MockEnvironment(),
            )
        assertThatThrownBy { validator.validate() }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("digest key")
    }

    @Test
    fun `immutable public takedown receipt blocks digest key retirement and startup without that key`() {
        insertPublicTakedownReceipt(digestKeyVersion = 1)
        assertThat(adapter.countByDigestKeyVersion(1)).isEqualTo(1)
        assertThat(adapter.referencedDigestKeyVersions()).contains(1)

        val rotated =
            service(
                properties =
                    keyPair(
                        current = KEY_V2,
                        currentVersion = 2,
                        previous = KEY_V1,
                        previousVersion = 1,
                    ),
            )
        assertThatThrownBy { rotated.retirePreviousKey() }
            .isInstanceOf(DigestKeyRetirementRejectedException::class.java)

        val validator =
            com.readmates.shared.mutation.config.MutationIdempotencyStartupValidator(
                keyPair(current = KEY_V2, currentVersion = 2),
                adapter,
                org.springframework.mock.env
                    .MockEnvironment(),
            )
        assertThatThrownBy { validator.validate() }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("digest key")
    }

    private fun service(properties: MutationIdempotencyProperties = keyPair(current = KEY_V1, currentVersion = 1)) =
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

    private fun insertPublicTakedownReceipt(digestKeyVersion: Int) {
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_receipts (
              id, actor_admin_id, actor_role_snapshot, capability_snapshot,
              club_id_snapshot, session_id_snapshot, publication_id_snapshot, preview_id_snapshot,
              idempotency_key_hmac, canonical_schema_version, digest_key_version, request_hmac,
              reason_category, reason_summary, origin_result, committed_generation,
              committed_club_generation, convergence_id, created_at
            ) values (
              ?, ?, 'OWNER', 'EMERGENCY_PUBLIC_TAKEDOWN', ?, ?, ?, ?,
              unhex(repeat('01', 32)), 1, ?, unhex(repeat('02', 32)),
              'PRIVACY', 'REDACTED_NON_EMPTY', 'DENIED', 2, 2, ?, utc_timestamp(6)
            )
            """.trimIndent(),
            TAKEDOWN_RECEIPT_ID,
            ACTOR_ID.toString(),
            CLUB_ID.toString(),
            TAKEDOWN_SESSION_ID,
            TAKEDOWN_PUBLICATION_ID,
            TAKEDOWN_PREVIEW_ID,
            digestKeyVersion,
            TAKEDOWN_CONVERGENCE_ID,
        )
    }

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
        const val KEY_V1 = "test-mutation-identity-v1-key"
        const val KEY_V2 = "test-mutation-identity-v2-key"
        const val SENSITIVE_URL = "https://meet.example.com/private-room"
        const val SENSITIVE_PASSCODE = "room-passcode-value"
        const val TAKEDOWN_RECEIPT_ID = "aaaaaaaa-0000-4000-8000-000000053091"
        const val TAKEDOWN_SESSION_ID = "aaaaaaaa-0000-4000-8000-000000053092"
        const val TAKEDOWN_PUBLICATION_ID = "aaaaaaaa-0000-4000-8000-000000053093"
        const val TAKEDOWN_PREVIEW_ID = "aaaaaaaa-0000-4000-8000-000000053094"
        const val TAKEDOWN_CONVERGENCE_ID = "aaaaaaaa-0000-4000-8000-000000053095"

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
delete from admin_public_takedown_receipts
where id = 'aaaaaaaa-0000-4000-8000-000000053091';
delete from mutation_idempotency_keys
where club_id = 'aaaaaaaa-0000-4000-8000-000000053001';
delete from host_session_mutation_receipts
where club_id = 'aaaaaaaa-0000-4000-8000-000000053001';
delete from mutation_digest_key_state
where digest_key_version in (1, 2, 9);
"""
