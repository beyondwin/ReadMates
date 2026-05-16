package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ErrorCode
import java.math.BigDecimal
import java.util.UUID

/**
 * Outbound port enforcing host-daily call cap and club-monthly cost cap.
 * Does NOT enforce per-minute rate limits — those live in the shared RateLimitPort.
 * Soft-warning thresholds are computed by the orchestrator via [clubMonthlyCost].
 */
interface GenerationCostGuard {
    fun checkBeforeCall(hostId: UUID, clubId: UUID): GuardDecision

    fun recordUsage(hostId: UUID, clubId: UUID, cost: BigDecimal): Unit

    fun clubMonthlyCost(clubId: UUID): BigDecimal
}

sealed class GuardDecision {
    object Allow : GuardDecision()

    data class Deny(val code: ErrorCode) : GuardDecision()
}
