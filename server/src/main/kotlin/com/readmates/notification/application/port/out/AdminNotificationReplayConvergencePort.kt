package com.readmates.notification.application.port.out

import java.time.Instant
import java.util.UUID

interface AdminNotificationReplayConvergencePort {
    fun acquireNext(
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): AdminNotificationReplayConvergenceAcquisition

    fun observeTargets(receiptId: UUID): AdminNotificationReplayConvergenceObservation

    fun finish(
        lease: AdminNotificationReplayConvergenceLease,
        leaseOwner: String,
        outcome: AdminNotificationReplayConvergenceOutcome,
        safeErrorCode: String?,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean
}

sealed interface AdminNotificationReplayConvergenceAcquisition {
    data class Acquired(
        val lease: AdminNotificationReplayConvergenceLease,
    ) : AdminNotificationReplayConvergenceAcquisition

    data object Unavailable : AdminNotificationReplayConvergenceAcquisition
}

data class AdminNotificationReplayConvergenceLease(
    val convergenceId: UUID,
    val receiptId: UUID,
    val effectTargetId: UUID,
    val attemptNo: Int,
    val lastSafeErrorCode: String?,
)

data class AdminNotificationReplayConvergenceObservation(
    val expectedTargetCount: Int,
    val statuses: List<String>,
)

enum class AdminNotificationReplayConvergenceOutcome {
    PENDING,
    SUCCEEDED,
    FAILED,
}
