@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.application.port.`in`

import java.time.Instant

data class AiGenerationQueueProbeSnapshot(
    val sampledAt: Instant?,
    val depth: Double,
    val available: Boolean,
    val lastSuccessAt: Instant?,
) {
    companion object {
        fun unavailableBeforeFirstSample() =
            AiGenerationQueueProbeSnapshot(
                sampledAt = null,
                depth = Double.NaN,
                available = false,
                lastSuccessAt = null,
            )
    }
}

fun interface SampleAiGenerationQueueProbeUseCase {
    fun sample()
}

fun interface ReadAiGenerationQueueProbeSnapshotUseCase {
    fun readSnapshot(): AiGenerationQueueProbeSnapshot
}
