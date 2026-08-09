package com.readmates.admin.health.application.port.out

import com.readmates.admin.health.application.model.PlatformHealthRefreshState
import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import java.time.Duration

enum class PlatformHealthProviderOutcome {
    SUCCESS,
    ERROR,
    TIMEOUT,
    REJECTED,
}

interface PlatformAdminHealthMetricsPort {
    fun recordProviderOutcome(
        provider: String,
        result: PlatformHealthProviderOutcome,
    )

    fun recordRefreshOverlap(trigger: PlatformHealthRefreshTrigger)

    fun recordRefreshDuration(
        result: PlatformHealthRefreshState,
        duration: Duration,
    )

    fun updateStaleAge(seconds: Long)
}
