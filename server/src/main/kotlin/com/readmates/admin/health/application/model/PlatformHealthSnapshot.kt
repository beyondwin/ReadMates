package com.readmates.admin.health.application.model

import java.time.Instant

data class PlatformHealthSnapshot(
    val schema: String,
    val generatedAt: Instant,
    val cards: List<HealthCard>,
) {
    companion object {
        const val SCHEMA = "platform.health_snapshot.v1"
    }
}
