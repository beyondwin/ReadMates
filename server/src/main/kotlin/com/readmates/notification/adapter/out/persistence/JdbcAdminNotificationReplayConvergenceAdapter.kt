package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceAcquisition
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceLease
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceObservation
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergenceOutcome
import com.readmates.notification.application.port.out.AdminNotificationReplayConvergencePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAdminNotificationReplayConvergenceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminNotificationReplayConvergencePort {
    override fun acquireNext(
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): AdminNotificationReplayConvergenceAcquisition {
        val candidate =
            lockCandidate(startedAt, maxAttempts)
                ?: return AdminNotificationReplayConvergenceAcquisition.Unavailable
        if (!claim(candidate, leaseOwner, startedAt, leaseExpiresAt)) {
            return AdminNotificationReplayConvergenceAcquisition.Unavailable
        }
        ensureStartedEvent(candidate, startedAt)
        return AdminNotificationReplayConvergenceAcquisition.Acquired(
            AdminNotificationReplayConvergenceLease(
                convergenceId = candidate.convergenceId,
                receiptId = candidate.receiptId,
                effectTargetId = candidate.receiptId,
                attemptNo = candidate.attemptNo,
                lastSafeErrorCode = candidate.lastSafeErrorCode,
            ),
        )
    }

    override fun observeTargets(receiptId: UUID): AdminNotificationReplayConvergenceObservation {
        val rows =
            jdbcTemplate.query(
                """
                select receipt.replayed_count, target.delivery_id_snapshot, delivery.status
                from admin_notification_replay_confirmations receipt
                left join admin_notification_replay_confirmation_targets target
                  on target.confirmation_id = receipt.id
                left join notification_deliveries delivery on delivery.id = target.delivery_id_snapshot
                where receipt.id = ?
                order by target.delivery_id_snapshot
                """.trimIndent(),
                { resultSet, _ ->
                    TargetObservationRow(
                        expectedTargetCount = resultSet.getInt("replayed_count"),
                        status = resultSet.getString("status"),
                    )
                },
                receiptId.dbString(),
            )
        check(rows.isNotEmpty()) { "Notification replay receipt is missing" }
        val expectedTargetCounts = rows.map { it.expectedTargetCount }.toSet()
        check(expectedTargetCounts.size == 1) { "Notification replay receipt denominator changed" }
        return AdminNotificationReplayConvergenceObservation(
            expectedTargetCount = expectedTargetCounts.single(),
            statuses = rows.mapNotNull { it.status },
        )
    }

    override fun finish(
        lease: AdminNotificationReplayConvergenceLease,
        leaseOwner: String,
        outcome: AdminNotificationReplayConvergenceOutcome,
        safeErrorCode: String?,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean {
        if (!lockOwnedLease(lease, leaseOwner, completedAt)) return false
        val updated = updateOutcome(lease, leaseOwner, outcome, safeErrorCode, completedAt, retryAt)
        if (!updated) return false
        insertOutcomeEvent(lease, outcome, safeErrorCode, completedAt)
        return true
    }

    private fun lockCandidate(
        startedAt: Instant,
        maxAttempts: Int,
    ): Candidate? =
        jdbcTemplate
            .query(
                """
                select id, notification_receipt_id_snapshot, next_attempt_no, last_safe_error_code
                from admin_service_command_convergence
                where binary effect_type = binary 'NOTIFICATION_REPLAY'
                  and binary state = binary 'PENDING'
                  and available_at <= ?
                  and attempt_count < ?
                  and (lease_owner is null or lease_expires_at <= ?)
                order by available_at, id
                limit 1
                for update skip locked
                """.trimIndent(),
                { resultSet, _ ->
                    Candidate(
                        convergenceId = resultSet.uuid("id"),
                        receiptId = resultSet.uuid("notification_receipt_id_snapshot"),
                        attemptNo = resultSet.getInt("next_attempt_no"),
                        lastSafeErrorCode = resultSet.getString("last_safe_error_code"),
                    )
                },
                startedAt.dbTime(),
                maxAttempts,
                startedAt.dbTime(),
            ).firstOrNull()

    private fun claim(
        candidate: Candidate,
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
    ): Boolean =
        jdbcTemplate.update(
            """
            update admin_service_command_convergence
            set lease_owner = ?, lease_expires_at = ?, updated_at = ?
            where id = ? and notification_receipt_id_snapshot = ?
              and binary state = binary 'PENDING' and next_attempt_no = ?
              and (lease_owner is null or lease_expires_at <= ?)
            """.trimIndent(),
            leaseOwner,
            leaseExpiresAt.dbTime(),
            startedAt.dbTime(),
            candidate.convergenceId.dbString(),
            candidate.receiptId.dbString(),
            candidate.attemptNo,
            startedAt.dbTime(),
        ) == 1

    private fun ensureStartedEvent(
        candidate: Candidate,
        startedAt: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert ignore into admin_service_command_convergence_events (
              convergence_id, notification_receipt_id_snapshot, ai_receipt_id_snapshot,
              effect_type, effect_target_id_snapshot, attempt_no, event_seq,
              state, safe_error_code, observed_at
            ) values (?, ?, null, 'NOTIFICATION_REPLAY', ?, ?, 0, 'PENDING', null, ?)
            """.trimIndent(),
            candidate.convergenceId.dbString(),
            candidate.receiptId.dbString(),
            candidate.receiptId.dbString(),
            candidate.attemptNo,
            startedAt.dbTime(),
        )
        check(startEventExists(candidate)) { "Notification replay convergence start evidence is missing" }
    }

    private fun startEventExists(candidate: Candidate): Boolean =
        jdbcTemplate.queryForObject(
            """
            select count(*) from admin_service_command_convergence_events
            where convergence_id = ? and notification_receipt_id_snapshot = ?
              and binary effect_type = binary 'NOTIFICATION_REPLAY'
              and effect_target_id_snapshot = ? and attempt_no = ? and event_seq = 0
            """.trimIndent(),
            Long::class.java,
            candidate.convergenceId.dbString(),
            candidate.receiptId.dbString(),
            candidate.receiptId.dbString(),
            candidate.attemptNo,
        ) == 1L

    private fun lockOwnedLease(
        lease: AdminNotificationReplayConvergenceLease,
        leaseOwner: String,
        completedAt: Instant,
    ): Boolean =
        jdbcTemplate
            .query(
                """
                select id from admin_service_command_convergence
                where id = ? and notification_receipt_id_snapshot = ?
                  and binary effect_type = binary 'NOTIFICATION_REPLAY'
                  and effect_target_id_snapshot = ? and binary state = binary 'PENDING'
                  and lease_owner = ? and next_attempt_no = ? and lease_expires_at > ?
                for update
                """.trimIndent(),
                { _, _ -> true },
                lease.convergenceId.dbString(),
                lease.receiptId.dbString(),
                lease.effectTargetId.dbString(),
                leaseOwner,
                lease.attemptNo,
                completedAt.dbTime(),
            ).firstOrNull() == true

    private fun updateOutcome(
        lease: AdminNotificationReplayConvergenceLease,
        leaseOwner: String,
        outcome: AdminNotificationReplayConvergenceOutcome,
        safeErrorCode: String?,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean =
        jdbcTemplate.update(
            """
            update admin_service_command_convergence
            set state = ?, attempt_count = ?, next_attempt_no = ?, lease_owner = null,
                lease_expires_at = null, last_safe_error_code = ?, available_at = ?, updated_at = ?
            where id = ? and notification_receipt_id_snapshot = ? and lease_owner = ?
              and binary state = binary 'PENDING' and next_attempt_no = ? and lease_expires_at > ?
            """.trimIndent(),
            outcome.name,
            lease.attemptNo,
            lease.attemptNo + 1,
            safeErrorCode,
            retryAt?.dbTime(),
            completedAt.dbTime(),
            lease.convergenceId.dbString(),
            lease.receiptId.dbString(),
            leaseOwner,
            lease.attemptNo,
            completedAt.dbTime(),
        ) == 1

    private fun insertOutcomeEvent(
        lease: AdminNotificationReplayConvergenceLease,
        outcome: AdminNotificationReplayConvergenceOutcome,
        safeErrorCode: String?,
        completedAt: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_service_command_convergence_events (
              convergence_id, notification_receipt_id_snapshot, ai_receipt_id_snapshot,
              effect_type, effect_target_id_snapshot, attempt_no, event_seq,
              state, safe_error_code, observed_at
            ) values (?, ?, null, 'NOTIFICATION_REPLAY', ?, ?, 1, ?, ?, ?)
            """.trimIndent(),
            lease.convergenceId.dbString(),
            lease.receiptId.dbString(),
            lease.effectTargetId.dbString(),
            lease.attemptNo,
            outcome.name,
            safeErrorCode,
            completedAt.dbTime(),
        )
    }

    private data class Candidate(
        val convergenceId: UUID,
        val receiptId: UUID,
        val attemptNo: Int,
        val lastSafeErrorCode: String?,
    )

    private data class TargetObservationRow(
        val expectedTargetCount: Int,
        val status: String?,
    )
}

private fun Instant.dbTime(): LocalDateTime = atOffset(ZoneOffset.UTC).toLocalDateTime()
