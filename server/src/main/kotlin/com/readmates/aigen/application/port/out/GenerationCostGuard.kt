package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ErrorCode
import java.math.BigDecimal
import java.util.UUID

/**
 * Outbound port enforcing host-daily call cap and club-monthly cost cap.
 * Admission is atomic so concurrent requests cannot race past daily, per-minute,
 * or club-cost checks before provider usage is recorded.
 * Soft-warning thresholds are computed by the orchestrator via [clubMonthlyCost].
 */
interface GenerationCostGuard {
    fun checkBeforeCall(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): GuardDecision

    fun recordUsage(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
        cost: BigDecimal,
    ): Unit

    /** Roll back an admission only when no provider call could have occurred. */
    fun releaseAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): Unit

    /** Renew only an admission still owned by this job immediately before a provider call. */
    fun renewAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): Boolean

    fun clubMonthlyCost(clubId: UUID): BigDecimal
}

sealed class GuardDecision {
    object Allow : GuardDecision()

    data class Deny(
        val code: ErrorCode,
    ) : GuardDecision()
}
