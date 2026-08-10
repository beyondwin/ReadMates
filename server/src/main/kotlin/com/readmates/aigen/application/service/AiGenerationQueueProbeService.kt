package com.readmates.aigen.application.service

import com.readmates.aigen.application.port.`in`.AiGenerationQueueProbeSnapshot
import com.readmates.aigen.application.port.`in`.ReadAiGenerationQueueProbeSnapshotUseCase
import com.readmates.aigen.application.port.`in`.SampleAiGenerationQueueProbeUseCase
import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.concurrent.atomic.AtomicReference

@Service
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class AiGenerationQueueProbeService(
    private val probe: ActiveAiGenerationJobProbe,
    private val clock: Clock,
) : SampleAiGenerationQueueProbeUseCase,
    ReadAiGenerationQueueProbeSnapshotUseCase {
    private val snapshot = AtomicReference(AiGenerationQueueProbeSnapshot.unavailableBeforeFirstSample())

    override fun sample() {
        val now = clock.instant()
        val result =
            runCatching { probe.probe(now) }.getOrElse {
                ActiveAiGenerationJobProbe.Unavailable(
                    ActiveAiGenerationJobProbe.UnavailableReason.REDIS_UNAVAILABLE,
                )
            }
        snapshot.updateAndGet { previous ->
            when (result) {
                is ActiveAiGenerationJobProbe.Available ->
                    AiGenerationQueueProbeSnapshot(
                        sampledAt = now,
                        depth = result.depth.toDouble(),
                        available = true,
                        lastSuccessAt = now,
                    )
                is ActiveAiGenerationJobProbe.Unavailable ->
                    AiGenerationQueueProbeSnapshot(
                        sampledAt = now,
                        depth = Double.NaN,
                        available = false,
                        lastSuccessAt = previous.lastSuccessAt,
                    )
            }
        }
    }

    override fun readSnapshot(): AiGenerationQueueProbeSnapshot = snapshot.get()
}
