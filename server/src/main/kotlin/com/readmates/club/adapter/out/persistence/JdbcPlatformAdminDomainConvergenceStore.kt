package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.model.NormalizedClubDomainHostname
import com.readmates.club.application.port.out.PlatformAdminDomainConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminDomainConvergenceLease
import com.readmates.club.application.port.out.PlatformAdminDomainTargetObservation
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

internal class JdbcPlatformAdminDomainConvergenceStore(
    jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
) {
    private val acquisition = JdbcDomainConvergenceAcquisition(jdbcTemplate, objectMapper)
    private val completion = JdbcDomainConvergenceCompletion(jdbcTemplate)

    fun tryAcquire(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminDomainConvergenceAcquisition {
        val acquired = acquisition.tryAcquire(convergenceId, leaseOwner, now, leaseExpiresAt)
        return acquired
    }

    fun loadOperationalHostname(domainId: UUID): NormalizedClubDomainHostname? {
        val hostname = acquisition.loadOperationalHostname(domainId)
        return hostname
    }

    fun finish(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean = completion.finish(lease, leaseOwner, result, safeErrorCode, terminalFailure, completedAt, retryAt)
}

private class JdbcDomainConvergenceAcquisition(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun tryAcquire(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminDomainConvergenceAcquisition =
        loadCandidateForUpdate(convergenceId)?.let { candidate ->
            acquireCandidate(candidate, leaseOwner, now, leaseExpiresAt)
        } ?: unavailable()

    fun loadOperationalHostname(domainId: UUID): NormalizedClubDomainHostname? =
        jdbcTemplate
            .query(
                "select hostname from club_domains where id = ?",
                { resultSet, _ -> NormalizedClubDomainHostname(resultSet.getString("hostname")) },
                domainId.dbString(),
            ).firstOrNull()

    private fun acquireCandidate(
        candidate: DomainConvergenceCandidate,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminDomainConvergenceAcquisition =
        if (!candidate.isAvailable(now)) {
            unavailable()
        } else {
            lockTarget(candidate.domainId)?.let { target ->
                acquireMatchingTarget(candidate, target, leaseOwner, now, leaseExpiresAt)
            } ?: terminalize(candidate, DOMAIN_TARGET_NOT_FOUND, now)
        }

    private fun acquireMatchingTarget(
        candidate: DomainConvergenceCandidate,
        target: PlatformAdminDomainTargetObservation,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminDomainConvergenceAcquisition =
        when {
            !candidate.matches(target) -> terminalize(candidate, DOMAIN_TARGET_STALE, now)
            !updateLease(candidate, leaseOwner, now, leaseExpiresAt) -> unavailable()
            else -> acquired(candidate, target, now)
        }

    private fun acquired(
        candidate: DomainConvergenceCandidate,
        target: PlatformAdminDomainTargetObservation,
        now: Instant,
    ): PlatformAdminDomainConvergenceAcquisition {
        insertStartedEvent(jdbcTemplate, candidate, now)
        return PlatformAdminDomainConvergenceAcquisition.Acquired(
            PlatformAdminDomainConvergenceLease(
                candidate.convergenceId,
                candidate.receiptId,
                candidate.domainId,
                candidate.attemptNo,
                target,
            ),
        )
    }

    private fun loadCandidateForUpdate(convergenceId: UUID): DomainConvergenceCandidate? =
        jdbcTemplate
            .query(
                """
                select c.id, c.receipt_id_snapshot, c.state, c.next_attempt_no, c.lease_owner,
                       c.lease_expires_at, c.last_safe_error_code, c.available_at,
                       previous_finish.observed_at previous_finished_at,
                       cast(r.safe_result_json as char) safe_result_json
                from platform_admin_club_command_convergence c
                join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
                left join platform_admin_club_command_convergence_events previous_finish
                  on previous_finish.convergence_id = c.id
                 and previous_finish.attempt_no = c.next_attempt_no - 1
                 and previous_finish.event_seq = 1
                where c.id = ?
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.toCandidate(objectMapper) },
                convergenceId.dbString(),
            ).firstOrNull()

    private fun lockTarget(domainId: UUID): PlatformAdminDomainTargetObservation? =
        jdbcTemplate
            .query(
                """
                select status, updated_at, provisioning_error_code
                from club_domains where id = ? for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.toTargetObservation() },
                domainId.dbString(),
            ).firstOrNull()

    private fun updateLease(
        candidate: DomainConvergenceCandidate,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): Boolean =
        jdbcTemplate.update(
            """
            update platform_admin_club_command_convergence
            set lease_owner = ?, lease_expires_at = ?, updated_at = ?
            where id = ? and receipt_id_snapshot = ? and state = 'PENDING' and next_attempt_no = ?
            """.trimIndent(),
            leaseOwner,
            leaseExpiresAt.dbTime(),
            now.dbTime(),
            candidate.convergenceId.dbString(),
            candidate.receiptId.dbString(),
            candidate.attemptNo,
        ) == 1

    private fun terminalize(
        candidate: DomainConvergenceCandidate,
        safeErrorCode: String,
        now: Instant,
    ): PlatformAdminDomainConvergenceAcquisition {
        insertStartedEvent(jdbcTemplate, candidate, now)
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set state = 'FAILED', attempt_count = ?, next_attempt_no = ?, lease_owner = null,
                    lease_expires_at = null, last_safe_error_code = ?, available_at = null, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING' and next_attempt_no = ?
                """.trimIndent(),
                candidate.attemptNo,
                candidate.attemptNo + 1,
                safeErrorCode,
                now.dbTime(),
                candidate.convergenceId.dbString(),
                candidate.receiptId.dbString(),
                candidate.attemptNo,
            ) == 1
        check(updated) { "Domain convergence terminalization lost ownership" }
        insertFinishedEvent(
            jdbcTemplate,
            candidate.convergenceId,
            candidate.receiptId,
            candidate.attemptNo,
            safeErrorCode,
            now,
        )
        return PlatformAdminDomainConvergenceAcquisition.Terminalized
    }
}

private class JdbcDomainConvergenceCompletion(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun finish(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean =
        if (!lockOwnedLease(lease, leaseOwner)) {
            false
        } else {
            finishOwnedLease(lease, leaseOwner, result, safeErrorCode, terminalFailure, completedAt, retryAt)
        }

    private fun finishOwnedLease(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean =
        if (!updateDomain(lease, result, safeErrorCode, completedAt)) {
            val targetError = if (targetExists(lease.domainId)) DOMAIN_TARGET_STALE else DOMAIN_TARGET_NOT_FOUND
            terminalizeOwnedLease(lease, leaseOwner, targetError, completedAt)
        } else {
            updateOwnedConvergence(lease, leaseOwner, result, safeErrorCode, terminalFailure, completedAt, retryAt)
        }

    private fun lockOwnedLease(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
    ): Boolean =
        jdbcTemplate
            .query(
                """
                select id from platform_admin_club_command_convergence
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING'
                  and lease_owner = ? and next_attempt_no = ?
                for update
                """.trimIndent(),
                { _, _ -> true },
                lease.convergenceId.dbString(),
                lease.receiptId.dbString(),
                leaseOwner,
                lease.attemptNo,
            ).firstOrNull() == true

    private fun updateDomain(
        lease: PlatformAdminDomainConvergenceLease,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        completedAt: Instant,
    ): Boolean {
        val succeeded = result.status == ClubDomainStatus.ACTIVE
        return jdbcTemplate.update(
            """
            update club_domains
            set status = ?, verified_at = ?, last_checked_at = ?, provisioning_error_code = ?, updated_at = ?
            where id = ? and status = ? and updated_at = ? and provisioning_error_code <=> ?
            """.trimIndent(),
            if (succeeded) ClubDomainStatus.ACTIVE.name else ClubDomainStatus.FAILED.name,
            completedAt.dbTime().takeIf { succeeded },
            completedAt.dbTime(),
            safeErrorCode.takeUnless { succeeded },
            completedAt.dbTime(),
            lease.domainId.dbString(),
            lease.targetObservation.status.name,
            lease.targetObservation.updatedAt.dbTime(),
            lease.targetObservation.safeErrorCode,
        ) == 1
    }

    private fun updateOwnedConvergence(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean {
        val succeeded = result.status == ClubDomainStatus.ACTIVE
        val state =
            if (succeeded) {
                "SUCCEEDED"
            } else if (terminalFailure) {
                "FAILED"
            } else {
                "PENDING"
            }
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set state = ?, attempt_count = ?, next_attempt_no = ?, lease_owner = null,
                    lease_expires_at = null, last_safe_error_code = ?, available_at = ?, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING'
                  and lease_owner = ? and next_attempt_no = ?
                """.trimIndent(),
                state,
                lease.attemptNo,
                lease.attemptNo + 1,
                safeErrorCode.takeUnless { succeeded },
                retryAt?.dbTime(),
                completedAt.dbTime(),
                lease.convergenceId.dbString(),
                lease.receiptId.dbString(),
                leaseOwner,
                lease.attemptNo,
            ) == 1
        if (updated) insertFinishedEvent(jdbcTemplate, lease, safeErrorCode.takeUnless { succeeded }, completedAt)
        return updated
    }

    private fun terminalizeOwnedLease(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        safeErrorCode: String,
        completedAt: Instant,
    ): Boolean {
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set state = 'FAILED', attempt_count = ?, next_attempt_no = ?, lease_owner = null,
                    lease_expires_at = null, last_safe_error_code = ?, available_at = null, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING'
                  and lease_owner = ? and next_attempt_no = ?
                """.trimIndent(),
                lease.attemptNo,
                lease.attemptNo + 1,
                safeErrorCode,
                completedAt.dbTime(),
                lease.convergenceId.dbString(),
                lease.receiptId.dbString(),
                leaseOwner,
                lease.attemptNo,
            ) == 1
        if (updated) insertFinishedEvent(jdbcTemplate, lease, safeErrorCode, completedAt)
        return updated
    }

    private fun targetExists(domainId: UUID): Boolean =
        jdbcTemplate
            .query(
                "select id from club_domains where id = ? for update",
                { _, _ -> true },
                domainId.dbString(),
            ).firstOrNull() == true
}

private data class DomainConvergenceCandidate(
    val convergenceId: UUID,
    val receiptId: UUID,
    val domainId: UUID,
    val state: String,
    val attemptNo: Int,
    val leaseOwner: String?,
    val leaseExpiresAt: Instant?,
    val lastSafeErrorCode: String?,
    val availableAt: Instant?,
    val previousFinishedAt: Instant?,
    val originStatus: ClubDomainStatus,
    val originTargetUpdatedAt: Instant,
) {
    fun isAvailable(now: Instant): Boolean =
        state == "PENDING" && availableAt?.let { !it.isAfter(now) } == true &&
            (leaseOwner == null || leaseExpiresAt?.let { !it.isAfter(now) } == true)

    fun matches(target: PlatformAdminDomainTargetObservation): Boolean {
        val expectedStatus = if (attemptNo == 1) originStatus else ClubDomainStatus.FAILED
        val expectedUpdatedAt = if (attemptNo == 1) originTargetUpdatedAt else previousFinishedAt
        val errorMatches = attemptNo == 1 || target.safeErrorCode == lastSafeErrorCode
        return expectedUpdatedAt != null && target.status == expectedStatus &&
            target.updatedAt == expectedUpdatedAt && errorMatches
    }
}

private fun ResultSet.toCandidate(objectMapper: ObjectMapper): DomainConvergenceCandidate {
    val safeResult = objectMapper.readTree(getString("safe_result_json"))
    return DomainConvergenceCandidate(
        convergenceId = uuid("id"),
        receiptId = uuid("receipt_id_snapshot"),
        domainId = UUID.fromString(safeResult.path("targetId").asString()),
        state = getString("state"),
        attemptNo = getInt("next_attempt_no"),
        leaseOwner = getString("lease_owner"),
        leaseExpiresAt = getTimestamp("lease_expires_at")?.toInstant(),
        lastSafeErrorCode = getString("last_safe_error_code"),
        availableAt = getTimestamp("available_at")?.toInstant(),
        previousFinishedAt = getTimestamp("previous_finished_at")?.toInstant(),
        originStatus = ClubDomainStatus.valueOf(safeResult.path("expectedDomainStatus").asString()),
        originTargetUpdatedAt = Instant.parse(safeResult.path("originTargetUpdatedAt").asString()),
    )
}

private fun ResultSet.toTargetObservation() =
    PlatformAdminDomainTargetObservation(
        ClubDomainStatus.valueOf(getString("status")),
        getTimestamp("updated_at").toInstant(),
        getString("provisioning_error_code"),
    )

private fun insertStartedEvent(
    jdbcTemplate: JdbcTemplate,
    candidate: DomainConvergenceCandidate,
    now: Instant,
) {
    jdbcTemplate.update(
        """
        insert into platform_admin_club_command_convergence_events (
          convergence_id, receipt_id_snapshot, effect_type, attempt_no, event_seq,
          state, safe_error_code, observed_at
        ) values (?, ?, 'DOMAIN_PROVISIONING', ?, 0, 'PENDING', null, ?)
        on duplicate key update convergence_id = values(convergence_id)
        """.trimIndent(),
        candidate.convergenceId.dbString(),
        candidate.receiptId.dbString(),
        candidate.attemptNo,
        now.dbTime(),
    )
}

private fun insertFinishedEvent(
    jdbcTemplate: JdbcTemplate,
    lease: PlatformAdminDomainConvergenceLease,
    safeErrorCode: String?,
    completedAt: Instant,
) = insertFinishedEvent(
    jdbcTemplate,
    lease.convergenceId,
    lease.receiptId,
    lease.attemptNo,
    safeErrorCode,
    completedAt,
)

private fun insertFinishedEvent(
    jdbcTemplate: JdbcTemplate,
    convergenceId: UUID,
    receiptId: UUID,
    attemptNo: Int,
    safeErrorCode: String?,
    completedAt: Instant,
) {
    jdbcTemplate.update(
        """
        insert into platform_admin_club_command_convergence_events (
          convergence_id, receipt_id_snapshot, effect_type, attempt_no, event_seq,
          state, safe_error_code, observed_at
        ) values (?, ?, 'DOMAIN_PROVISIONING', ?, 1, ?, ?, ?)
        """.trimIndent(),
        convergenceId.dbString(),
        receiptId.dbString(),
        attemptNo,
        if (safeErrorCode == null) "SUCCEEDED" else "FAILED",
        safeErrorCode,
        completedAt.dbTime(),
    )
}

private fun unavailable() = PlatformAdminDomainConvergenceAcquisition.Unavailable

private fun Instant.dbTime() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()

private const val DOMAIN_TARGET_NOT_FOUND = "DOMAIN_TARGET_NOT_FOUND"
private const val DOMAIN_TARGET_STALE = "DOMAIN_TARGET_STALE"
