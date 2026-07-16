package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.Provider
import java.time.Duration

enum class ProviderCircuitOutcome {
    SUCCESS,
    TRANSIENT_FAILURE,
    IGNORED_FAILURE,
}

enum class ProviderGateRejection {
    CIRCUIT_OPEN,
    CONCURRENCY_LIMIT,
}

sealed interface ProviderPermitDecision {
    data class Acquired(
        val permit: ProviderCallPermit,
    ) : ProviderPermitDecision

    data class Rejected(
        val reason: ProviderGateRejection,
    ) : ProviderPermitDecision
}

interface ProviderCallPermit : AutoCloseable {
    fun record(
        outcome: ProviderCircuitOutcome,
        elapsed: Duration,
    )
}

fun interface ProviderCallGate {
    fun tryAcquire(provider: Provider): ProviderPermitDecision
}
