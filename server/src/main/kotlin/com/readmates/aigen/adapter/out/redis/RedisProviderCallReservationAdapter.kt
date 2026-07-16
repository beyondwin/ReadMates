package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.port.out.ProviderCallReconciliationCommand
import com.readmates.aigen.application.port.out.ProviderCallReconciliationResult
import com.readmates.aigen.application.port.out.ProviderCallRecoveryResult
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.application.port.out.ProviderCallReservationUnavailableException
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class RedisProviderCallReservationAdapter(
    private val redisTemplate: StringRedisTemplate,
    private val properties: AiGenerationProperties,
) : ProviderCallReservationPort {
    override fun reserve(command: ProviderCallReservationCommand): ProviderCallReservationResult {
        require(command.maximumCostUsd >= BigDecimal.ZERO) { "maximumCostUsd must be non-negative" }
        require(command.maxCalls > 0) { "maxCalls must be positive" }
        return failClosed("reserve") {
            when (
                val result =
                    redisTemplate.execute(
                        ProviderCallReservationRedisScripts.reserve,
                        listOf(
                            jobKey(command.jobId),
                            admissionKey(command.clubId),
                            monthlyKey(command.clubId),
                            ledgerKey(command.jobId),
                        ),
                        command.expectedStatus.name,
                        command.admissionId.toString(),
                        command.maxCalls.toString(),
                        command.maximumCostUsd.toPlainString(),
                        properties.caps.clubMonthlyCostUsd.toPlainString(),
                        properties.job.redisTtl.seconds
                            .toString(),
                        MONTHLY_TTL.seconds.toString(),
                        command.attemptId.toString(),
                        command.jobId.toString(),
                        command.model.provider.name,
                        command.model.name,
                        command.mode.name,
                        command.now.toString(),
                        ADMISSION_TTL.seconds.toString(),
                        command.clubId.toString(),
                        command.now.toEpochMilli().toString(),
                    )
            ) {
                null -> error("Redis reservation returned no result")
                0L -> ProviderCallReservationResult.StateChanged
                ADMISSION_EXPIRED -> ProviderCallReservationResult.AdmissionExpired
                CALL_CAP_EXCEEDED -> ProviderCallReservationResult.CallCapExceeded
                MONTHLY_COST_CAP_EXCEEDED -> ProviderCallReservationResult.MonthlyCostCapExceeded
                ATTEMPT_ALREADY_RECORDED -> ProviderCallReservationResult.StateChanged
                MODE_ALREADY_USED -> ProviderCallReservationResult.ModeAlreadyUsed
                else -> {
                    check(result > 0) { "Unexpected Redis reservation result: $result" }
                    ProviderCallReservationResult.Reserved(requireAttempt(command.jobId, command.attemptId))
                }
            }
        }
    }

    override fun reconcile(command: ProviderCallReconciliationCommand): ProviderCallReconciliationResult =
        failClosed("reconcile") {
            val actual = command.actualCostUsd?.toPlainString().orEmpty()
            val basis =
                when {
                    command.releaseCallSlot -> CostBasis.NONE
                    command.actualCostUsd == null -> CostBasis.ESTIMATED_UNKNOWN
                    else -> CostBasis.ACTUAL
                }
            val result =
                redisTemplate.execute(
                    ProviderCallReservationRedisScripts.reconcile,
                    listOf(ledgerKey(command.jobId), monthlyKey(command.clubId), jobKey(command.jobId)),
                    command.attemptId.toString(),
                    command.jobId.toString(),
                    command.clubId.toString(),
                    command.terminalState.name,
                    actual,
                    basis.name,
                    command.safeErrorCode?.name.orEmpty(),
                    command.now.toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                    if (command.releaseCallSlot) "1" else "0",
                )
            when (result) {
                1L -> ProviderCallReconciliationResult.Reconciled(requireAttempt(command.jobId, command.attemptId))
                0L -> ProviderCallReconciliationResult.AlreadyTerminal(requireAttempt(command.jobId, command.attemptId))
                -1L -> ProviderCallReconciliationResult.AttemptNotFound
                RECONCILIATION_BINDING_MISMATCH -> ProviderCallReconciliationResult.AttemptNotFound
                MONTHLY_COUNTER_UNAVAILABLE -> error("Monthly reservation counter is unavailable")
                else -> error("Unexpected Redis reconciliation result: $result")
            }
        }

    override fun recoverStaleInFlightUnknown(
        jobId: UUID,
        staleBefore: Instant,
        now: Instant,
    ): ProviderCallRecoveryResult =
        failClosed("recoverStaleInFlightUnknown") {
            val jobKey = jobKey(jobId)
            val clubId =
                redisTemplate.opsForHash<String, String>().get(jobKey, "clubId")
                    ?: error("Provider attempt job binding is unavailable")
            val response =
                redisTemplate
                    .execute(
                        ProviderCallReservationRedisScripts.markUnresolvedUnknown,
                        listOf(ledgerKey(jobId), jobKey, monthlyKey(UUID.fromString(clubId))),
                        staleBefore.toEpochMilli().toString(),
                        now.toString(),
                        properties.job.redisTtl.seconds
                            .toString(),
                        clubId,
                    ).orEmpty()
            when (response) {
                RECOVERY_BINDING_MISMATCH -> error("Provider attempt job binding changed")
                RECOVERY_COUNTER_UNAVAILABLE -> error("Monthly reservation counter is unavailable")
            }
            val active = response == RECOVERY_ACTIVE || response.startsWith("$RECOVERY_ACTIVE|")
            val recoveredIds = response.removePrefix("$RECOVERY_ACTIVE|").takeUnless { it == RECOVERY_ACTIVE }.orEmpty()
            ProviderCallRecoveryResult(
                recovered =
                    recoveredIds
                        .split(',')
                        .filter(String::isNotBlank)
                        .map(UUID::fromString)
                        .map { requireAttempt(jobId, it) },
                activeInFlight = active,
            )
        }

    override fun clubMonthlyCost(clubId: UUID): BigDecimal =
        failClosed("clubMonthlyCost") {
            redisTemplate.opsForValue().get(monthlyKey(clubId))?.toBigDecimalOrNull() ?: BigDecimal.ZERO
        }

    private fun requireAttempt(
        jobId: UUID,
        attemptId: UUID,
    ): ProviderAttempt {
        val ledger = redisTemplate.opsForHash<String, String>()
        val key = ledgerKey(jobId)
        val prefix = "$attemptId:"

        fun required(field: String): String =
            ledger.get(key, prefix + field)
                ?: error("Incomplete provider attempt ledger: $field")

        return ProviderAttempt(
            attemptId = UUID.fromString(required("attemptId")),
            ordinal = required("ordinal").toInt(),
            jobId = UUID.fromString(required("jobId")),
            provider = Provider.valueOf(required("provider")),
            model = ModelId(Provider.valueOf(required("provider")), required("model")),
            mode = ProviderCallMode.valueOf(required("mode")),
            state = ProviderAttemptState.valueOf(required("state")),
            reservedCostUsd = required("reservedCostUsd").toBigDecimal(),
            costBasis = CostBasis.valueOf(required("costBasis")),
            safeErrorCode = required("safeErrorCode").takeIf(String::isNotBlank)?.let(ErrorCode::valueOf),
            startedAt = Instant.parse(required("startedAt")),
            completedAt = required("completedAt").takeIf(String::isNotBlank)?.let(Instant::parse),
        )
    }

    private fun <T> failClosed(
        operation: String,
        block: () -> T,
    ): T =
        try {
            block()
        } catch (failure: ProviderCallReservationUnavailableException) {
            throw failure
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: Throwable,
        ) {
            throw ProviderCallReservationUnavailableException(operation, failure)
        }

    private fun jobKey(jobId: UUID) = "aigen:job:$jobId"

    private fun ledgerKey(jobId: UUID) = providerAttemptsKey(jobId)

    private fun admissionKey(clubId: UUID) = "aigen:club:$clubId:provider_admission"

    private fun monthlyKey(clubId: UUID) = "aigen:club:$clubId:monthly_cost_usd"

    private companion object {
        const val ADMISSION_EXPIRED = -1L
        const val CALL_CAP_EXCEEDED = -2L
        const val MONTHLY_COST_CAP_EXCEEDED = -3L
        const val ATTEMPT_ALREADY_RECORDED = -4L
        const val MODE_ALREADY_USED = -5L
        const val RECONCILIATION_BINDING_MISMATCH = -2L
        const val MONTHLY_COUNTER_UNAVAILABLE = -3L
        const val RECOVERY_BINDING_MISMATCH = "!BINDING"
        const val RECOVERY_COUNTER_UNAVAILABLE = "!COUNTER"
        const val RECOVERY_ACTIVE = "!ACTIVE"
        val MONTHLY_TTL: Duration = Duration.ofDays(31)
        val ADMISSION_TTL: Duration = Duration.ofMinutes(5)
    }
}
