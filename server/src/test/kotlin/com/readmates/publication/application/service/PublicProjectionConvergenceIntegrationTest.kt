package com.readmates.publication.application.service

import com.readmates.publication.application.model.ClaimPublicConvergenceWorkCommand
import com.readmates.publication.application.model.CompletePublicConvergenceAttemptCommand
import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceProcessResult
import com.readmates.publication.application.port.`in`.MaintainPublicConvergenceWorkUseCase
import com.readmates.publication.application.port.out.ProviderAttemptResult
import com.readmates.publication.application.port.out.ProviderFailureCategory
import com.readmates.publication.application.port.out.ProviderSuccessCategory
import com.readmates.publication.application.port.out.PublicCachePurgeCommand
import com.readmates.publication.application.port.out.PublicCachePurgePort
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.publication.config.PublicConvergenceProperties
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.parallel.Execution
import org.junit.jupiter.api.parallel.ExecutionMode
import org.junit.jupiter.api.parallel.Isolated
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.Clock
import java.time.LocalDateTime
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.public-convergence.enabled=true",
        "readmates.public-convergence.scheduler.enabled=false",
        "readmates.public-convergence.provider.http-enabled=false",
        "readmates.public-convergence.lease-duration=30s",
        "readmates.public-convergence.max-attempts=3",
        "readmates.public-convergence.initial-backoff=1m",
        "readmates.public-convergence.max-backoff=4m",
        "readmates.public-convergence.maintenance.retention=1h",
        "readmates.public-convergence.maintenance.batch-size=2",
    ],
)
@AutoConfigureMockMvc
@Import(PublicProjectionConvergenceIntegrationTest.FakeProviderConfig::class)
@Tag("integration")
@Execution(ExecutionMode.SAME_THREAD)
@Isolated("uses the production-global public convergence work queue and a shared provider fake")
class PublicProjectionConvergenceIntegrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val service: PublicConvergenceService,
    @param:Autowired private val maintenance: MaintainPublicConvergenceWorkUseCase,
    @param:Autowired private val convergencePort: PublicConvergencePort,
    @param:Autowired private val purgePort: RecordingPublicCachePurgePort,
    @param:Autowired private val properties: PublicConvergenceProperties,
    @param:Autowired private val meterRegistry: MeterRegistry,
    @param:Autowired private val clock: Clock,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdConvergenceIds = mutableListOf<UUID>()
    private var suspendedWork = emptyList<SuspendedWork>()

    @BeforeEach
    fun resetProvider() {
        suspendedWork =
            jdbcTemplate.query(
                "select convergence_id, available_at, created_at from public_convergence_work",
            ) { resultSet, _ ->
                SuspendedWork(
                    convergenceId = resultSet.getString("convergence_id"),
                    availableAt = resultSet.getObject("available_at", LocalDateTime::class.java),
                    createdAt = resultSet.getObject("created_at", LocalDateTime::class.java),
                )
            }
        suspendedWork.forEach { work ->
            jdbcTemplate.update(
                """
                update public_convergence_work
                set available_at = '2100-01-01 00:00:00.000000',
                    created_at = '2100-01-01 00:00:00.000000'
                where convergence_id = ?
                """.trimIndent(),
                work.convergenceId,
            )
        }
        purgePort.reset()
    }

    @AfterEach
    fun cleanup() {
        runFixtureCleanup(
            deleteOwnedRows = {
                createdConvergenceIds.forEach { convergenceId ->
                    jdbcTemplate.update(
                        "delete from public_convergence_events where convergence_id = ?",
                        convergenceId.toString(),
                    )
                    jdbcTemplate.update(
                        "delete from public_convergence_work where convergence_id = ?",
                        convergenceId.toString(),
                    )
                    jdbcTemplate.update(
                        "delete from public_mutation_convergence_receipts where convergence_id = ?",
                        convergenceId.toString(),
                    )
                }
                createdConvergenceIds.clear()
            },
            restoreSuspendedRows = {
                suspendedWork.forEach { work ->
                    jdbcTemplate.update(
                        "update public_convergence_work set available_at = ?, created_at = ? where convergence_id = ?",
                        work.availableAt,
                        work.createdAt,
                        work.convergenceId,
                    )
                }
                suspendedWork = emptyList()
            },
        )
    }

    @Test
    fun `two workers claim once and provider observes committed pending outside a transaction`() {
        val fixture = insertWorkFixture()
        val enteredProvider = CountDownLatch(1)
        val releaseProvider = CountDownLatch(1)
        purgePort.beforeCall = {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse()
            assertThat(eventStatuses(fixture.convergenceId)).containsExactly("PENDING")
            enteredProvider.countDown()
            assertThat(releaseProvider.await(5, TimeUnit.SECONDS)).isTrue()
        }
        val executor = Executors.newFixedThreadPool(2)

        try {
            val first = executor.submit<PublicConvergenceProcessResult> { service.processOne("worker-a") }
            assertThat(enteredProvider.await(5, TimeUnit.SECONDS)).isTrue()
            val second = executor.submit<PublicConvergenceProcessResult> { service.processOne("worker-b") }

            assertThat(second.get(5, TimeUnit.SECONDS)).isEqualTo(PublicConvergenceProcessResult.NO_WORK)
            releaseProvider.countDown()
            assertThat(first.get(5, TimeUnit.SECONDS)).isEqualTo(PublicConvergenceProcessResult.PROCESSED)
        } finally {
            releaseProvider.countDown()
            executor.shutdownNow()
        }

        assertThat(eventStatuses(fixture.convergenceId)).containsExactly("PENDING", "SUCCEEDED")
        assertThat(purgePort.invocationTokens).containsExactly("public-convergence:${fixture.convergenceId}:1")
        assertThat(receiptRow(fixture.receiptId)).isEqualTo(fixture.receiptBefore)
    }

    @Test
    fun `terminal failure waits for backoff then retries with a higher attempt`() {
        val fixture = insertWorkFixture()
        purgePort.enqueue(ProviderAttemptResult.Failed(ProviderFailureCategory.TIMEOUT, retryable = true))
        purgePort.enqueue(ProviderAttemptResult.Succeeded(ProviderSuccessCategory.PURGED))

        assertThat(service.processOne("worker-retry")).isEqualTo(PublicConvergenceProcessResult.PROCESSED)
        assertThat(service.processOne("worker-too-early")).isEqualTo(PublicConvergenceProcessResult.NO_WORK)
        makeAvailable(fixture.convergenceId)
        assertThat(service.processOne("worker-retry")).isEqualTo(PublicConvergenceProcessResult.PROCESSED)

        assertThat(attempts(fixture.convergenceId)).containsExactly(
            "1:0:PENDING",
            "1:1:FAILED",
            "2:0:PENDING",
            "2:1:SUCCEEDED",
        )
        assertThat(purgePort.invocationTokens).containsExactly(
            "public-convergence:${fixture.convergenceId}:1",
            "public-convergence:${fixture.convergenceId}:2",
        )
        assertThat(receiptRow(fixture.receiptId)).isEqualTo(fixture.receiptBefore)
    }

    @Test
    fun `crash after provider success reclaims the same attempt and idempotency token`() {
        val fixture = insertWorkFixture()
        val crashingPort =
            object : PublicConvergencePort by convergencePort {
                override fun completeAttempt(command: CompletePublicConvergenceAttemptCommand): PublicConvergenceEvent =
                    error("synthetic crash after provider success")
            }
        val crashingService = PublicConvergenceService(crashingPort, purgePort, properties, meterRegistry, clock)

        assertThatThrownBy { crashingService.processOne("worker-crash") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("synthetic crash after provider success")
        assertThat(eventStatuses(fixture.convergenceId)).containsExactly("PENDING")
        expireLease(fixture.convergenceId)

        assertThat(service.processOne("worker-recovery")).isEqualTo(PublicConvergenceProcessResult.PROCESSED)
        assertThat(eventStatuses(fixture.convergenceId)).containsExactly("PENDING", "SUCCEEDED")
        assertThat(purgePort.invocationTokens).containsExactly(
            "public-convergence:${fixture.convergenceId}:1",
            "public-convergence:${fixture.convergenceId}:1",
        )
        assertThat(purgePort.logicalTokens).containsExactly("public-convergence:${fixture.convergenceId}:1")
    }

    @Test
    fun `worker cannot complete after its bounded lease expires`() {
        val fixture = insertWorkFixture()
        purgePort.beforeCall = { expireLease(fixture.convergenceId) }

        assertThatThrownBy { service.processOne("worker-expired") }
            .isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Public convergence completion does not own the active lease")

        assertThat(eventStatuses(fixture.convergenceId)).containsExactly("PENDING")
        assertThat(purgePort.invocationTokens).containsExactly("public-convergence:${fixture.convergenceId}:1")
    }

    @Test
    fun `max attempts stops retry and metrics use bounded tags`() {
        val fixture = insertWorkFixture()
        repeat(3) { attemptIndex ->
            purgePort.enqueue(ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true))
            assertThat(service.processOne("worker-max"))
                .describedAs("attempt ${attemptIndex + 1}")
                .isEqualTo(PublicConvergenceProcessResult.PROCESSED)
            makeAvailable(fixture.convergenceId)
        }

        assertThat(service.processOne("worker-exhausted")).isEqualTo(PublicConvergenceProcessResult.NO_WORK)
        assertThat(attempts(fixture.convergenceId)).hasSize(6)
        val attemptMeters = meterRegistry.find("readmates.public.convergence.attempts").meters()
        assertThat(attemptMeters).isNotEmpty
        assertThat(attemptMeters.flatMap { it.id.tags }.map { it.key }.toSet())
            .containsExactlyInAnyOrder("outcome")
        assertThat(attemptMeters.flatMap { it.id.tags }.map { it.value }.toSet())
            .allMatch { it in setOf("succeeded", "failed", "provider_exception") }
    }

    @Test
    fun `host status API separates committed origin result from provider convergence`() {
        val fixture = insertWorkFixture()

        mockMvc
            .get("/api/host/sessions/$BASELINE_SESSION_ID/publication/convergence/${fixture.receiptId}") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.convergenceId") { value(fixture.convergenceId.toString()) }
                jsonPath("$.originResult") { value("READABLE") }
                jsonPath("$.committedGeneration") { value(42) }
                jsonPath("$.status") { value("QUEUED") }
                jsonPath("$.retryable") { value(false) }
                jsonPath("$.providerError") { doesNotExist() }
                jsonPath("$.resultCategory") { doesNotExist() }
            }

        mockMvc
            .get("/api/host/sessions/$BASELINE_SESSION_ID/publication/convergence/${fixture.receiptId}") {
                with(user("member5@example.com"))
            }.andExpect { status { isForbidden() } }
        mockMvc
            .get("/api/host/sessions/${UUID.randomUUID()}/publication/convergence/${fixture.receiptId}") {
                with(user("host@example.com"))
            }.andExpect { status { isNotFound() } }

        purgePort.enqueue(ProviderAttemptResult.Failed(ProviderFailureCategory.TIMEOUT, retryable = true))
        assertThat(service.processOne("worker-api")).isEqualTo(PublicConvergenceProcessResult.PROCESSED)
        mockMvc
            .get("/api/host/sessions/$BASELINE_SESSION_ID/publication/convergence/${fixture.receiptId}") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.originResult") { value("READABLE") }
                jsonPath("$.status") { value("FAILED") }
                jsonPath("$.lastAttemptAt") { exists() }
                jsonPath("$.retryable") { value(true) }
                jsonPath("$.providerError") { doesNotExist() }
                jsonPath("$.resultCategory") { doesNotExist() }
            }
    }

    @Test
    fun `host status API keeps pending and succeeded attempts non-retryable`() {
        val fixture = insertWorkFixture()
        val claimedAt = clock.instant()
        val claim =
            requireNotNull(
                convergencePort.claimNext(
                    ClaimPublicConvergenceWorkCommand(
                        workerId = "worker-api-state",
                        now = claimedAt,
                        leaseExpiresAt = claimedAt.plus(properties.leaseDuration),
                        maxAttempts = properties.maxAttempts,
                    ),
                ),
            )

        assertHostRetryable(fixture, expectedStatus = "PENDING", expectedRetryable = false)

        convergencePort.completeAttempt(
            CompletePublicConvergenceAttemptCommand(
                convergenceId = fixture.convergenceId,
                attemptNo = claim.attemptNo,
                workerId = claim.workerId,
                status = ConvergenceAttemptStatus.SUCCEEDED,
                observedAt = claimedAt.plusSeconds(1),
                resultCategory = ProviderSuccessCategory.PURGED.name,
                nextAvailableAt = claimedAt.plusSeconds(1),
                exhausted = true,
            ),
        )

        assertHostRetryable(fixture, expectedStatus = "SUCCEEDED", expectedRetryable = false)
    }

    @Test
    fun `host status API keeps exhausted failure non-retryable`() {
        val fixture = insertWorkFixture()

        repeat(properties.maxAttempts) { attemptIndex ->
            purgePort.enqueue(ProviderAttemptResult.Failed(ProviderFailureCategory.UNAVAILABLE, retryable = true))
            assertThat(service.processOne("worker-api-exhausted"))
                .describedAs("attempt ${attemptIndex + 1}")
                .isEqualTo(PublicConvergenceProcessResult.PROCESSED)
            if (attemptIndex + 1 < properties.maxAttempts) {
                makeAvailable(fixture.convergenceId)
            }
        }

        assertHostRetryable(fixture, expectedStatus = "FAILED", expectedRetryable = false)
    }

    @Test
    fun `host status API reports expired instead of not found after queued work retention`() {
        val fixture = insertWorkFixture()
        ageWork(fixture.convergenceId)

        assertThat(maintenance.purgeExpiredWork()).isEqualTo(1)

        assertHostRetryable(fixture, expectedStatus = "EXPIRED", expectedRetryable = false)
    }

    @Test
    fun `provider disabled maintenance bounds queued and terminal backlog while protecting active lease`() {
        val queued = insertWorkFixture()
        val succeeded = insertWorkFixture()
        val exhausted = insertWorkFixture()
        val leased = insertWorkFixture()
        listOf(queued, succeeded, exhausted, leased).forEach { fixture -> ageWork(fixture.convergenceId) }
        insertTerminalEvents(succeeded, "SUCCEEDED", "PURGED")
        insertTerminalEvents(exhausted, "FAILED", "UNAVAILABLE")
        jdbcTemplate.update(
            """
            update public_convergence_work
            set lease_owner = 'active-maintenance-worker',
                lease_expires_at = date_add(utc_timestamp(6), interval 5 minute)
            where convergence_id = ?
            """.trimIndent(),
            leased.convergenceId.toString(),
        )
        val disabledRegistry = SimpleMeterRegistry()
        val disabledMaintenance =
            PublicConvergenceMaintenanceService(
                convergencePort,
                properties.copy(enabled = false),
                disabledRegistry,
                clock,
            )

        assertThat(disabledMaintenance.purgeExpiredWork()).isEqualTo(2)
        assertThat(disabledMaintenance.purgeExpiredWork()).isEqualTo(1)
        assertThat(ownedWorkCount(listOf(queued, succeeded, exhausted, leased))).isOne()
        assertThat(convergencePort.loadWork(leased.convergenceId)).isNotNull()
        assertThat(ownedReceiptCount(listOf(queued, succeeded, exhausted, leased))).isEqualTo(4)
        assertThat(eventStatuses(succeeded.convergenceId)).containsExactly("PENDING", "SUCCEEDED")
        assertThat(eventStatuses(exhausted.convergenceId)).containsExactly("PENDING", "FAILED")
        val purgeCounter = disabledRegistry.get("readmates.public.convergence.work.purged").counter()
        val backlogGauge = disabledRegistry.get("readmates.public.convergence.work.backlog").gauge()
        assertThat(purgeCounter.count()).isEqualTo(3.0)
        assertThat(purgeCounter.id.tags).isEmpty()
        assertThat(backlogGauge.id.tags).isEmpty()
    }

    @Test
    fun `terminal status remains honest and non retryable after work retention purge`() {
        val succeeded = insertWorkFixture()
        val exhausted = insertWorkFixture()
        insertTerminalEvents(succeeded, "SUCCEEDED", "PURGED")
        insertTerminalEvents(exhausted, "FAILED", "UNAVAILABLE")
        ageWork(succeeded.convergenceId)
        ageWork(exhausted.convergenceId)

        assertThat(maintenance.purgeExpiredWork()).isEqualTo(2)

        assertHostRetryable(succeeded, expectedStatus = "SUCCEEDED", expectedRetryable = false)
        assertHostRetryable(exhausted, expectedStatus = "FAILED", expectedRetryable = false)
    }

    private fun insertWorkFixture(): Fixture {
        val publicationId =
            UUID.fromString(
                jdbcTemplate.queryForObject(
                    "select id from public_session_publications where session_id = ?",
                    String::class.java,
                    BASELINE_SESSION_ID.toString(),
                ),
            )
        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_receipts (
              mutation_receipt_id, convergence_id, publication_id_snapshot,
              session_id_snapshot, committed_generation, origin_readable
            ) values (?, ?, ?, ?, 42, true)
            """.trimIndent(),
            receiptId.toString(),
            convergenceId.toString(),
            publicationId.toString(),
            BASELINE_SESSION_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_convergence_work (convergence_id, next_attempt_no, available_at)
            values (?, 1, '2000-01-01 00:00:00.000000')
            """.trimIndent(),
            convergenceId.toString(),
        )
        createdConvergenceIds += convergenceId
        return Fixture(receiptId, convergenceId, receiptRow(receiptId))
    }

    private fun eventStatuses(convergenceId: UUID): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select status from public_convergence_events
                where convergence_id = ? order by attempt_no, event_seq
                """.trimIndent(),
                String::class.java,
                convergenceId.toString(),
            ).filterNotNull()

    private fun attempts(convergenceId: UUID): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select concat(attempt_no, ':', event_seq, ':', status)
                from public_convergence_events
                where convergence_id = ? order by attempt_no, event_seq
                """.trimIndent(),
                String::class.java,
                convergenceId.toString(),
            ).filterNotNull()

    private fun makeAvailable(convergenceId: UUID) {
        jdbcTemplate.update(
            """
            update public_convergence_work
            set available_at = '2000-01-01 00:00:00.000000'
            where convergence_id = ?
            """.trimIndent(),
            convergenceId.toString(),
        )
    }

    private fun expireLease(convergenceId: UUID) {
        jdbcTemplate.update(
            """
            update public_convergence_work
            set lease_expires_at = date_sub(utc_timestamp(6), interval 1 second)
            where convergence_id = ?
            """.trimIndent(),
            convergenceId.toString(),
        )
    }

    private fun ageWork(convergenceId: UUID) {
        jdbcTemplate.update(
            """
            update public_convergence_work
            set created_at = date_sub(utc_timestamp(6), interval 2 hour),
                updated_at = date_sub(utc_timestamp(6), interval 2 hour)
            where convergence_id = ?
            """.trimIndent(),
            convergenceId.toString(),
        )
    }

    private fun insertTerminalEvents(
        fixture: Fixture,
        status: String,
        category: String,
    ) {
        val snapshot = receiptRow(fixture.receiptId)
        jdbcTemplate.update(
            """
            insert into public_convergence_events (
              convergence_id, publication_id_snapshot, session_id_snapshot,
              attempt_no, event_seq, status, observed_at, result_category
            ) values (?, ?, ?, 1, 0, 'PENDING', utc_timestamp(6), null),
                     (?, ?, ?, 1, 1, ?, utc_timestamp(6), ?)
            """.trimIndent(),
            fixture.convergenceId.toString(),
            snapshot["publication_id_snapshot"],
            snapshot["session_id_snapshot"],
            fixture.convergenceId.toString(),
            snapshot["publication_id_snapshot"],
            snapshot["session_id_snapshot"],
            status,
            category,
        )
        jdbcTemplate.update(
            "update public_convergence_work set next_attempt_no = ? where convergence_id = ?",
            Int.MAX_VALUE,
            fixture.convergenceId.toString(),
        )
    }

    private fun ownedWorkCount(fixtures: List<Fixture>): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from public_convergence_work where convergence_id " +
                "in (${fixtures.joinToString(",") { "?" }})",
            Int::class.java,
            *fixtures.map { it.convergenceId.toString() }.toTypedArray(),
        ) ?: 0

    private fun ownedReceiptCount(fixtures: List<Fixture>): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from public_mutation_convergence_receipts where convergence_id " +
                "in (${fixtures.joinToString(",") { "?" }})",
            Int::class.java,
            *fixtures.map { it.convergenceId.toString() }.toTypedArray(),
        ) ?: 0

    private fun receiptRow(receiptId: UUID): Map<String, Any?> =
        jdbcTemplate.queryForMap(
            "select * from public_mutation_convergence_receipts where mutation_receipt_id = ?",
            receiptId.toString(),
        )

    private fun assertHostRetryable(
        fixture: Fixture,
        expectedStatus: String,
        expectedRetryable: Boolean,
    ) {
        mockMvc
            .get("/api/host/sessions/$BASELINE_SESSION_ID/publication/convergence/${fixture.receiptId}") {
                with(user("host@example.com"))
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value(expectedStatus) }
                jsonPath("$.retryable") { value(expectedRetryable) }
            }
    }

    private data class Fixture(
        val receiptId: UUID,
        val convergenceId: UUID,
        val receiptBefore: Map<String, Any?>,
    )

    private data class SuspendedWork(
        val convergenceId: String,
        val availableAt: LocalDateTime,
        val createdAt: LocalDateTime,
    )

    @TestConfiguration
    class FakeProviderConfig {
        @Bean
        @Primary
        fun recordingPublicCachePurgePort(): RecordingPublicCachePurgePort = RecordingPublicCachePurgePort()
    }

    class RecordingPublicCachePurgePort : PublicCachePurgePort {
        private val queued = ArrayDeque<ProviderAttemptResult>()
        private val logicalResults = linkedMapOf<String, ProviderAttemptResult>()
        val invocationTokens = mutableListOf<String>()
        val logicalTokens: Set<String>
            get() = logicalResults.keys
        var beforeCall: (() -> Unit)? = null

        @Synchronized
        fun enqueue(result: ProviderAttemptResult) {
            queued += result
        }

        @Synchronized
        fun reset() {
            queued.clear()
            logicalResults.clear()
            invocationTokens.clear()
            beforeCall = null
        }

        override fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult {
            beforeCall?.invoke()
            return synchronized(this) {
                invocationTokens += command.idempotencyToken
                logicalResults.getOrPut(command.idempotencyToken) {
                    if (queued.isEmpty()) {
                        ProviderAttemptResult.Succeeded(ProviderSuccessCategory.PURGED)
                    } else {
                        queued.removeFirst()
                    }
                }
            }
        }
    }

    private companion object {
        val BASELINE_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000306")
    }
}

internal fun runFixtureCleanup(
    deleteOwnedRows: () -> Unit,
    restoreSuspendedRows: () -> Unit,
) {
    var deletionFailure: Throwable? = null
    try {
        deleteOwnedRows()
    } catch (failure: Throwable) {
        deletionFailure = failure
    }
    try {
        restoreSuspendedRows()
    } catch (restoreFailure: Throwable) {
        deletionFailure?.addSuppressed(restoreFailure) ?: throw restoreFailure
    }
    deletionFailure?.let { throw it }
}
