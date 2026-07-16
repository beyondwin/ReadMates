package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ErrorCode
import java.math.BigDecimal
import java.util.UUID

/**
 * Outbound port for initial host-daily/per-minute admission.
 * Physical call count and club-monthly cost are reserved atomically by
 * [ProviderCallReservationPort] immediately before provider transport.
 * Soft-warning thresholds are computed by the orchestrator via [clubMonthlyCost].
 */
interface GenerationCostGuard {
    fun checkBeforeCall(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): GuardDecision

    /** Roll back an admission only when no provider call could have occurred. */
    fun releaseAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): Unit

    /** Remove the provider admission lease while retaining the consumed host counters. */
    fun completeAdmission(
        hostId: UUID,
        clubId: UUID,
        admissionId: UUID,
    ): Unit

    fun clubMonthlyCost(clubId: UUID): BigDecimal
}

sealed class GuardDecision {
    object Allow : GuardDecision()

    data class Deny(
        val code: ErrorCode,
    ) : GuardDecision()
}
