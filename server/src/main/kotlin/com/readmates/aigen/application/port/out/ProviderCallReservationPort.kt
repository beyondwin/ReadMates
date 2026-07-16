package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class ProviderCallReservationCommand(
    val attemptId: UUID,
    val jobId: UUID,
    val clubId: UUID,
    val admissionId: UUID,
    val expectedStatus: JobStatus,
    val model: ModelId,
    val mode: ProviderCallMode,
    val maximumCostUsd: BigDecimal,
    val maxCalls: Int,
    val now: Instant,
)

sealed interface ProviderCallReservationResult {
    data class Reserved(
        val attempt: ProviderAttempt,
    ) : ProviderCallReservationResult

    data object StateChanged : ProviderCallReservationResult

    data object AdmissionExpired : ProviderCallReservationResult

    data object CallCapExceeded : ProviderCallReservationResult

    data object MonthlyCostCapExceeded : ProviderCallReservationResult
}

data class ProviderCallReconciliationCommand(
    val attemptId: UUID,
    val jobId: UUID,
    /** Used only to select the monthly counter key; it is never persisted in the attempt ledger. */
    val clubId: UUID,
    val terminalState: ProviderAttemptState,
    val actualCostUsd: BigDecimal?,
    val safeErrorCode: ErrorCode?,
    val now: Instant,
) {
    init {
        require(terminalState != ProviderAttemptState.IN_FLIGHT) { "reconciliation state must be terminal" }
        if (terminalState == ProviderAttemptState.UNKNOWN) {
            require(actualCostUsd == null) { "unknown reconciliation cannot claim actual cost" }
        } else {
            requireNotNull(actualCostUsd) { "success or failure reconciliation requires actual cost" }
            require(actualCostUsd >= BigDecimal.ZERO) { "actualCostUsd must be non-negative" }
        }
    }
}

sealed interface ProviderCallReconciliationResult {
    data class Reconciled(
        val attempt: ProviderAttempt,
    ) : ProviderCallReconciliationResult

    data class AlreadyTerminal(
        val attempt: ProviderAttempt,
    ) : ProviderCallReconciliationResult

    data object AttemptNotFound : ProviderCallReconciliationResult
}

interface ProviderCallReservationPort {
    fun reserve(command: ProviderCallReservationCommand): ProviderCallReservationResult

    fun reconcile(command: ProviderCallReconciliationCommand): ProviderCallReconciliationResult

    fun markUnresolvedInFlightUnknown(
        jobId: UUID,
        now: Instant,
    ): List<ProviderAttempt>

    fun clubMonthlyCost(clubId: UUID): BigDecimal
}

class ProviderCallReservationUnavailableException(
    operation: String,
    cause: Throwable,
) : RuntimeException("Provider call reservation unavailable during $operation", cause)
