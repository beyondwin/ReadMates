package com.readmates.aigen.application.port.out

import java.util.UUID

/**
 * Outbound port for the long-running generation notification (spec §10.x).
 *
 * The worker invokes this when a full generation exceeded the threshold
 * configured via `readmates.aigen.job.notification-latency-threshold` (default 60s).
 * Phase 6 supplies the concrete implementation (in-app notification + email/push).
 */
interface AiGenerationLatencyNotification {
    fun notifyLongGeneration(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    )
}
