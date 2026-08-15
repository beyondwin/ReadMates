package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.CapDenialReason
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCircuitState
import java.time.Duration

interface AiGenerationAdapterMetricsPort {
    fun recordProviderCall(
        provider: Provider,
        outcome: ProviderCircuitOutcome,
        duration: Duration,
    )

    fun recordProviderGateRejection(
        provider: Provider,
        reason: ProviderGateRejection,
    )

    fun recordProviderCircuitTransition(
        provider: Provider,
        state: ProviderCircuitState,
    )

    fun recordCapDenial(reason: CapDenialReason)
}
