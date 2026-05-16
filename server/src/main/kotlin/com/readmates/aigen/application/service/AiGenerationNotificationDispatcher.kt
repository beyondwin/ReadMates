package com.readmates.aigen.application.service

import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Production [AiGenerationLatencyNotification] adapter (task 6.3 / spec §10.x).
 *
 * Bridges the AI generation worker's "long generation exceeded threshold" signal
 * into the notification event outbox so the existing notification dispatch
 * pipeline can deliver an in-app notification to the host. Payload carries
 * jobId / sessionId / hostUserId only — the PII invariant forbids any generated
 * body text from reaching the notification module, and the signature itself
 * enforces that contract (no body-typed parameter exists).
 *
 * Channel routing decisions (in-app only — no email in v1) live in
 * [com.readmates.notification.adapter.out.persistence.NotificationDeliveryPlanningOperations]
 * (search `AI_GENERATION_READY`). This class is intentionally a thin adapter.
 *
 * Gated behind `readmates.aigen.enabled=true` AND `readmates.aigen.mock != true`
 * so the `aigen-mock` test profile can swap in
 * [com.readmates.aigen.support.NoopAiGenerationLatencyNotification] (mirrors the
 * OpenAI / Gemini provider adapter conditional pattern — task 4.2 / 5.3).
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
class AiGenerationNotificationDispatcher(
    private val recordNotificationEventUseCase: RecordNotificationEventUseCase,
) : AiGenerationLatencyNotification {
    override fun notifyLongGeneration(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) {
        recordNotificationEventUseCase.recordAiGenerationReady(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
        )
    }
}
