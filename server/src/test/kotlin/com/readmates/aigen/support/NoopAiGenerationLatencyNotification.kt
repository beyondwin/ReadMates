package com.readmates.aigen.support

import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * No-op latency notification used only in tests under the `readmates.aigen.mock=true`
 * profile. Phase 6 provides the real adapter (in-app + push) — until then, integration
 * tests need a placeholder so the [AiGenerationWorker] can autowire successfully.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class NoopAiGenerationLatencyNotification : AiGenerationLatencyNotification {
    override fun notifyLongGeneration(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) = Unit
}
