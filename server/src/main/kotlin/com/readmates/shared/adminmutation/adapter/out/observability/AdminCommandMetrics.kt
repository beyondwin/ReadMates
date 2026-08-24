package com.readmates.shared.adminmutation.adapter.out.observability

import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigestKeyRetirementOutcome
import com.readmates.shared.adminmutation.application.port.out.AdminCommandObservability
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

@Component
class AdminCommandMetrics(
    private val registry: MeterRegistry,
) : AdminCommandObservability {
    override fun claim(
        commandType: String,
        result: AdminCommandClaimResult,
    ) {
        val claimResult =
            when (result) {
                is AdminCommandClaimResult.Claimed -> "claimed"
                is AdminCommandClaimResult.Completed -> "completed"
                AdminCommandClaimResult.InProgress -> "in_progress"
                AdminCommandClaimResult.Conflict -> "conflict"
            }
        val boundedCommandType = commandType.takeIf(COMMAND_TYPES::contains) ?: OTHER_COMMAND_TYPE
        registry.counter(CLAIM_METRIC, "commandType", boundedCommandType, "claimResult", claimResult).increment()
    }

    override fun complete(completed: Boolean) {
        registry.counter(COMPLETE_METRIC, "outcome", if (completed) "completed" else "stale_token").increment()
    }

    override fun purge(count: Int) {
        val outcome = if (count > 0) "purged" else "empty"
        registry.counter(PURGE_METRIC, "outcome", outcome).increment(count.coerceAtLeast(1).toDouble())
    }

    override fun retirement(outcome: AdminCommandDigestKeyRetirementOutcome) {
        registry
            .counter(RETIREMENT_METRIC, "outcome", outcome.name.lowercase())
            .increment()
    }

    private companion object {
        const val CLAIM_METRIC = "admin.command.claim"
        const val COMPLETE_METRIC = "admin.command.complete"
        const val PURGE_METRIC = "admin.command.purge"
        const val RETIREMENT_METRIC = "admin.command.digest-key-retirement"
        const val OTHER_COMMAND_TYPE = "other"
        val COMMAND_TYPES = setOf("club.create")
    }
}
