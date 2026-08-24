package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceAcquisition
import com.readmates.club.application.port.out.PlatformAdminHostInvitationConvergenceLease
import com.readmates.club.application.port.out.PlatformAdminHostInvitationDeliveryTarget
import com.readmates.shared.adminmutation.application.model.CorruptAdminCommandClaimException
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

internal class JdbcPlatformAdminHostInvitationConvergenceStore(
    private val jdbcTemplate: JdbcTemplate,
) {
    private val expiredLeaseRecovery = JdbcExpiredHostInvitationLeaseRecovery(jdbcTemplate)

    fun tryAcquire(
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): PlatformAdminHostInvitationConvergenceAcquisition =
        findCandidate(startedAt)?.let {
            acquireCandidate(it, leaseOwner, startedAt, leaseExpiresAt, maxAttempts)
        }
            ?: unavailable()

    private fun acquireCandidate(
        candidate: HostCandidate,
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): PlatformAdminHostInvitationConvergenceAcquisition {
        require(maxAttempts > 0) { "maxAttempts must be positive" }
        lockDigestKeyState(candidate.digestKeyVersion)
        val locked = lockCandidate(candidate.convergenceId)
        val available = locked?.takeIf { it.isAvailableAt(startedAt) }
        return if (available == null) {
            unavailable()
        } else if (available.hasExpiredLease(startedAt)) {
            recoverExpiredLease(available, leaseOwner, startedAt, leaseExpiresAt, maxAttempts)
        } else {
            acquireFreshLease(available, leaseOwner, startedAt, leaseExpiresAt)
        }
    }

    private fun acquireFreshLease(
        candidate: HostCandidate,
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminHostInvitationConvergenceAcquisition {
        insertStartedEvent(jdbcTemplate, candidate, startedAt)
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set lease_owner = ?, lease_expires_at = ?, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING' and next_attempt_no = ?
                """.trimIndent(),
                leaseOwner,
                leaseExpiresAt.dbTime(),
                startedAt.dbTime(),
                candidate.convergenceId.dbString(),
                candidate.receiptId.dbString(),
                candidate.attemptNo,
            ) == 1
        check(updated) { "Host invitation convergence lease acquisition lost its locked candidate" }
        return PlatformAdminHostInvitationConvergenceAcquisition.Acquired(candidate.toLease())
    }

    private fun recoverExpiredLease(
        candidate: HostCandidate,
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): PlatformAdminHostInvitationConvergenceAcquisition =
        expiredLeaseRecovery.recover(candidate, leaseOwner, startedAt, leaseExpiresAt, maxAttempts)

    fun loadTarget(
        lease: PlatformAdminHostInvitationConvergenceLease,
        at: Instant,
    ): PlatformAdminHostInvitationDeliveryTarget? =
        jdbcTemplate
            .query(
                """
                select i.id invitation_id, i.club_id, i.invited_email, i.token_hash,
                       c.name club_name,
                       json_unquote(json_extract(r.safe_result_json, '$.clubSlug')) club_slug
                from invitations i
                join clubs c on c.id = i.club_id
                join platform_admin_club_command_receipts r on r.id = ?
                where i.id = ? and i.status = 'PENDING' and i.accepted_at is null and i.revoked_at is null
                  and i.expires_at > ?
                  and json_unquote(json_extract(r.safe_result_json, '$.clubId')) = i.club_id
                """.trimIndent(),
                { resultSet, _ ->
                    PlatformAdminHostInvitationDeliveryTarget(
                        invitationId = resultSet.uuid("invitation_id"),
                        clubId = resultSet.uuid("club_id"),
                        email = resultSet.getString("invited_email"),
                        clubName = resultSet.getString("club_name"),
                        clubSlug = resultSet.getString("club_slug"),
                        tokenHash = resultSet.getString("token_hash"),
                    )
                },
                lease.receiptId.dbString(),
                lease.invitationId.dbString(),
                at.dbTime(),
            ).firstOrNull()

    fun finish(
        lease: PlatformAdminHostInvitationConvergenceLease,
        leaseOwner: String,
        succeeded: Boolean,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean {
        lockDigestKeyState(lease.digestKeyVersion)
        val owned = lockOwnedLease(lease, leaseOwner)
        return owned?.let {
            finishOwnedLease(it, leaseOwner, succeeded, safeErrorCode, terminalFailure, completedAt, retryAt)
        } ?: false
    }

    private fun finishOwnedLease(
        candidate: HostCandidate,
        leaseOwner: String,
        succeeded: Boolean,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean {
        val nextState =
            when {
                succeeded -> "SUCCEEDED"
                terminalFailure -> "FAILED"
                else -> "PENDING"
            }
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set state = ?, attempt_count = ?, next_attempt_no = ?, lease_owner = null,
                    lease_expires_at = null, last_safe_error_code = ?, available_at = ?, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and lease_owner = ? and next_attempt_no = ?
                """.trimIndent(),
                nextState,
                candidate.attemptNo,
                candidate.attemptNo + 1,
                safeErrorCode,
                retryAt?.dbTime(),
                completedAt.dbTime(),
                candidate.convergenceId.dbString(),
                candidate.receiptId.dbString(),
                leaseOwner,
                candidate.attemptNo,
            ) == 1
        if (updated) insertFinishedEvent(jdbcTemplate, candidate, succeeded, safeErrorCode, completedAt)
        return updated
    }

    private fun findCandidate(at: Instant): HostCandidate? =
        jdbcTemplate
            .query(
                """
                select c.id, c.receipt_id_snapshot, c.effect_target_id_snapshot, c.state,
                       c.next_attempt_no, c.lease_owner, c.lease_expires_at, c.available_at,
                       r.digest_key_version
                from platform_admin_club_command_convergence c
                join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
                where c.effect_type = 'HOST_INVITATION' and c.state = 'PENDING'
                  and c.available_at <= ? and (c.lease_owner is null or c.lease_expires_at <= ?)
                order by c.available_at, c.id
                limit 1
                """.trimIndent(),
                { resultSet, _ -> resultSet.toHostCandidate() },
                at.dbTime(),
                at.dbTime(),
            ).firstOrNull()

    private fun lockCandidate(convergenceId: UUID): HostCandidate? =
        jdbcTemplate
            .query(
                """
                select c.id, c.receipt_id_snapshot, c.effect_target_id_snapshot, c.state,
                       c.next_attempt_no, c.lease_owner, c.lease_expires_at, c.available_at,
                       r.digest_key_version
                from platform_admin_club_command_convergence c
                join platform_admin_club_command_receipts r on r.id = c.receipt_id_snapshot
                where c.id = ? and c.effect_type = 'HOST_INVITATION'
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.toHostCandidate() },
                convergenceId.dbString(),
            ).firstOrNull()

    private fun lockOwnedLease(
        lease: PlatformAdminHostInvitationConvergenceLease,
        leaseOwner: String,
    ): HostCandidate? = lockCandidate(lease.convergenceId)?.takeIf { it.matches(lease, leaseOwner) }

    private fun lockDigestKeyState(digestKeyVersion: Int) {
        val locked =
            jdbcTemplate.queryForObject(
                """
                select digest_key_version
                from platform_admin_command_digest_key_state
                where digest_key_version = ?
                for update
                """.trimIndent(),
                Int::class.java,
                digestKeyVersion,
            )
        if (locked != digestKeyVersion) throw CorruptAdminCommandClaimException()
    }
}

private class JdbcExpiredHostInvitationLeaseRecovery(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun recover(
        candidate: HostCandidate,
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): PlatformAdminHostInvitationConvergenceAcquisition {
        insertFinishedEvent(jdbcTemplate, candidate, false, AMBIGUOUS_ERROR_CODE, startedAt)
        return if (candidate.attemptNo >= maxAttempts) {
            terminalize(candidate, startedAt)
            PlatformAdminHostInvitationConvergenceAcquisition.Terminalized
        } else {
            acquireNext(candidate, leaseOwner, startedAt, leaseExpiresAt)
        }
    }

    private fun terminalize(
        candidate: HostCandidate,
        at: Instant,
    ) {
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set state = 'FAILED', attempt_count = ?, next_attempt_no = ?, lease_owner = null,
                    lease_expires_at = null, last_safe_error_code = ?, available_at = null, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING'
                  and lease_owner = ? and next_attempt_no = ?
                """.trimIndent(),
                candidate.attemptNo,
                candidate.attemptNo + 1,
                AMBIGUOUS_ERROR_CODE,
                at.dbTime(),
                candidate.convergenceId.dbString(),
                candidate.receiptId.dbString(),
                candidate.leaseOwner,
                candidate.attemptNo,
            ) == 1
        check(updated) { "Host invitation convergence terminalization lost its expired lease" }
    }

    private fun acquireNext(
        candidate: HostCandidate,
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminHostInvitationConvergenceAcquisition {
        val next = candidate.nextAttempt(leaseOwner, leaseExpiresAt, startedAt)
        val updated =
            jdbcTemplate.update(
                """
                update platform_admin_club_command_convergence
                set attempt_count = ?, next_attempt_no = ?, lease_owner = ?, lease_expires_at = ?,
                    last_safe_error_code = ?, available_at = ?, updated_at = ?
                where id = ? and receipt_id_snapshot = ? and state = 'PENDING'
                  and lease_owner = ? and next_attempt_no = ?
                """.trimIndent(),
                candidate.attemptNo,
                next.attemptNo,
                leaseOwner,
                leaseExpiresAt.dbTime(),
                AMBIGUOUS_ERROR_CODE,
                startedAt.dbTime(),
                startedAt.dbTime(),
                candidate.convergenceId.dbString(),
                candidate.receiptId.dbString(),
                candidate.leaseOwner,
                candidate.attemptNo,
            ) == 1
        check(updated) { "Host invitation convergence retry lost its expired lease" }
        insertStartedEvent(jdbcTemplate, next, startedAt)
        return PlatformAdminHostInvitationConvergenceAcquisition.Acquired(next.toLease())
    }
}

private fun insertStartedEvent(
    jdbcTemplate: JdbcTemplate,
    candidate: HostCandidate,
    at: Instant,
) {
    jdbcTemplate.update(
        """
        insert into platform_admin_club_command_convergence_events (
          convergence_id, receipt_id_snapshot, effect_type, effect_target_id_snapshot,
          attempt_no, event_seq, state, safe_error_code, observed_at
        ) values (?, ?, 'HOST_INVITATION', ?, ?, 0, 'PENDING', null, ?)
        on duplicate key update convergence_id = values(convergence_id)
        """.trimIndent(),
        candidate.convergenceId.dbString(),
        candidate.receiptId.dbString(),
        candidate.invitationId.dbString(),
        candidate.attemptNo,
        at.dbTime(),
    )
}

private fun insertFinishedEvent(
    jdbcTemplate: JdbcTemplate,
    candidate: HostCandidate,
    succeeded: Boolean,
    safeErrorCode: String?,
    at: Instant,
) {
    jdbcTemplate.update(
        """
        insert into platform_admin_club_command_convergence_events (
          convergence_id, receipt_id_snapshot, effect_type, effect_target_id_snapshot,
          attempt_no, event_seq, state, safe_error_code, observed_at
        ) values (?, ?, 'HOST_INVITATION', ?, ?, 1, ?, ?, ?)
        """.trimIndent(),
        candidate.convergenceId.dbString(),
        candidate.receiptId.dbString(),
        candidate.invitationId.dbString(),
        candidate.attemptNo,
        if (succeeded) "SUCCEEDED" else "FAILED",
        safeErrorCode,
        at.dbTime(),
    )
}

private data class HostCandidate(
    val convergenceId: UUID,
    val receiptId: UUID,
    val invitationId: UUID,
    val digestKeyVersion: Int,
    val state: String,
    val attemptNo: Int,
    val leaseOwner: String?,
    val leaseExpiresAt: Instant?,
    val availableAt: Instant?,
) {
    fun isAvailableAt(at: Instant): Boolean =
        state == "PENDING" &&
            availableAt?.let { !it.isAfter(at) } == true &&
            (leaseOwner == null || leaseExpiresAt?.let { !it.isAfter(at) } == true)

    fun hasExpiredLease(at: Instant): Boolean = leaseOwner != null && leaseExpiresAt?.let { !it.isAfter(at) } == true

    fun nextAttempt(
        nextLeaseOwner: String,
        nextLeaseExpiresAt: Instant,
        nextAvailableAt: Instant,
    ): HostCandidate =
        copy(
            attemptNo = attemptNo + 1,
            leaseOwner = nextLeaseOwner,
            leaseExpiresAt = nextLeaseExpiresAt,
            availableAt = nextAvailableAt,
        )

    fun matches(
        lease: PlatformAdminHostInvitationConvergenceLease,
        expectedOwner: String,
    ): Boolean =
        receiptId == lease.receiptId &&
            invitationId == lease.invitationId &&
            digestKeyVersion == lease.digestKeyVersion &&
            attemptNo == lease.attemptNo &&
            leaseOwner == expectedOwner &&
            state == "PENDING"

    fun toLease() =
        PlatformAdminHostInvitationConvergenceLease(
            convergenceId,
            receiptId,
            invitationId,
            digestKeyVersion,
            attemptNo,
        )
}

private fun ResultSet.toHostCandidate() =
    HostCandidate(
        convergenceId = uuid("id"),
        receiptId = uuid("receipt_id_snapshot"),
        invitationId = uuid("effect_target_id_snapshot"),
        digestKeyVersion = getInt("digest_key_version"),
        state = getString("state"),
        attemptNo = getInt("next_attempt_no"),
        leaseOwner = getString("lease_owner"),
        leaseExpiresAt = getTimestamp("lease_expires_at")?.toInstant(),
        availableAt = getTimestamp("available_at")?.toInstant(),
    )

private fun Instant.dbTime() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()

private fun unavailable() = PlatformAdminHostInvitationConvergenceAcquisition.Unavailable

private const val AMBIGUOUS_ERROR_CODE = "MAIL_AMBIGUOUS"
