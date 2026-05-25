package com.readmates.admin.health.application.model

import java.time.Instant

data class HealthCardMetric(
    val value: Double?,
    val unit: String,
    val label: String?,
)

data class HealthCardThresholds(
    val warn: Double?,
    val crit: Double?,
)

data class HealthCard(
    val id: String,
    val title: String,
    val status: HealthCardStatus,
    val metric: HealthCardMetric?,
    val thresholds: HealthCardThresholds?,
    val lastCheckedAt: Instant,
    val source: HealthCardSource,
    val drill: HealthCardDrill?,
    val reason: String?,
    val deployStrip: List<DeployAttemptStripEntry>? = null,
)
