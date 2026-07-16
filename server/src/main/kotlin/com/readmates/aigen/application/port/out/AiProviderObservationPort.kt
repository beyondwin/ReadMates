package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderCallMode
import java.util.UUID

interface AiProviderObservationPort {
    fun <T> observe(
        context: AiProviderObservationContext,
        block: () -> T,
    ): T

    companion object {
        val PASSTHROUGH =
            object : AiProviderObservationPort {
                override fun <T> observe(
                    context: AiProviderObservationContext,
                    block: () -> T,
                ): T = block()
            }
    }
}

data class AiProviderObservationContext(
    val provider: Provider,
    val model: ModelId,
    val mode: ProviderCallMode,
    val attemptOrdinal: Int,
    val jobId: UUID,
) {
    init {
        require(model.provider == provider) { "model provider must match observation provider" }
        require(attemptOrdinal > 0) { "attemptOrdinal must be positive" }
    }
}
