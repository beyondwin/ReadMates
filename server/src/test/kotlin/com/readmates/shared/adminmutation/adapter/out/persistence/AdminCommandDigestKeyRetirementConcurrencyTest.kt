package com.readmates.shared.adminmutation.adapter.out.persistence

import com.readmates.shared.adminmutation.adapter.out.observability.AdminCommandMetrics
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirement
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirementOutcome
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.port.out.AdminCommandIdempotencyPort
import com.readmates.shared.adminmutation.application.service.AdminCommandDigestKeyRetirementService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyMaintenanceService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.adminmutation.config.AdminCommandIdentityProperties
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
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
@Sql(statements = [CLEANUP_TASK4_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_TASK4_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class AdminCommandDigestKeyRetirementConcurrencyTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @Autowired transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val transactions = TransactionTemplate(transactionManager)
    private val clock = Task4MutableClock(NOW)
    private val adapter = JdbcAdminCommandIdempotencyAdapter(jdbcTemplate)
    private val meterRegistry = SimpleMeterRegistry()
    private val metrics = AdminCommandMetrics(meterRegistry)
    private val idempotencyProperties = AdminCommandIdempotencyProperties()

    @Test
    fun `purge removes only a bounded expired completed batch and preserves receipts`() {
        val receiptId = UUID.randomUUID().toString()
        insertAuditReceipt(receiptId)
        insertClaim("01", "COMPLETED", NOW.minusSeconds(1), receiptId)
        insertClaim("02", "COMPLETED", NOW.minusSeconds(1), UUID.randomUUID().toString())
        insertClaim("03", "IN_PROGRESS", NOW.minusSeconds(1), null)
        insertClaim("04", "COMPLETED", NOW.plusSeconds(1), UUID.randomUUID().toString())
        val identityProperties = identityProperties(V2, V1, previousKeyConfigured = false)
        val retirement = retirementService()
        val maintenance =
            AdminCommandIdempotencyMaintenanceService(
                adapter,
                idempotencyProperties,
                clock,
                metrics,
                identityProperties,
                retirement,
            )

        val purged = inTransaction { maintenance.purgeExpired(1) }

        assertThat(purged).isEqualTo(1)
        assertThat(count("platform_admin_command_idempotency", "state = 'IN_PROGRESS'")).isEqualTo(1)
        assertThat(count("platform_admin_command_idempotency", "state = 'COMPLETED'")).isEqualTo(2)
        assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isEqualTo(3)
        assertThat(count("platform_audit_events", "id = '$receiptId'")).isEqualTo(1)
    }

    @Test
    fun `production purge starts and retains previous key buffer when aliases reach zero`() {
        insertClaim("05", "COMPLETED", NOW.minusSeconds(1), UUID.randomUUID().toString())
        val identityProperties = identityProperties(V2, V1, previousKeyConfigured = true)
        val maintenance =
            AdminCommandIdempotencyMaintenanceService(
                adapter,
                idempotencyProperties,
                clock,
                metrics,
                identityProperties,
                retirementService(),
            )

        assertThat(inTransaction { maintenance.purgeExpired(100) }).isEqualTo(1)
        val startedAt = unreferencedSince(V1)
        assertThat(startedAt).isEqualTo(NOW.toDbTime4())
        assertThat(
            meterRegistry
                .find("admin.command.digest-key-retirement")
                .tag("outcome", "buffer_pending")
                .counter()
                ?.count(),
        ).isEqualTo(1.0)

        clock.instantValue = NOW.plus(Duration.ofHours(1))
        assertThat(inTransaction { maintenance.purgeExpired(100) }).isZero()
        assertThat(unreferencedSince(V1)).isEqualTo(startedAt)
    }

    @Test
    @Timeout(30)
    fun `claim lock first makes retirement observe referenced alias`() {
        val claimLocked = CountDownLatch(1)
        val releaseClaim = CountDownLatch(1)
        val retirementStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val claim =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        commandService(V1).claim(identity(), request()).also {
                            claimLocked.countDown()
                            check(releaseClaim.await(10, TimeUnit.SECONDS))
                        }
                    }
                }
            assertThat(claimLocked.await(10, TimeUnit.SECONDS)).isTrue()
            val retirement =
                executor.submit<AdminCommandDigestKeyRetirement> {
                    inTransaction {
                        retirementStarted.countDown()
                        retirementService().assess(V1)
                    }
                }
            assertThat(retirementStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(retirement.isDone).isFalse()
            releaseClaim.countDown()

            assertThat(claim.get(10, TimeUnit.SECONDS)).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
            assertThat(retirement.get(10, TimeUnit.SECONDS).outcome)
                .isEqualTo(AdminCommandDigestKeyRetirementOutcome.REFERENCED)
        } finally {
            releaseClaim.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    @Timeout(30)
    fun `retirement lock first is invalidated when an authorized claim creates its alias`() {
        val retirementLocked = CountDownLatch(1)
        val releaseRetirement = CountDownLatch(1)
        val claimStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val retirement =
                executor.submit<AdminCommandDigestKeyRetirement> {
                    inTransaction {
                        retirementService().assess(V1).also {
                            retirementLocked.countDown()
                            check(releaseRetirement.await(10, TimeUnit.SECONDS))
                        }
                    }
                }
            assertThat(retirementLocked.await(10, TimeUnit.SECONDS)).isTrue()
            val claim =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        claimStarted.countDown()
                        commandService(V1).claim(identity(), request())
                    }
                }
            assertThat(claimStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(claim.isDone).isFalse()
            releaseRetirement.countDown()

            assertThat(retirement.get(10, TimeUnit.SECONDS).outcome)
                .isEqualTo(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)
            assertThat(claim.get(10, TimeUnit.SECONDS)).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
            assertThat(unreferencedSince(V1)).isNull()
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isEqualTo(1)
        } finally {
            releaseRetirement.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    @Timeout(30)
    fun `claim lock first makes scheduled maintenance wait and retain referenced key state`() {
        val claimLocked = CountDownLatch(1)
        val releaseClaim = CountDownLatch(1)
        val maintenanceStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val claim =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        commandService(V1).claim(identity(), request()).also {
                            claimLocked.countDown()
                            check(releaseClaim.await(10, TimeUnit.SECONDS))
                        }
                    }
                }
            assertThat(claimLocked.await(10, TimeUnit.SECONDS)).isTrue()

            val maintenance =
                executor.submit<Int> {
                    inTransaction {
                        maintenanceStarted.countDown()
                        maintenanceService(
                            adapter,
                            identityProperties(V2, V1, previousKeyConfigured = true),
                        ).purgeExpired(100)
                    }
                }
            assertThat(maintenanceStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(maintenance.isDone).isFalse()
            releaseClaim.countDown()

            assertThat(claim.get(10, TimeUnit.SECONDS)).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
            assertThat(maintenance.get(10, TimeUnit.SECONDS)).isZero()
            assertThat(unreferencedSince(V1)).isNull()
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isEqualTo(1)
        } finally {
            releaseClaim.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    @Timeout(30)
    fun `scheduled maintenance lock first makes claim wait then claim clears retirement buffer`() {
        val maintenanceLocked = CountDownLatch(1)
        val releaseMaintenance = CountDownLatch(1)
        val claimStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val blockingPort =
            BlockingMaintenancePort(
                adapter,
                maintenanceLocked,
                releaseMaintenance,
            )
        try {
            val maintenance =
                executor.submit<Int> {
                    inTransaction {
                        maintenanceService(
                            blockingPort,
                            identityProperties(V2, V1, previousKeyConfigured = true),
                        ).purgeExpired(100)
                    }
                }
            assertThat(maintenanceLocked.await(10, TimeUnit.SECONDS)).isTrue()

            val claim =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        claimStarted.countDown()
                        commandService(V1).claim(identity(), request())
                    }
                }
            assertThat(claimStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(claim.isDone).isFalse()
            releaseMaintenance.countDown()

            assertThat(maintenance.get(10, TimeUnit.SECONDS)).isZero()
            assertThat(claim.get(10, TimeUnit.SECONDS)).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
            assertThat(unreferencedSince(V1)).isNull()
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isEqualTo(1)
        } finally {
            releaseMaintenance.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    @Timeout(30)
    fun `scheduled maintenance serializes an expired replay before current alias backfill`() {
        val receiptId = UUID.randomUUID().toString()
        insertAuditReceipt(receiptId)
        val first =
            inTransaction {
                commandService(V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
            }
        inTransaction {
            check(
                commandService(V1).complete(
                    claimId = first.claimId,
                    claimToken = first.claimToken,
                    receiptType = "platform-audit-event",
                    receiptId = receiptId,
                ),
            )
        }
        clock.instantValue = NOW.plus(Duration.ofDays(8))

        val identityProperties = identityProperties(V2, V1, previousKeyConfigured = true)
        val maintenanceLocked = CountDownLatch(1)
        val releaseMaintenance = CountDownLatch(1)
        val replayStarted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val blockingPort =
            BlockingMaintenancePort(
                adapter,
                maintenanceLocked,
                releaseMaintenance,
            )
        try {
            val maintenance =
                executor.submit<Int> {
                    inTransaction {
                        maintenanceService(blockingPort, identityProperties).purgeExpired(100)
                    }
                }
            assertThat(maintenanceLocked.await(10, TimeUnit.SECONDS)).isTrue()

            val replay =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        replayStarted.countDown()
                        commandService(identityProperties).claim(identity(), request())
                    }
                }
            assertThat(replayStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(replay.isDone).isFalse()
            releaseMaintenance.countDown()

            assertThat(maintenance.get(10, TimeUnit.SECONDS)).isEqualTo(1)
            assertThat(replay.get(10, TimeUnit.SECONDS)).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isZero()
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V2")).isEqualTo(1)
            assertThat(count("platform_audit_events", "id = '$receiptId'")).isEqualTo(1)
        } finally {
            releaseMaintenance.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    @Timeout(30)
    fun `expired replay locks key state before claim and makes scheduled maintenance wait`() {
        val receiptId = UUID.randomUUID().toString()
        insertAuditReceipt(receiptId)
        val first =
            inTransaction {
                commandService(V1).claim(identity(), request()) as AdminCommandClaimResult.Claimed
            }
        inTransaction {
            check(
                commandService(V1).complete(
                    claimId = first.claimId,
                    claimToken = first.claimToken,
                    receiptType = "platform-audit-event",
                    receiptId = receiptId,
                ),
            )
        }
        clock.instantValue = NOW.plus(Duration.ofDays(8))

        val identityProperties = identityProperties(V2, V1, previousKeyConfigured = true)
        val replayStateLocked = CountDownLatch(1)
        val releaseReplay = CountDownLatch(1)
        val maintenanceStarted = CountDownLatch(1)
        val maintenanceLocked = CountDownLatch(1)
        val releaseMaintenance = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val replayAdapter =
            JdbcAdminCommandIdempotencyAdapter(
                StateLockObservingJdbcTemplate(
                    requireNotNull(jdbcTemplate.dataSource),
                    replayStateLocked,
                    releaseReplay,
                ),
            )
        val blockingMaintenancePort =
            BlockingMaintenancePort(
                adapter,
                maintenanceLocked,
                releaseMaintenance,
            )
        try {
            val replay =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        commandService(identityProperties, replayAdapter).claim(identity(), request())
                    }
                }
            assertThat(replayStateLocked.await(10, TimeUnit.SECONDS)).isTrue()
            assertClaimAndAliasAreUnlocked(first.claimId)

            val maintenance =
                executor.submit<Int> {
                    inTransaction {
                        maintenanceStarted.countDown()
                        maintenanceService(blockingMaintenancePort, identityProperties).purgeExpired(100)
                    }
                }
            assertThat(maintenanceStarted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(maintenanceLocked.await(250, TimeUnit.MILLISECONDS)).isFalse()
            assertThat(maintenance.isDone).isFalse()
            releaseReplay.countDown()

            assertThat(maintenanceLocked.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(replay.get(10, TimeUnit.SECONDS))
                .isEqualTo(AdminCommandClaimResult.Completed("platform-audit-event", receiptId))
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V2")).isEqualTo(1)
            releaseMaintenance.countDown()

            assertThat(maintenance.get(10, TimeUnit.SECONDS)).isEqualTo(1)
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version in ($V1, $V2)")).isZero()
            assertThat(count("platform_audit_events", "id = '$receiptId'")).isEqualTo(1)
        } finally {
            releaseReplay.countDown()
            releaseMaintenance.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    @Timeout(30)
    fun `drain mode duplicate loser and maintenance preserve global key state order`() {
        assertThat(inTransaction { retirementService().assess(V1) }.outcome)
            .isEqualTo(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)
        val identityProperties = identityProperties(V2, V1, previousKeyConfigured = true)
        val emptyLookupComplete = CountDownLatch(1)
        val releaseEmptyLookup = CountDownLatch(1)
        val duplicateDetected = CountDownLatch(1)
        val releaseDuplicate = CountDownLatch(1)
        val maintenanceStateLockAttempted = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        val loserAdapter =
            JdbcAdminCommandIdempotencyAdapter(
                DuplicateLoserJdbcTemplate(
                    requireNotNull(jdbcTemplate.dataSource),
                    emptyLookupComplete,
                    releaseEmptyLookup,
                    duplicateDetected,
                    releaseDuplicate,
                ),
            )
        val maintenanceAdapter =
            JdbcAdminCommandIdempotencyAdapter(
                MaintenanceStateLockObservingJdbcTemplate(
                    requireNotNull(jdbcTemplate.dataSource),
                    maintenanceStateLockAttempted,
                ),
            )
        try {
            val loser =
                executor.submit<AdminCommandClaimResult> {
                    inTransaction {
                        commandService(identityProperties, loserAdapter).claim(identity(), request())
                    }
                }
            assertThat(emptyLookupComplete.await(10, TimeUnit.SECONDS)).isTrue()
            val winner =
                inTransaction {
                    commandService(identityProperties).claim(identity(), request())
                }
            assertThat(winner).isInstanceOf(AdminCommandClaimResult.Claimed::class.java)
            releaseEmptyLookup.countDown()
            assertThat(duplicateDetected.await(10, TimeUnit.SECONDS)).isTrue()

            val maintenance =
                executor.submit<Int> {
                    inTransaction {
                        maintenanceService(maintenanceAdapter, identityProperties).purgeExpired(100)
                    }
                }
            assertThat(maintenanceStateLockAttempted.await(10, TimeUnit.SECONDS)).isTrue()
            assertThat(maintenance.isDone).isFalse()
            releaseDuplicate.countDown()

            assertThat(loser.get(10, TimeUnit.SECONDS)).isEqualTo(AdminCommandClaimResult.InProgress)
            assertThat(maintenance.get(10, TimeUnit.SECONDS)).isZero()
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isZero()
            assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V2")).isEqualTo(1)
        } finally {
            releaseEmptyLookup.countDown()
            releaseDuplicate.countDown()
            executor.shutdownNow()
        }
    }

    @Test
    fun `drain mode writes only current alias before previous key becomes removable`() {
        val identityProperties = identityProperties(V2, V1, previousKeyConfigured = true, writePreviousAlias = false)

        inTransaction {
            commandService(identityProperties).claim(identity(), request())
        }
        val versions =
            AdminCommandIdentityService(identityProperties)
                .digests(identity(), request())

        assertThat(versions.lookupCandidates.map { it.digestKeyVersion }).containsExactly(V1, V2)
        assertThat(versions.aliasCandidates.map { it.digestKeyVersion }).containsExactly(V2)
        assertThat(count("platform_admin_command_idempotency_keys", "digest_key_version = $V1")).isZero()
        assertThat(inTransaction { retirementService().assess(V1) }.outcome)
            .isEqualTo(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)

        clock.instantValue = NOW.plus(Duration.ofHours(24))
        assertThat(inTransaction { retirementService().assess(V1) }.outcome)
            .isEqualTo(AdminCommandDigestKeyRetirementOutcome.REMOVABLE)
    }

    @Test
    fun `dual write overlap invalidates an aged zero alias buffer and drain starts a fresh buffer`() {
        assertThat(inTransaction { retirementService().assess(V1) }.outcome)
            .isEqualTo(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)
        clock.instantValue = NOW.plus(Duration.ofHours(24))

        val overlap = identityProperties(V2, V1, previousKeyConfigured = true, writePreviousAlias = true)
        assertThat(inTransaction { maintenanceService(adapter, overlap).purgeExpired(100) }).isZero()
        assertThat(unreferencedSince(V1)).isNull()

        val drain = identityProperties(V2, V1, previousKeyConfigured = true, writePreviousAlias = false)
        assertThat(inTransaction { maintenanceService(adapter, drain).purgeExpired(100) }).isZero()
        val drainStartedAt = NOW.plus(Duration.ofHours(24)).toDbTime4()
        assertThat(unreferencedSince(V1)).isEqualTo(drainStartedAt)

        clock.instantValue = NOW.plus(Duration.ofHours(47))
        assertThat(inTransaction { retirementService().assess(V1) }.outcome)
            .isEqualTo(AdminCommandDigestKeyRetirementOutcome.BUFFER_PENDING)
        clock.instantValue = NOW.plus(Duration.ofHours(48))
        assertThat(inTransaction { retirementService().assess(V1) }.outcome)
            .isEqualTo(AdminCommandDigestKeyRetirementOutcome.REMOVABLE)
    }

    private fun commandService(currentVersion: Int): AdminCommandIdempotencyService =
        commandService(identityProperties(currentVersion, 0, previousKeyConfigured = false))

    private fun commandService(
        properties: AdminCommandIdentityProperties,
        port: AdminCommandIdempotencyPort = adapter,
    ) = AdminCommandIdempotencyService(
        AdminCommandIdentityService(properties),
        port,
        idempotencyProperties,
        clock,
        metrics,
    )

    private fun retirementService(port: AdminCommandIdempotencyPort = adapter) =
        AdminCommandDigestKeyRetirementService(port, idempotencyProperties, clock, metrics)

    private fun maintenanceService(
        port: AdminCommandIdempotencyPort,
        identityProperties: AdminCommandIdentityProperties,
    ) = AdminCommandIdempotencyMaintenanceService(
        port,
        idempotencyProperties,
        clock,
        metrics,
        identityProperties,
        retirementService(port),
    )

    private fun identityProperties(
        currentVersion: Int,
        previousVersion: Int,
        previousKeyConfigured: Boolean,
        writePreviousAlias: Boolean = false,
    ) = AdminCommandIdentityProperties(
        currentKey = key(currentVersion),
        currentKeyVersion = currentVersion,
        previousKey = if (previousKeyConfigured) key(previousVersion) else "",
        previousKeyVersion = previousVersion,
        writePreviousAlias = writePreviousAlias,
    )

    private fun identity() =
        PlatformAdminCommandIdentity(
            platformAdminUserId = ADMIN_ID,
            commandType = "club.create",
            targetType = "club",
            targetId = TARGET_ID.toString(),
            idempotencyKey = "task4-admin-command-key",
        )

    private fun request() =
        object : CanonicalAdminCommandRequest {
            override val schemaVersion: String = "club-create:v1"

            override fun canonicalFields(): List<Pair<String, String>> = listOf("fixture" to "task4")
        }

    private fun insertClaim(
        suffix: String,
        state: String,
        expiresAt: Instant,
        receiptId: String?,
    ) {
        val claimId = "bbbbbbbb-0000-4000-8000-0000000580$suffix"
        val createdAt = NOW.minus(Duration.ofDays(2))
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency (
              id, platform_admin_user_id, command_type, target_type, target_id,
              canonical_schema_version, state, claim_token, receipt_type, receipt_id,
              created_at, updated_at, expires_at
            ) values (?, ?, 'club.create', 'club', ?, 'club-create:v1', ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            claimId,
            ADMIN_ID.toString(),
            TARGET_ID.toString(),
            state,
            UUID.randomUUID().toString(),
            if (state == "COMPLETED") "platform-audit-event" else null,
            if (state == "COMPLETED") receiptId else null,
            createdAt.toDbTime4(),
            createdAt.toDbTime4(),
            expiresAt.toDbTime4(),
        )
        jdbcTemplate.update(
            """
            insert into platform_admin_command_digest_key_state
              (digest_key_version, last_referenced_at, unreferenced_since)
            values (?, ?, null)
            on duplicate key update last_referenced_at = greatest(last_referenced_at, values(last_referenced_at))
            """.trimIndent(),
            V1,
            createdAt.toDbTime4(),
        )
        jdbcTemplate.update(
            """
            insert into platform_admin_command_idempotency_keys (
              claim_id, platform_admin_user_id, command_type, target_type, target_id,
              digest_key_version, idempotency_key_hmac, request_hmac, created_at
            ) values (?, ?, 'club.create', 'club', ?, ?, ?, ?, ?)
            """.trimIndent(),
            claimId,
            ADMIN_ID.toString(),
            TARGET_ID.toString(),
            V1,
            ByteArray(32) { suffix.last().code.toByte() },
            ByteArray(32) { (suffix.last().code + 1).toByte() },
            createdAt.toDbTime4(),
        )
    }

    private fun insertAuditReceipt(receiptId: String) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (
              id, actor_user_id, actor_platform_role, target_user_id,
              event_type, metadata_json, created_at
            ) values (?, null, null, null, 'ADMIN_COMMAND_TASK4_TEST', json_object('fixture', true), ?)
            """.trimIndent(),
            receiptId,
            NOW.toDbTime4(),
        )
    }

    private fun count(
        table: String,
        predicate: String,
    ): Int = jdbcTemplate.queryForObject("select count(*) from $table where $predicate", Int::class.java) ?: 0

    private fun unreferencedSince(version: Int): LocalDateTime? =
        jdbcTemplate.queryForObject(
            "select unreferenced_since from platform_admin_command_digest_key_state where digest_key_version = ?",
            LocalDateTime::class.java,
            version,
        )

    private fun assertClaimAndAliasAreUnlocked(claimId: UUID) {
        inTransaction {
            assertThat(
                jdbcTemplate.queryForObject(
                    "select id from platform_admin_command_idempotency where id = ? for update nowait",
                    String::class.java,
                    claimId.toString(),
                ),
            ).isEqualTo(claimId.toString())
            assertThat(
                jdbcTemplate.queryForObject(
                    "select claim_id from platform_admin_command_idempotency_keys where claim_id = ? for update nowait",
                    String::class.java,
                    claimId.toString(),
                ),
            ).isEqualTo(claimId.toString())
            true
        }
    }

    private fun <T : Any> inTransaction(block: () -> T): T = requireNotNull(transactions.execute { block() })

    private companion object {
        val NOW: Instant = Instant.parse("2026-08-24T00:00:00Z")
        val ADMIN_ID: UUID = UUID.fromString("bbbbbbbb-0000-4000-8000-000000058001")
        val TARGET_ID: UUID = UUID.fromString("bbbbbbbb-0000-4000-8000-000000058002")
        const val V1 = 5801
        const val V2 = 5802

        fun key(version: Int) = "test-admin-command-task4-key-$version"
    }
}

private class Task4MutableClock(
    var instantValue: Instant,
) : Clock() {
    override fun getZone(): ZoneId = ZoneOffset.UTC

    override fun withZone(zone: ZoneId): Clock = this

    override fun instant(): Instant = instantValue
}

private class BlockingMaintenancePort(
    private val delegate: AdminCommandIdempotencyPort,
    private val locked: CountDownLatch,
    private val release: CountDownLatch,
) : AdminCommandIdempotencyPort by delegate {
    override fun lockDigestKeyStatesForMaintenance() {
        delegate.lockDigestKeyStatesForMaintenance()
        locked.countDown()
        check(release.await(10, TimeUnit.SECONDS))
    }
}

private class StateLockObservingJdbcTemplate(
    dataSource: DataSource,
    private val locked: CountDownLatch,
    private val release: CountDownLatch,
) : JdbcTemplate(dataSource) {
    private val observed = AtomicBoolean()

    override fun <T : Any?> query(
        sql: String,
        rowMapper: RowMapper<T>,
        vararg args: Any?,
    ): MutableList<T> {
        val rows = super.query(sql, rowMapper, *args)
        if (
            sql.contains("from platform_admin_command_digest_key_state") &&
            sql.contains("for update") &&
            observed.compareAndSet(false, true)
        ) {
            locked.countDown()
            check(release.await(10, TimeUnit.SECONDS))
        }
        return rows
    }
}

private class MaintenanceStateLockObservingJdbcTemplate(
    dataSource: DataSource,
    private val attempted: CountDownLatch,
) : JdbcTemplate(dataSource) {
    private val observed = AtomicBoolean()

    override fun <T : Any?> query(
        sql: String,
        rowMapper: RowMapper<T>,
        vararg args: Any?,
    ): MutableList<T> {
        if (
            sql.contains("from platform_admin_command_digest_key_state") &&
            sql.contains("for update") &&
            !sql.contains("where digest_key_version") &&
            observed.compareAndSet(false, true)
        ) {
            attempted.countDown()
        }
        return super.query(sql, rowMapper, *args)
    }
}

private class DuplicateLoserJdbcTemplate(
    dataSource: DataSource,
    private val emptyLookupComplete: CountDownLatch,
    private val releaseEmptyLookup: CountDownLatch,
    private val duplicateDetected: CountDownLatch,
    private val releaseDuplicate: CountDownLatch,
) : JdbcTemplate(dataSource) {
    private val lookupObserved = AtomicBoolean()
    private val duplicateObserved = AtomicBoolean()

    override fun <T : Any?> query(
        sql: String,
        rowMapper: RowMapper<T>,
        vararg args: Any?,
    ): MutableList<T> {
        val rows = super.query(sql, rowMapper, *args)
        if (
            sql.contains("from platform_admin_command_idempotency_keys") &&
            !sql.contains("for update") &&
            lookupObserved.compareAndSet(false, true)
        ) {
            check(rows.isEmpty())
            emptyLookupComplete.countDown()
            check(releaseEmptyLookup.await(10, TimeUnit.SECONDS))
        }
        return rows
    }

    override fun update(
        sql: String,
        vararg args: Any?,
    ): Int =
        try {
            super.update(sql, *args)
        } catch (failure: DuplicateKeyException) {
            if (
                sql.contains("insert into platform_admin_command_idempotency_keys") &&
                duplicateObserved.compareAndSet(false, true)
            ) {
                duplicateDetected.countDown()
                check(releaseDuplicate.await(10, TimeUnit.SECONDS))
            }
            throw failure
        }
}

private fun Instant.toDbTime4(): LocalDateTime = atOffset(ZoneOffset.UTC).toLocalDateTime()

private const val CLEANUP_TASK4_SQL = """
delete from platform_audit_events where event_type = 'ADMIN_COMMAND_TASK4_TEST';
delete from platform_admin_command_idempotency_keys
where platform_admin_user_id = 'bbbbbbbb-0000-4000-8000-000000058001';
delete from platform_admin_command_idempotency
where platform_admin_user_id = 'bbbbbbbb-0000-4000-8000-000000058001';
delete from platform_admin_command_digest_key_state
where digest_key_version in (5801, 5802);
"""
