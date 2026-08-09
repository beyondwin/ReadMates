package com.readmates.admin.health.application.port.out

import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import java.time.Duration

enum class PlatformHealthProvider(
    val cardId: String,
) {
    AI_PROVIDER_AVAILABILITY("ai_provider_availability"),
    DB_POOL("db_pool"),
    DEPLOY_ATTEMPTS_STRIP("deploy_attempts_strip"),
    KAFKA_CONSUMER_LAG("kafka_consumer_lag"),
    NOTIFICATION_DISPATCH_SUCCESS("notification_dispatch_success"),
    OUTBOUND_RESILIENCE("outbound-resilience"),
    OUTBOX_BACKLOG("outbox_backlog"),
    REDIS("redis"),
    ;

    companion object {
        fun fromCardId(cardId: String): PlatformHealthProvider? = entries.firstOrNull { it.cardId == cardId }
    }
}

enum class PlatformHealthProviderOutcome {
    SUCCESS,
    ERROR,
    TIMEOUT,
    REJECTED,
}

enum class PlatformHealthRefreshResult {
    FRESH,
    STALE,
    UNAVAILABLE,
}

interface PlatformAdminHealthMetricsPort {
    fun recordProviderOutcome(
        provider: PlatformHealthProvider,
        result: PlatformHealthProviderOutcome,
    )

    fun recordRefreshOverlap(trigger: PlatformHealthRefreshTrigger)

    fun recordRefreshDuration(
        result: PlatformHealthRefreshResult,
        duration: Duration,
    )

    fun updateStaleAge(seconds: Long)
}
