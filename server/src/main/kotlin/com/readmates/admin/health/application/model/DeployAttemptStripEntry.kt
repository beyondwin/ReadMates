package com.readmates.admin.health.application.model

import java.time.Instant

enum class DeployAttemptFinalStatus { SUCCEEDED, FAILED, RUNNING }

data class DeployAttemptStripEntry(
    val attemptId: String,
    val startedAt: Instant,
    val endedAt: Instant?,
    val finalStatus: DeployAttemptFinalStatus,
    val imageTag: String?,
    val durationSeconds: Long?,
)
