package com.readmates.shared.adminmutation.adapter.out.persistence

import com.readmates.shared.adminmutation.adapter.out.observability.AdminCommandMetrics
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimAttempt
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestSet
import com.readmates.shared.adminmutation.application.model.AdminCommandScope
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.CorruptAdminCommandClaimException
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.model.RequiredAdminCommandTransactionException
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.sql.DataSource

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_ADMIN_COMMAND_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_ADMIN_COMMAND_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class AdminCommandIdempotencyConcurrencyTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val dataSource: DataSource,
    @Autowired transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val transactionTemplate = TransactionTemplate(transactionManager)
    private val clock = MutableClock(NOW)
    private val adapter = JdbcAdminCommandIdempotencyAdapter(jdbcTemplate)

    @Test
    @Timeout(30)
    fun `v1 and overlapping v2 v1 claims converge to one owner with both aliases`() {
        val results = race(service(currentVersion = V1), service(currentVersion = V2, previousVersion = V1))

        assertSingleClaimAndPending(results)
        assertThat(aliasVersions()).containsExactly(V1, V2)
        assertThat(aliasClaimIds().distinct()).hasSize(1)
    }

    @Test
    @Timeout(30)
    fun `overlapping v2 v1 and v3 v2 claims converge and backfill all write aliases`() {
        val results =
            race(
                service(currentVersion = V2, previousVersion = V1),
                service(currentVersion = V3, previousVersion = V2),
            )

        assertSingleClaimAndPending(results)
        assertThat(aliasVersions()).containsExactly(V1, V2, V3)
        assertThat(aliasClaimIds().distinct()).hasSize(1)
    }

    @Test
    fun `same key with a different canonical request is conflict`() {
        inTransaction { service(currentVersion = V1).claim(identity(), request("approved")) }

        val result = inTransaction { service(currentVersion = V1).claim(identity(), request("rejected")) }

        assertThat(result).isEqualTo(AdminCommandClaimResult.Conflict)
        assertThat(claimCount()).isEqualTo(1)
        assertThat(aliasVersions()).containsExactly(V1)
    }

    @Test
    fun `committed in progress is fail closed and never taken over`() {
        val first = inTransaction { service(currentVersion = V1).claim(identity(), request()) }

        val replay = inTransaction { service(currentVersion = V1).claim(identity(), request()) }

        assertThat(first).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
        assertThat(replay).isEqualTo(AdminCommandClaimResult.InProgress)
        assertThat(claimCount()).isEqualTo(1)
    }

    @Test
    fun `current only mode backfills current alias while previous remains lookup capable`() {
        inTransaction { service(currentVersion = V1).claim(identity(), request()) }
        val futureReference = NOW.plus(Duration.ofDays(1))
        insertDigestKeyState(V2, futureReference, NOW.minus(Duration.ofDays(1)))

        val replay =
            inTransaction {
                service(currentVersion = V2, previousVersion = V1, writePreviousAlias = false)
                    .claim(identity(), request())
            }

        assertThat(replay).isEqualTo(AdminCommandClaimResult.InProgress)
        assertThat(aliasVersions()).containsExactly(V1, V2)
        assertThat(digestKeyStates()).containsKeys(V1, V2)
        assertThat(digestKeyStates()[V2]).isEqualTo(DigestKeyState(futureReference, null))
    }

    @Test
    fun `uppercase scope input persists canonical scope and lowercase retry finds the same claim`() {
        val uppercase =
            identity(
                commandType = "Club.Create",
                targetType = "Club",
                targetId = TARGET_ID.toString().uppercase(),
            )
        val lowercase = identity(targetId = TARGET_ID.toString())

        val first = inTransaction { service(currentVersion = V1).claim(uppercase, request()) }
        val replay = inTransaction { service(currentVersion = V1).claim(lowercase, request()) }

        assertThat(first).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
        assertThat(replay).isEqualTo(AdminCommandClaimResult.InProgress)
        assertThat(claimCount()).isEqualTo(1)
        assertThat(storedCommandType()).isEqualTo("club.create")
        assertThat(storedTargetType()).isEqualTo("club")
        assertThat(storedTargetId()).isEqualTo(TARGET_ID.toString())
    }

    @Test
    fun `response loss replays completed receipt and domain evidence commits atomically`() {
        val receiptId = UUID.randomUUID().toString()
        inTransaction {
            val claimed = service(currentVersion = V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
            insertDomainEvidence(receiptId)
            assertThat(
                service(currentVersion = V1).complete(
                    claimed.claimId,
                    claimed.claimToken,
                    RECEIPT_TYPE,
                    receiptId,
                ),
            ).isTrue()
        }

        val replay =
            inTransaction {
                service(currentVersion = V2, previousVersion = V1).claim(identity(), request())
            }

        assertThat(replay).isEqualTo(AdminCommandClaimResult.Completed(RECEIPT_TYPE, receiptId))
        assertThat(aliasVersions()).containsExactly(V1, V2)
        assertThat(domainEvidenceCount(receiptId)).isEqualTo(1)
        assertThat(claimState()).isEqualTo("COMPLETED")
    }

    @Test
    fun `outer rollback removes claim aliases key state and domain evidence`() {
        val receiptId = UUID.randomUUID().toString()

        assertThatThrownBy {
            inTransaction {
                val claimed =
                    service(currentVersion = V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
                insertDomainEvidence(receiptId)
                service(currentVersion = V1).complete(
                    claimed.claimId,
                    claimed.claimToken,
                    RECEIPT_TYPE,
                    receiptId,
                )
                error("rollback-domain-command")
            }
        }.hasMessage("rollback-domain-command")
        assertThat(claimCount()).isZero()
        assertThat(aliasVersions()).isEmpty()
        assertThat(digestKeyStates()).isEmpty()
        assertThat(domainEvidenceCount(receiptId)).isZero()
    }

    @Test
    fun `stale completion token cannot replace the winning claim receipt`() {
        val claimed =
            inTransaction {
                service(currentVersion = V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
            }
        val staleReceiptId = UUID.randomUUID().toString()
        val winningReceiptId = UUID.randomUUID().toString()

        assertThat(
            inTransaction {
                service(currentVersion = V1).complete(
                    claimed.claimId,
                    UUID.randomUUID(),
                    RECEIPT_TYPE,
                    staleReceiptId,
                )
            },
        ).isFalse()
        inTransaction {
            insertDomainEvidence(winningReceiptId)
            assertThat(
                service(currentVersion = V1).complete(
                    claimed.claimId,
                    claimed.claimToken,
                    RECEIPT_TYPE,
                    winningReceiptId,
                ),
            ).isTrue()
        }
        assertThat(receiptId()).isEqualTo(winningReceiptId)
    }

    @Test
    fun `long running completion resets expiry from completion time`() {
        val claimed =
            inTransaction {
                service(currentVersion = V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
            }
        val initialExpiry = expiresAt()
        clock.instant = NOW.plus(Duration.ofMinutes(20))
        val receiptId = UUID.randomUUID().toString()

        inTransaction {
            insertDomainEvidence(receiptId)
            assertThat(
                service(currentVersion = V1).complete(
                    claimed.claimId,
                    claimed.claimToken,
                    RECEIPT_TYPE,
                    receiptId,
                ),
            ).isTrue()
        }

        assertThat(initialExpiry).isBefore(clock.instant)
        assertThat(expiresAt()).isEqualTo(clock.instant.plus(Duration.ofDays(7)))
    }

    @Test
    fun `adapter rejects claim and completion without an existing transaction`() {
        val digests = identityService(currentVersion = V1).digests(identity(), request())
        val attempt = attempt(digests)

        assertThatThrownBy { adapter.claim(scope(), attempt, digests) }
            .isInstanceOf(RequiredAdminCommandTransactionException::class.java)
        assertThatThrownBy {
            adapter.complete(
                attempt.claimId,
                attempt.claimToken,
                RECEIPT_TYPE,
                UUID.randomUUID().toString(),
                NOW,
                Duration.ofDays(7),
            )
        }.isInstanceOf(RequiredAdminCommandTransactionException::class.java)
    }

    @Test
    fun `multiple lookup owners fail closed as corrupt mapping`() {
        val digests =
            identityService(currentVersion = V2, previousVersion = V1, writePreviousAlias = true)
                .digests(identity(), request())
        inTransaction {
            insertOwner(UUID.randomUUID(), digests.lookupCandidates.single { it.digestKeyVersion == V1 })
            insertOwner(UUID.randomUUID(), digests.lookupCandidates.single { it.digestKeyVersion == V2 })
        }

        assertThatThrownBy {
            inTransaction { adapter.claim(scope(), attempt(digests), digests) }
        }.isInstanceOf(CorruptAdminCommandClaimException::class.java)
    }

    @Test
    @Timeout(10)
    fun `hidden same claim version alias fails closed instead of retrying backfill forever`() {
        val claimed =
            inTransaction {
                service(currentVersion = V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
            }
        val rotated =
            identityService(currentVersion = V2, previousVersion = V1, writePreviousAlias = true)
                .digests(identity(), request())
        inTransaction {
            insertAlias(
                claimId = claimed.claimId,
                digest = rotated.current.copy(idempotencyKeyHmac = rotated.current.idempotencyKeyHmac.flipped()),
            )
        }

        assertThatThrownBy {
            inTransaction {
                service(currentVersion = V2, previousVersion = V1, writePreviousAlias = true)
                    .claim(identity(), request())
            }
        }.isInstanceOf(CorruptAdminCommandClaimException::class.java)
    }

    @Test
    @Timeout(30)
    fun `conflicting duplicate rolls back provisional claim alias and key state to savepoint`() {
        val digests =
            identityService(currentVersion = V2, previousVersion = V1, writePreviousAlias = true)
                .digests(identity(), request())
        val previousStateAt = NOW.minus(Duration.ofDays(2))
        val previousUnreferencedAt = NOW.minus(Duration.ofDays(1))
        insertDigestKeyState(V1, previousStateAt, previousUnreferencedAt)
        val reachedReservation = CountDownLatch(1)
        val releaseReservation = CountDownLatch(1)
        val blockingAdapter =
            JdbcAdminCommandIdempotencyAdapter(
                BlockingKeyStateJdbcTemplate(dataSource, reachedReservation, releaseReservation),
            )
        val executor = Executors.newSingleThreadExecutor()
        try {
            val future =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction { blockingAdapter.claim(scope(), attempt(digests), digests) }
                }
            assertThat(reachedReservation.await(10, TimeUnit.SECONDS)).isTrue()
            val conflictingCurrent =
                digests.current.copy(requestHmac = digests.current.requestHmac.flipped())
            inTransaction { insertOwner(UUID.randomUUID(), conflictingCurrent) }
            releaseReservation.countDown()

            assertThat(future.get(10, TimeUnit.SECONDS)).isEqualTo(AdminCommandClaimResult.Conflict)
        } finally {
            releaseReservation.countDown()
            executor.shutdownNow()
        }

        assertThat(claimCount()).isEqualTo(1)
        assertThat(aliasVersions()).containsExactly(V2)
        assertThat(digestKeyStates()[V1])
            .isEqualTo(DigestKeyState(previousStateAt, previousUnreferencedAt))
    }

    private fun race(
        firstService: AdminCommandIdempotencyService,
        secondService: AdminCommandIdempotencyService,
    ): List<AdminCommandClaimResult> {
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        return try {
            listOf(firstService, secondService)
                .map { service ->
                    executor.submit<AdminCommandClaimResult> {
                        inTransaction {
                            ready.countDown()
                            check(start.await(10, TimeUnit.SECONDS))
                            service.claim(identity(), request())
                        }
                    }
                }.also {
                    check(ready.await(10, TimeUnit.SECONDS))
                    start.countDown()
                }.map { future -> future.get(10, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    private fun assertSingleClaimAndPending(results: List<AdminCommandClaimResult>) {
        assertThat(results.filterIsInstance<AdminCommandClaimResult.Claimed>()).hasSize(1)
        assertThat(results.filter { it == AdminCommandClaimResult.InProgress }).hasSize(1)
        assertThat(claimCount()).isEqualTo(1)
    }

    private fun service(
        currentVersion: Int,
        previousVersion: Int? = null,
        writePreviousAlias: Boolean = previousVersion != null,
    ) = AdminCommandIdempotencyService(
        identityService = identityService(currentVersion, previousVersion, writePreviousAlias),
        port = adapter,
        properties = AdminCommandIdempotencyProperties(),
        clock = clock,
        observability = AdminCommandMetrics(SimpleMeterRegistry()),
    )

    private fun identityService(
        currentVersion: Int,
        previousVersion: Int? = null,
        writePreviousAlias: Boolean = previousVersion != null,
    ) = AdminCommandIdentityService(
        AdminCommandIdentityProperties(
            currentKey = key(currentVersion),
            currentKeyVersion = currentVersion,
            previousKey = previousVersion?.let(::key).orEmpty(),
            previousKeyVersion = previousVersion ?: 0,
            writePreviousAlias = writePreviousAlias,
        ),
    )

    private fun identity(
        commandType: String = "club.create",
        targetType: String = "club",
        targetId: String = TARGET_ID.toString(),
    ) = PlatformAdminCommandIdentity(
        platformAdminUserId = ADMIN_ID,
        commandType = commandType,
        targetType = targetType,
        targetId = targetId,
        idempotencyKey = IDEMPOTENCY_KEY,
    )

    private fun request(reason: String = "approved") = FixtureRequest(reason)

    private fun scope() = AdminCommandScope(ADMIN_ID, "club.create", "club", TARGET_ID.toString())

    private fun attempt(digests: AdminCommandDigestSet) =
        AdminCommandClaimAttempt(
            claimId = UUID.randomUUID(),
            claimToken = UUID.randomUUID(),
            canonicalSchemaVersion = digests.current.schemaVersion,
            claimedAt = clock.instant,
            initialExpiresAt = clock.instant.plus(Duration.ofMinutes(15)),
        )

    private fun insertOwner(
        claimId: UUID,
        digest: AdminCommandDigest,
    ) {
        val token = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency (
              id, platform_admin_user_id, command_type, target_type, target_id,
              canonical_schema_version, state, claim_token, receipt_type, receipt_id,
              created_at, updated_at, expires_at
            ) values (?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, null, null, ?, ?, ?)
            """.trimIndent(),
            claimId.toString(),
            ADMIN_ID.toString(),
            "club.create",
            "club",
            TARGET_ID.toString(),
            digest.schemaVersion,
            token.toString(),
            NOW.toDbTime(),
            NOW.toDbTime(),
            NOW.plus(Duration.ofMinutes(15)).toDbTime(),
        )
        insertDigestKeyState(digest.digestKeyVersion, NOW, null)
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency_keys (
              claim_id, platform_admin_user_id, command_type, target_type, target_id,
              digest_key_version, idempotency_key_hmac, request_hmac, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            claimId.toString(),
            ADMIN_ID.toString(),
            "club.create",
            "club",
            TARGET_ID.toString(),
            digest.digestKeyVersion,
            digest.idempotencyKeyHmac,
            digest.requestHmac,
            NOW.toDbTime(),
        )
    }

    private fun insertDigestKeyState(
        version: Int,
        lastReferencedAt: Instant,
        unreferencedSince: Instant?,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            ) values (?, ?, ?)
            on duplicate key update
              last_referenced_at = values(last_referenced_at),
              unreferenced_since = values(unreferenced_since)
            """.trimIndent(),
            version,
            lastReferencedAt.toDbTime(),
            unreferencedSince?.toDbTime(),
        )
    }

    private fun insertAlias(
        claimId: UUID,
        digest: AdminCommandDigest,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency_keys (
              claim_id, platform_admin_user_id, command_type, target_type, target_id,
              digest_key_version, idempotency_key_hmac, request_hmac, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            claimId.toString(),
            ADMIN_ID.toString(),
            "club.create",
            "club",
            TARGET_ID.toString(),
            digest.digestKeyVersion,
            digest.idempotencyKeyHmac,
            digest.requestHmac,
            NOW.toDbTime(),
        )
    }

    private fun insertDomainEvidence(receiptId: String) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (
              id, actor_user_id, actor_platform_role, target_user_id,
              event_type, metadata_json, created_at
            ) values (?, null, null, null, ?, json_object('fixture', true), ?)
            """.trimIndent(),
            receiptId,
            DOMAIN_EVENT_TYPE,
            clock.instant.toDbTime(),
        )
    }

    private fun claimCount(): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from platform_admin_command_idempotency where platform_admin_user_id = ?",
            Int::class.java,
            ADMIN_ID.toString(),
        ) ?: 0

    private fun aliasVersions(): List<Int> =
        jdbcTemplate
            .queryForList(
                """
                select digest_key_version
                from platform_admin_command_idempotency_keys
                where platform_admin_user_id = ?
                order by digest_key_version
                """.trimIndent(),
                Int::class.java,
                ADMIN_ID.toString(),
            ).filterNotNull()

    private fun aliasClaimIds(): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select claim_id
                from platform_admin_command_idempotency_keys
                where platform_admin_user_id = ?
                order by digest_key_version
                """.trimIndent(),
                String::class.java,
                ADMIN_ID.toString(),
            ).filterNotNull()

    private fun digestKeyStates(): Map<Int, DigestKeyState> =
        jdbcTemplate
            .query(
                """
                select digest_key_version, last_referenced_at, unreferenced_since
                from platform_admin_command_digest_key_state
                where digest_key_version in (?, ?, ?)
                order by digest_key_version
                """.trimIndent(),
                { rs, _ ->
                    rs.getInt("digest_key_version") to
                        DigestKeyState(
                            lastReferencedAt =
                                rs.getObject("last_referenced_at", LocalDateTime::class.java).toInstant(),
                            unreferencedSince =
                                rs.getObject("unreferenced_since", LocalDateTime::class.java)?.toInstant(),
                        )
                },
                V1,
                V2,
                V3,
            ).toMap()

    private fun domainEvidenceCount(receiptId: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from platform_audit_events where id = ? and event_type = ?",
            Int::class.java,
            receiptId,
            DOMAIN_EVENT_TYPE,
        ) ?: 0

    private fun claimState(): String =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select state from platform_admin_command_idempotency where platform_admin_user_id = ?",
                String::class.java,
                ADMIN_ID.toString(),
            ),
        )

    private fun receiptId(): String? =
        jdbcTemplate.queryForObject(
            "select receipt_id from platform_admin_command_idempotency where platform_admin_user_id = ?",
            String::class.java,
            ADMIN_ID.toString(),
        )

    private fun expiresAt(): Instant =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select expires_at from platform_admin_command_idempotency where platform_admin_user_id = ?",
                LocalDateTime::class.java,
                ADMIN_ID.toString(),
            ),
        ).toInstant()

    private fun storedTargetId(): String =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select target_id from platform_admin_command_idempotency where platform_admin_user_id = ?",
                String::class.java,
                ADMIN_ID.toString(),
            ),
        )

    private fun storedCommandType(): String =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select command_type from platform_admin_command_idempotency where platform_admin_user_id = ?",
                String::class.java,
                ADMIN_ID.toString(),
            ),
        )

    private fun storedTargetType(): String =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select target_type from platform_admin_command_idempotency where platform_admin_user_id = ?",
                String::class.java,
                ADMIN_ID.toString(),
            ),
        )

    private fun <T : Any> inTransaction(block: () -> T): T = requireNotNull(transactionTemplate.execute { block() })

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T00:00:00Z")
        val ADMIN_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000057001")
        val TARGET_ID: UUID = UUID.fromString("aaaaaaaa-0000-4000-8000-000000057002")
        const val V1 = 5701
        const val V2 = 5702
        const val V3 = 5703
        const val IDEMPOTENCY_KEY = "admin-command-key-5701"
        const val RECEIPT_TYPE = "platform-audit-event"
        const val DOMAIN_EVENT_TYPE = "ADMIN_COMMAND_TASK3_TEST"

        fun key(version: Int): String = "test-admin-command-key-$version"
    }
}

private data class FixtureRequest(
    private val reason: String,
) : CanonicalAdminCommandRequest {
    override val schemaVersion: String = "club-create:v1"

    override fun canonicalFields(): List<Pair<String, String>> = listOf("reason" to reason)
}

private data class DigestKeyState(
    val lastReferencedAt: Instant,
    val unreferencedSince: Instant?,
)

private class MutableClock(
    var instant: Instant,
) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant = instant
}

private class BlockingKeyStateJdbcTemplate(
    dataSource: DataSource,
    private val reachedReservation: CountDownLatch,
    private val releaseReservation: CountDownLatch,
) : JdbcTemplate(dataSource) {
    private val blocked = AtomicBoolean()

    override fun update(
        sql: String,
        vararg args: Any?,
    ): Int {
        if (
            sql.contains("insert into platform_admin_command_digest_key_state") &&
            blocked.compareAndSet(false, true)
        ) {
            reachedReservation.countDown()
            check(releaseReservation.await(10, TimeUnit.SECONDS))
        }
        return super.update(sql, *args)
    }
}

private fun ByteArray.flipped(): ByteArray =
    copyOf().also { copy ->
        copy[0] = (copy[0].toInt() xor 1).toByte()
    }

private fun Instant.toDbTime(): LocalDateTime = atOffset(ZoneOffset.UTC).toLocalDateTime()

private fun LocalDateTime.toInstant(): Instant = atOffset(ZoneOffset.UTC).toInstant()

private const val CLEANUP_ADMIN_COMMAND_SQL = """
delete from platform_audit_events where event_type = 'ADMIN_COMMAND_TASK3_TEST';
delete from platform_admin_command_idempotency_keys
where platform_admin_user_id = 'aaaaaaaa-0000-4000-8000-000000057001';
delete from platform_admin_command_idempotency
where platform_admin_user_id = 'aaaaaaaa-0000-4000-8000-000000057001';
delete from platform_admin_command_digest_key_state
where digest_key_version in (5701, 5702, 5703);
"""
