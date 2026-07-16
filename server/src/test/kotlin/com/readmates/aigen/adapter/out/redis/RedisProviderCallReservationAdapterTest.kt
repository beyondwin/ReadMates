package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.ProviderCallReconciliationCommand
import com.readmates.aigen.application.port.out.ProviderCallReconciliationResult
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.application.port.out.ProviderCallReservationUnavailableException
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
        "readmates.aigen.caps.club-monthly-cost-usd=1.00",
        "spring.ai.model.chat=none",
        "spring.ai.google.genai.api-key=test-key",
        "spring.ai.openai.api-key=test-key",
        "spring.ai.anthropic.api-key=test-key",
    ],
)
@Tag("integration")
@Tag("container")
class RedisProviderCallReservationAdapterTest(
    @param:Autowired private val reservations: ProviderCallReservationPort,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val properties: AiGenerationProperties,
) : ReadmatesRedisIntegrationTestSupport() {
    @Suppress("UnusedPrivateProperty")
    @MockitoBean
    private lateinit var jobQueue: AiGenerationJobQueue

    @Test
    fun `successful reservation atomically consumes one call and maximum cost and writes a content-free attempt`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)

        val result = reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))

        assertThat(result).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)
        val attempt = (result as ProviderCallReservationResult.Reserved).attempt
        assertThat(attempt.ordinal).isEqualTo(1)
        assertThat(attempt.state).isEqualTo(ProviderAttemptState.IN_FLIGHT)
        assertThat(attempt.reservedCostUsd).isEqualByComparingTo("0.40")
        assertThat(attempt.costBasis).isEqualTo(CostBasis.NONE)
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(1)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.4")

        val ttl = properties.job.redisTtl.seconds
        assertThat(redisTemplate.getExpire(fixture.jobKey, TimeUnit.SECONDS)).isBetween(ttl - 30, ttl + 30)
        assertThat(redisTemplate.getExpire(fixture.ledgerKey, TimeUnit.SECONDS)).isBetween(ttl - 30, ttl + 30)
        assertThat(redisTemplate.getExpire(fixture.monthlyKey, TimeUnit.SECONDS))
            .isBetween(30 * 24 * 3600L, 31 * 24 * 3600L + 30)

        val ledger = redisTemplate.opsForHash<String, String>().entries(fixture.ledgerKey)
        val serialized = ledger.entries.joinToString("|") { "${it.key}=${it.value}" }.lowercase()
        assertThat(serialized).doesNotContain(fixture.clubId.toString(), fixture.admissionId.toString())
        FORBIDDEN_LEDGER_TERMS.forEach { assertThat(serialized).doesNotContain(it) }
    }

    @Test
    fun `sixty-four concurrent reservations never exceed three physical calls`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)

        val results = concurrently(64) { fixture.command(attemptId = UUID.randomUUID(), maximumCostUsd = CENT) }

        assertThat(results.count { it is ProviderCallReservationResult.Reserved }).isEqualTo(3)
        assertThat(results.count { it is ProviderCallReservationResult.CallCapExceeded }).isEqualTo(61)
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(3)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.03")
        assertThat(attemptCount(fixture.jobId)).isEqualTo(3)
    }

    @Test
    fun `sixty-four concurrent reservations never cross the monthly cap`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)

        val results =
            concurrently(64) {
                fixture.command(attemptId = UUID.randomUUID(), maximumCostUsd = BigDecimal("0.40"), maxCalls = 100)
            }

        assertThat(results.count { it is ProviderCallReservationResult.Reserved }).isEqualTo(2)
        assertThat(results.count { it is ProviderCallReservationResult.MonthlyCostCapExceeded }).isEqualTo(62)
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(2)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.8")
        assertThat(attemptCount(fixture.jobId)).isEqualTo(2)
    }

    @Test
    fun `wrong job status writes nothing`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.PENDING)

        val result = reservations.reserve(fixture.command())

        assertThat(result).isEqualTo(ProviderCallReservationResult.StateChanged)
        assertNoReservationWrites(fixture)
    }

    @Test
    fun `missing admission lease writes nothing`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING, admission = false)

        val result = reservations.reserve(fixture.command())

        assertThat(result).isEqualTo(ProviderCallReservationResult.AdmissionExpired)
        assertNoReservationWrites(fixture)
    }

    @Test
    fun `foreign admission lease writes nothing`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        redisTemplate.opsForValue().set(fixture.admissionKey, UUID.randomUUID().toString(), Duration.ofMinutes(1))

        val result = reservations.reserve(fixture.command())

        assertThat(result).isEqualTo(ProviderCallReservationResult.AdmissionExpired)
        assertNoReservationWrites(fixture)
    }

    @Test
    fun `foreign club cannot reserve against another jobs hash`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        val foreignClubId = UUID.randomUUID()
        val foreignAdmissionId = UUID.randomUUID()
        redisTemplate.opsForValue().set(
            "aigen:club:$foreignClubId:provider_admission",
            foreignAdmissionId.toString(),
            Duration.ofMinutes(1),
        )

        val result = reservations.reserve(fixture.command(clubId = foreignClubId, admissionId = foreignAdmissionId))

        assertThat(result).isEqualTo(ProviderCallReservationResult.StateChanged)
        assertNoReservationWrites(fixture)
        assertThat(redisTemplate.hasKey("aigen:club:$foreignClubId:monthly_cost_usd")).isFalse()
    }

    @Test
    fun `call cap rejection writes nothing`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING, llmCallCount = 3)

        val result = reservations.reserve(fixture.command(maxCalls = 3))

        assertThat(result).isEqualTo(ProviderCallReservationResult.CallCapExceeded)
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(3)
        assertThat(redisTemplate.hasKey(fixture.monthlyKey)).isFalse()
        assertThat(redisTemplate.hasKey(fixture.ledgerKey)).isFalse()
    }

    @Test
    fun `monthly cap rejection writes nothing`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        redisTemplate.opsForValue().set(fixture.monthlyKey, "0.90", Duration.ofMinutes(2))

        val result = reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.20")))

        assertThat(result).isEqualTo(ProviderCallReservationResult.MonthlyCostCapExceeded)
        assertThat(jobCallCount(fixture.jobId)).isZero()
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.90")
        assertThat(redisTemplate.hasKey(fixture.ledgerKey)).isFalse()
        assertThat(redisTemplate.getExpire(fixture.monthlyKey, TimeUnit.SECONDS)).isBetween(60, 120)
    }

    @Test
    fun `reusing an attempt id is rejected without a second reservation`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command())

        val repeated = reservations.reserve(fixture.command())

        assertThat(repeated).isEqualTo(ProviderCallReservationResult.StateChanged)
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(1)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo(CENT)
        assertThat(attemptCount(fixture.jobId)).isEqualTo(1)
    }

    @Test
    fun `actual reconciliation applies actual minus maximum once for success and failure`() {
        listOf(ProviderAttemptState.SUCCEEDED, ProviderAttemptState.FAILED).forEach { terminalState ->
            val fixture = fixture()
            prepare(fixture, JobStatus.RUNNING)
            reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
            val safeErrorCode =
                if (terminalState == ProviderAttemptState.FAILED) ErrorCode.PROVIDER_UNAVAILABLE else null
            val firstCommand =
                fixture.reconciliation(
                    terminalState = terminalState,
                    actualCostUsd = BigDecimal("0.10"),
                    safeErrorCode = safeErrorCode,
                )

            val first = reservations.reconcile(firstCommand)
            val repeated = reservations.reconcile(firstCommand.copy(actualCostUsd = BigDecimal("0.01")))

            assertThat(first).isInstanceOf(ProviderCallReconciliationResult.Reconciled::class.java)
            assertThat((first as ProviderCallReconciliationResult.Reconciled).attempt.state).isEqualTo(terminalState)
            assertThat(first.attempt.costBasis).isEqualTo(CostBasis.ACTUAL)
            assertThat(repeated).isInstanceOf(ProviderCallReconciliationResult.AlreadyTerminal::class.java)
            assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.1")
            assertThat(jobCallCount(fixture.jobId)).isEqualTo(1)
        }
    }

    @Test
    fun `unknown reconciliation retains maximum reservation and is idempotent`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
        val command = fixture.reconciliation(ProviderAttemptState.UNKNOWN, actualCostUsd = null)

        val first = reservations.reconcile(command)
        val repeated = reservations.reconcile(command)

        assertThat(first).isInstanceOf(ProviderCallReconciliationResult.Reconciled::class.java)
        assertThat((first as ProviderCallReconciliationResult.Reconciled).attempt.costBasis)
            .isEqualTo(CostBasis.ESTIMATED_UNKNOWN)
        assertThat(repeated).isInstanceOf(ProviderCallReconciliationResult.AlreadyTerminal::class.java)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.4")
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(1)
    }

    @Test
    fun `foreign club reconciliation cannot move either monthly counter or terminalize attempt`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
        val foreignClubId = UUID.randomUUID()
        redisTemplate.opsForValue().set("aigen:club:$foreignClubId:monthly_cost_usd", "0.70", Duration.ofDays(1))

        val result =
            reservations.reconcile(
                fixture.reconciliation(ProviderAttemptState.SUCCEEDED, BigDecimal("0.10")).copy(clubId = foreignClubId),
            )

        assertThat(result).isEqualTo(ProviderCallReconciliationResult.AttemptNotFound)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.40")
        assertThat(monthlyCost(foreignClubId)).isEqualByComparingTo("0.70")
        assertThat(attemptState(fixture)).isEqualTo(ProviderAttemptState.IN_FLIGHT.name)
    }

    @Test
    fun `missing monthly counter fails closed without creating a negative counter or terminalizing attempt`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
        redisTemplate.delete(fixture.monthlyKey)

        assertThatThrownBy {
            reservations.reconcile(fixture.reconciliation(ProviderAttemptState.SUCCEEDED, BigDecimal("0.10")))
        }.isInstanceOf(ProviderCallReservationUnavailableException::class.java)
        assertThat(redisTemplate.hasKey(fixture.monthlyKey)).isFalse()
        assertThat(attemptState(fixture)).isEqualTo(ProviderAttemptState.IN_FLIGHT.name)
    }

    @Test
    fun `monthly counter without positive ttl fails closed without terminalizing attempt`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
        redisTemplate.persist(fixture.monthlyKey)

        assertThatThrownBy {
            reservations.reconcile(fixture.reconciliation(ProviderAttemptState.SUCCEEDED, BigDecimal("0.10")))
        }.isInstanceOf(ProviderCallReservationUnavailableException::class.java)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.40")
        assertThat(redisTemplate.getExpire(fixture.monthlyKey, TimeUnit.SECONDS)).isEqualTo(-1)
        assertThat(attemptState(fixture)).isEqualTo(ProviderAttemptState.IN_FLIGHT.name)
    }

    @Test
    fun `stale in-flight recovery marks unknown without releasing cost or consuming another slot`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))

        val recovered = reservations.markUnresolvedInFlightUnknown(fixture.jobId, fixture.now.plusSeconds(30))
        val repeated = reservations.markUnresolvedInFlightUnknown(fixture.jobId, fixture.now.plusSeconds(60))

        assertThat(recovered).hasSize(1)
        assertThat(recovered.single().state).isEqualTo(ProviderAttemptState.UNKNOWN)
        assertThat(recovered.single().costBasis).isEqualTo(CostBasis.ESTIMATED_UNKNOWN)
        assertThat(repeated).isEmpty()
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(1)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.4")
        assertThat(attemptCount(fixture.jobId)).isEqualTo(1)
    }

    @Test
    fun `Kafka redelivery after provider response crash marks unknown and keeps total reservations at three`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        val first = reservations.reserve(fixture.command(maximumCostUsd = CENT))
        assertThat(first).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)

        // Simulate a crash after the provider accepted/responded but before reconciliation.
        val recovered = reservations.markUnresolvedInFlightUnknown(fixture.jobId, fixture.now.plusSeconds(30))
        val secondAttemptId = UUID.randomUUID()
        val thirdAttemptId = UUID.randomUUID()
        val second = reservations.reserve(fixture.command(attemptId = secondAttemptId, maximumCostUsd = CENT))
        val third = reservations.reserve(fixture.command(attemptId = thirdAttemptId, maximumCostUsd = CENT))
        val rejected = reservations.reserve(fixture.command(attemptId = UUID.randomUUID(), maximumCostUsd = CENT))

        assertThat(recovered).hasSize(1)
        assertThat(recovered.single().state).isEqualTo(ProviderAttemptState.UNKNOWN)
        assertThat(recovered.single().costBasis).isEqualTo(CostBasis.ESTIMATED_UNKNOWN)
        assertThat(second).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)
        assertThat(third).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)
        assertThat(rejected).isEqualTo(ProviderCallReservationResult.CallCapExceeded)
        assertThat(jobCallCount(fixture.jobId)).isEqualTo(3)
        assertThat(attemptCount(fixture.jobId)).isEqualTo(3)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.03")
    }

    @Test
    fun `redelivery cannot reserve fallback correction or repair mode twice`() {
        listOf(
            ProviderCallMode.FALLBACK,
            ProviderCallMode.SCHEMA_CORRECTION,
            ProviderCallMode.SECTION_REPAIR,
        ).forEach { mode ->
            val fixture = fixture()
            prepare(fixture, JobStatus.RUNNING)

            val first = reservations.reserve(fixture.command(mode = mode))
            val repeated =
                reservations.reserve(
                    fixture.command(attemptId = UUID.randomUUID(), mode = mode),
                )

            assertThat(first).isInstanceOf(ProviderCallReservationResult.Reserved::class.java)
            assertThat(repeated).isEqualTo(ProviderCallReservationResult.ModeAlreadyUsed)
            assertThat(jobCallCount(fixture.jobId)).isEqualTo(1)
            assertThat(attemptCount(fixture.jobId)).isEqualTo(1)
        }
    }

    @Test
    fun `stale recovery fails closed when the reserved monthly counter is missing`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
        redisTemplate.delete(fixture.monthlyKey)

        assertThatThrownBy {
            reservations.markUnresolvedInFlightUnknown(fixture.jobId, fixture.now.plusSeconds(30))
        }.isInstanceOf(ProviderCallReservationUnavailableException::class.java)
        assertThat(redisTemplate.hasKey(fixture.monthlyKey)).isFalse()
        assertThat(attemptState(fixture)).isEqualTo(ProviderAttemptState.IN_FLIGHT.name)
    }

    @Test
    fun `stale recovery fails closed when the reserved monthly counter has no positive ttl`() {
        val fixture = fixture()
        prepare(fixture, JobStatus.RUNNING)
        reservations.reserve(fixture.command(maximumCostUsd = BigDecimal("0.40")))
        redisTemplate.persist(fixture.monthlyKey)

        assertThatThrownBy {
            reservations.markUnresolvedInFlightUnknown(fixture.jobId, fixture.now.plusSeconds(30))
        }.isInstanceOf(ProviderCallReservationUnavailableException::class.java)
        assertThat(monthlyCost(fixture.clubId)).isEqualByComparingTo("0.40")
        assertThat(redisTemplate.getExpire(fixture.monthlyKey, TimeUnit.SECONDS)).isEqualTo(-1)
        assertThat(attemptState(fixture)).isEqualTo(ProviderAttemptState.IN_FLIGHT.name)
    }

    @Test
    fun `redis failure throws fail-closed before caller can enter provider transport`() {
        val unavailable = RedisProviderCallReservationAdapter(StringRedisTemplate(), properties)
        var providerEntered = false

        assertThatThrownBy {
            unavailable.reserve(fixture().command())
            providerEntered = true
        }.isInstanceOf(ProviderCallReservationUnavailableException::class.java)
        assertThat(providerEntered).isFalse()
    }

    @Test
    fun `provider attempt type exposes only content-free allowlisted metadata`() {
        val fields = ProviderAttempt::class.java.declaredFields.map { it.name.lowercase() }

        FORBIDDEN_LEDGER_TERMS.forEach { forbidden ->
            assertThat(fields).noneMatch { it.contains(forbidden) }
        }
        assertThat(fields).doesNotContain("sessionid", "clubid", "userid", "admissionid")
    }

    private fun concurrently(
        count: Int,
        command: () -> ProviderCallReservationCommand,
    ): List<ProviderCallReservationResult> {
        val executor = Executors.newFixedThreadPool(16)
        return try {
            val tasks = List(count) { Callable { reservations.reserve(command()) } }
            executor.invokeAll(tasks).map { it.get() }
        } finally {
            executor.shutdownNow()
        }
    }

    private fun prepare(
        fixture: Fixture,
        status: JobStatus,
        admission: Boolean = true,
        llmCallCount: Int = 0,
    ) {
        redisTemplate.delete(listOf(fixture.jobKey, fixture.admissionKey, fixture.monthlyKey, fixture.ledgerKey))
        redisTemplate.opsForHash<String, String>().putAll(
            fixture.jobKey,
            mapOf(
                "status" to status.name,
                "llmCallCount" to llmCallCount.toString(),
                "clubId" to fixture.clubId.toString(),
            ),
        )
        redisTemplate.expire(fixture.jobKey, Duration.ofSeconds(2))
        if (admission) {
            redisTemplate.opsForValue().set(
                fixture.admissionKey,
                fixture.admissionId.toString(),
                Duration.ofMinutes(1),
            )
        }
    }

    private fun assertNoReservationWrites(fixture: Fixture) {
        assertThat(jobCallCount(fixture.jobId)).isZero()
        assertThat(redisTemplate.hasKey(fixture.monthlyKey)).isFalse()
        assertThat(redisTemplate.hasKey(fixture.ledgerKey)).isFalse()
    }

    private fun jobCallCount(jobId: UUID): Int =
        redisTemplate.opsForHash<String, String>().get("aigen:job:$jobId", "llmCallCount")?.toInt() ?: 0

    private fun monthlyCost(clubId: UUID): BigDecimal =
        redisTemplate.opsForValue().get("aigen:club:$clubId:monthly_cost_usd")?.toBigDecimal() ?: BigDecimal.ZERO

    private fun attemptCount(jobId: UUID): Int =
        redisTemplate
            .opsForHash<String, String>()
            .keys("aigen:job:$jobId:provider-attempts")
            .count { it.endsWith(":state") }

    private fun attemptState(fixture: Fixture): String? =
        redisTemplate.opsForHash<String, String>().get(fixture.ledgerKey, "${fixture.attemptId}:state")

    private fun fixture() = Fixture()

    private data class Fixture(
        val jobId: UUID = UUID.randomUUID(),
        val clubId: UUID = UUID.randomUUID(),
        val admissionId: UUID = UUID.randomUUID(),
        val attemptId: UUID = UUID.randomUUID(),
        val now: Instant = Instant.parse("2026-07-16T00:00:00Z"),
    ) {
        val jobKey = "aigen:job:$jobId"
        val admissionKey = "aigen:club:$clubId:provider_admission"
        val monthlyKey = "aigen:club:$clubId:monthly_cost_usd"
        val ledgerKey = "aigen:job:$jobId:provider-attempts"

        fun command(
            attemptId: UUID = this.attemptId,
            clubId: UUID = this.clubId,
            admissionId: UUID = this.admissionId,
            maximumCostUsd: BigDecimal = CENT,
            maxCalls: Int = 3,
            mode: ProviderCallMode = ProviderCallMode.PRIMARY,
        ) = ProviderCallReservationCommand(
            attemptId = attemptId,
            jobId = jobId,
            clubId = clubId,
            admissionId = admissionId,
            expectedStatus = JobStatus.RUNNING,
            model = MODEL,
            mode = mode,
            maximumCostUsd = maximumCostUsd,
            maxCalls = maxCalls,
            now = now,
        )

        fun reconciliation(
            terminalState: ProviderAttemptState,
            actualCostUsd: BigDecimal?,
            safeErrorCode: ErrorCode? = null,
        ) = ProviderCallReconciliationCommand(
            attemptId = attemptId,
            jobId = jobId,
            clubId = clubId,
            terminalState = terminalState,
            actualCostUsd = actualCostUsd,
            safeErrorCode = safeErrorCode,
            now = now.plusSeconds(10),
        )
    }

    private companion object {
        val CENT = BigDecimal("0.01")
        val MODEL = ModelId(Provider.OPENAI, "gpt-test-allowlisted")
        val FORBIDDEN_LEDGER_TERMS =
            listOf("transcript", "prompt", "schema", "completion", "evidence", "rawerror", "raw_error")
    }
}
