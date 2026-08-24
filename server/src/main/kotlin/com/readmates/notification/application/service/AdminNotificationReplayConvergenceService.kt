package com.readmates.notification.application.service

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceAcquisition
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceLease
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceObservation
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceOutcome
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergencePort
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionOperations
import java.time.Clock
import java.time.Instant
import java.util.UUID

@Service
class AdminNotificationReplayConvergenceService(
    private val port: AdminNotificationReplayConvergencePort,
    private val properties: NotificationRuntimeProperties,
    private val transactions: TransactionOperations,
    private val clock: Clock,
) {
    fun processBatch(): Int {
        if (!enabled()) return 0
        var processed = 0
        while (processed < properties.worker.relayBatchSize && processOne()) {
            processed += 1
        }
        return processed
    }

    fun processOne(): Boolean {
        if (!enabled()) return false
        val leaseOwner = UUID.randomUUID().toString()
        val startedAt = clock.instant()
        val acquisition =
            transactions.execute {
                port.acquireNext(
                    leaseOwner = leaseOwner,
                    startedAt = startedAt,
                    leaseExpiresAt = startedAt.plus(properties.worker.claimLease),
                    maxAttempts = properties.kafka.maxDeliveryAttempts,
                )
            }
        return when (acquisition) {
            is AdminNotificationReplayConvergenceAcquisition.Acquired -> finish(acquisition.lease, leaseOwner)
            AdminNotificationReplayConvergenceAcquisition.Unavailable -> false
        }
    }

    private fun finish(
        lease: AdminNotificationReplayConvergenceLease,
        leaseOwner: String,
    ): Boolean {
        val evaluated = observe(lease)
        val completedAt = clock.instant()
        val terminal =
            evaluated.outcome != AdminNotificationReplayConvergenceOutcome.PENDING ||
                lease.attemptNo >= properties.kafka.maxDeliveryAttempts
        val outcome =
            if (terminal && evaluated.outcome == AdminNotificationReplayConvergenceOutcome.PENDING) {
                AdminNotificationReplayConvergenceOutcome.FAILED
            } else {
                evaluated.outcome
            }
        val retryAt = if (terminal) null else completedAt.plus(retryDelay(lease.attemptNo))
        return transactions.execute {
            port.finish(
                lease = lease,
                leaseOwner = leaseOwner,
                outcome = outcome,
                safeErrorCode = evaluated.safeErrorCode,
                completedAt = completedAt,
                retryAt = retryAt,
            )
        }
    }

    private fun observe(lease: AdminNotificationReplayConvergenceLease): Evaluation =
        try {
            evaluate(port.observeTargets(lease.receiptId))
        } catch (_: RuntimeException) {
            Evaluation(
                AdminNotificationReplayConvergenceOutcome.PENDING,
                lease.lastSafeErrorCode ?: OBSERVER_UNAVAILABLE,
            )
        }

    private fun evaluate(observation: AdminNotificationReplayConvergenceObservation): Evaluation {
        if (observation.expectedTargetCount <= 0) {
            return Evaluation(AdminNotificationReplayConvergenceOutcome.FAILED, TARGET_SET_EMPTY)
        }
        if (observation.expectedTargetCount != observation.statuses.size) {
            return Evaluation(AdminNotificationReplayConvergenceOutcome.FAILED, TARGET_MISSING)
        }
        val statuses = observation.statuses.toSet()
        if (statuses.any { it !in KNOWN_DELIVERY_STATES }) {
            return Evaluation(AdminNotificationReplayConvergenceOutcome.PENDING, DELIVERY_STATE_UNKNOWN)
        }
        if (statuses.any { it in ACTIVE_DELIVERY_STATES }) {
            return Evaluation(AdminNotificationReplayConvergenceOutcome.PENDING, DELIVERIES_STILL_PENDING)
        }
        return if ("DEAD" in statuses) {
            Evaluation(AdminNotificationReplayConvergenceOutcome.FAILED, DELIVERY_DEAD)
        } else {
            Evaluation(AdminNotificationReplayConvergenceOutcome.SUCCEEDED, null)
        }
    }

    private fun retryDelay(attemptNo: Int) = properties.worker.retryDelays[attemptNo - 1]

    private fun enabled(): Boolean = properties.enabled && properties.worker.enabled

    private data class Evaluation(
        val outcome: AdminNotificationReplayConvergenceOutcome,
        val safeErrorCode: String?,
    )

    private companion object {
        const val OBSERVER_UNAVAILABLE = "REPLAY_OBSERVER_UNAVAILABLE"
        const val TARGET_MISSING = "REPLAY_TARGET_MISSING"
        const val TARGET_SET_EMPTY = "REPLAY_TARGET_SET_EMPTY"
        const val DELIVERY_STATE_UNKNOWN = "REPLAY_DELIVERY_STATE_UNKNOWN"
        const val DELIVERIES_STILL_PENDING = "DELIVERIES_STILL_PENDING"
        const val DELIVERY_DEAD = "REPLAY_DELIVERY_DEAD"
        val ACTIVE_DELIVERY_STATES = setOf("PENDING", "SENDING", "FAILED")
        val KNOWN_DELIVERY_STATES = ACTIVE_DELIVERY_STATES + setOf("SENT", "SKIPPED", "DEAD")
    }
}
