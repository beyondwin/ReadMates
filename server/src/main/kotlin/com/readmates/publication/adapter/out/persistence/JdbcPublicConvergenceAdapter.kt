package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.ProviderAttemptResult
import com.readmates.publication.application.model.ProviderAttemptStatus
import com.readmates.publication.application.model.ProviderResultCategory
import com.readmates.publication.application.model.PublicConvergenceClaim
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.time.Duration
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

@Component
class JdbcPublicConvergenceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : PublicConvergencePort {
    override fun loadReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt? =
        jdbcTemplate
            .query(
                """
                select mutation_receipt_id, convergence_id, committed_generation
                from public_mutation_convergence_links
                where mutation_receipt_id = ?
                """.trimIndent(),
                { rs, _ ->
                    PublicMutationConvergenceReceipt(
                        mutationReceiptId = rs.getString("mutation_receipt_id"),
                        convergenceId = UUID.fromString(rs.getString("convergence_id")),
                        committedGeneration = rs.getLong("committed_generation"),
                    )
                },
                mutationReceiptId,
            ).firstOrNull()

    override fun loadWork(convergenceId: UUID): PublicConvergenceWork? =
        jdbcTemplate
            .query(
                """
                select convergence_id, next_attempt_no, lease_owner, lease_expires_at
                from public_convergence_work
                where convergence_id = ?
                """.trimIndent(),
                { rs, _ ->
                    PublicConvergenceWork(
                        convergenceId = UUID.fromString(rs.getString("convergence_id")),
                        nextAttemptNo = rs.getInt("next_attempt_no"),
                        leaseOwner = rs.getString("lease_owner"),
                        leaseExpiresAt =
                            rs
                                .getTimestamp("lease_expires_at")
                                ?.toLocalDateTime()
                                ?.toInstant(ZoneOffset.UTC),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull()

    override fun loadCurrentEvent(convergenceId: UUID): PublicConvergenceEvent? =
        jdbcTemplate
            .query(
                """
                select convergence_id, attempt_no, event_seq, status, observed_at, result_category
                from public_convergence_current
                where convergence_id = ?
                """.trimIndent(),
                { rs, _ ->
                    PublicConvergenceEvent(
                        convergenceId = UUID.fromString(rs.getString("convergence_id")),
                        attemptNo = rs.getInt("attempt_no"),
                        eventSeq = rs.getInt("event_seq"),
                        status = ConvergenceAttemptStatus.valueOf(rs.getString("status")),
                        observedAt = rs.getTimestamp("observed_at").toLocalDateTime().toInstant(ZoneOffset.UTC),
                        resultCategory = rs.getString("result_category"),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull()

    @Transactional(isolation = Isolation.READ_COMMITTED)
    override fun claimNext(
        leaseOwner: String,
        now: Instant,
        leaseDuration: Duration,
        maxAttempts: Int,
    ): PublicConvergenceClaim? {
        require(leaseOwner.isNotBlank() && leaseOwner.length <= 128)
        val nowUtc = now.utc()
        val row =
            jdbcTemplate
                .query(
                    """
                    select convergence_id, next_attempt_no, club_id_snapshot,
                           session_id_snapshot, publication_id_snapshot
                    from public_convergence_work work
                    where work.available_at <= ?
                      and (work.lease_owner is null or work.lease_expires_at <= ?)
                      and work.next_attempt_no <= ?
                      and not exists (
                        select 1 from public_convergence_events events
                        where events.convergence_id = work.convergence_id
                          and binary events.status = binary 'SUCCEEDED'
                      )
                    order by work.available_at, work.created_at, work.convergence_id
                    limit 1 for update skip locked
                    """.trimIndent(),
                    { rs, _ ->
                        ClaimRow(
                            convergenceId = UUID.fromString(rs.getString("convergence_id")),
                            attemptNo = rs.getInt("next_attempt_no"),
                            clubId = UUID.fromString(rs.getString("club_id_snapshot")),
                            sessionId = rs.getString("session_id_snapshot")?.let(UUID::fromString),
                            publicationId = rs.getString("publication_id_snapshot")?.let(UUID::fromString),
                        )
                    },
                    nowUtc,
                    nowUtc,
                    maxAttempts,
                ).firstOrNull() ?: return null
        val leaseExpiresAt = now.plus(leaseDuration)
        jdbcTemplate.update(
            """
            update public_convergence_work
            set lease_owner = ?, lease_expires_at = ?, updated_at = ?
            where convergence_id = ?
            """.trimIndent(),
            leaseOwner,
            leaseExpiresAt.utc(),
            nowUtc,
            row.convergenceId.dbString(),
        )
        jdbcTemplate.update(
            """
            insert ignore into public_convergence_events (
              convergence_id, attempt_no, event_seq, pending_event_seq, status,
              observed_at, result_category, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, created_at
            ) values (?, ?, 0, 0, 'PENDING', ?, null, ?, ?, ?, ?)
            """.trimIndent(),
            row.convergenceId.dbString(),
            row.attemptNo,
            nowUtc,
            row.clubId.dbString(),
            row.sessionId?.dbString(),
            row.publicationId?.dbString(),
            nowUtc,
        )
        return PublicConvergenceClaim(
            convergenceId = row.convergenceId,
            attemptNo = row.attemptNo,
            leaseOwner = leaseOwner,
            leaseExpiresAt = leaseExpiresAt,
            clubIdSnapshot = row.clubId,
            sessionIdSnapshot = row.sessionId,
            publicationIdSnapshot = row.publicationId,
        )
    }

    @Transactional
    override fun completeAttempt(
        claim: PublicConvergenceClaim,
        result: ProviderAttemptResult,
        observedAt: Instant,
        nextAvailableAt: Instant,
        maxAttempts: Int,
    ): Boolean {
        val lease =
            jdbcTemplate
                .query(
                    """
                    select lease_owner, lease_expires_at, retention_until
                    from public_convergence_work
                    where convergence_id = ?
                    for update
                    """.trimIndent(),
                    { rs, _ ->
                        LeaseRow(
                            owner = rs.getString("lease_owner"),
                            expiresAt = rs.getTimestamp("lease_expires_at")?.toLocalDateTime(),
                            retentionUntil = rs.getTimestamp("retention_until").toLocalDateTime(),
                        )
                    },
                    claim.convergenceId.dbString(),
                ).firstOrNull() ?: return false
        if (lease.owner != claim.leaseOwner || lease.expiresAt == null || lease.expiresAt.isBefore(observedAt.utc())) {
            return false
        }
        val inserted =
            jdbcTemplate.update(
                """
                insert ignore into public_convergence_events (
                  convergence_id, attempt_no, event_seq, pending_event_seq, status,
                  observed_at, result_category, club_id_snapshot, session_id_snapshot,
                  publication_id_snapshot, created_at
                ) values (?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                claim.convergenceId.dbString(),
                claim.attemptNo,
                result.status.name,
                observedAt.utc(),
                result.category.name,
                claim.clubIdSnapshot.dbString(),
                claim.sessionIdSnapshot?.dbString(),
                claim.publicationIdSnapshot?.dbString(),
                observedAt.utc(),
            )
        if (inserted == 0) return false
        val retryAt =
            if (result.status == ProviderAttemptStatus.FAILED && result.retryable && claim.attemptNo < maxAttempts) {
                nextAvailableAt.utc()
            } else {
                lease.retentionUntil
            }
        jdbcTemplate.update(
            """
            update public_convergence_work
            set next_attempt_no = ?, lease_owner = null, lease_expires_at = null,
                available_at = ?, updated_at = ?
            where convergence_id = ?
            """.trimIndent(),
            claim.attemptNo + 1,
            retryAt,
            observedAt.utc(),
            claim.convergenceId.dbString(),
        )
        return true
    }

    override fun loadLatestView(
        clubId: UUID,
        sessionId: UUID,
        maxAttempts: Int,
    ): PublicConvergenceView? = loadLatestViewInternal(clubId, sessionId, maxAttempts)

    @Transactional
    override fun requestRetry(
        clubId: UUID,
        sessionId: UUID,
        convergenceId: UUID,
        now: Instant,
        maxAttempts: Int,
    ): PublicConvergenceView? {
        val work =
            jdbcTemplate
                .query(
                    """
                    select work.convergence_id, work.next_attempt_no,
                           work.club_id_snapshot, work.session_id_snapshot,
                           work.publication_id_snapshot
                    from public_convergence_work work
                    join public_mutation_convergence_links links
                      on links.convergence_id = work.convergence_id
                    where work.convergence_id = ?
                      and links.club_id_snapshot = ?
                      and links.session_id_snapshot = ?
                      and work.lease_owner is null
                    for update
                    """.trimIndent(),
                    { rs, _ ->
                        RetryRow(
                            convergenceId = UUID.fromString(rs.getString("convergence_id")),
                            attemptNo = rs.getInt("next_attempt_no"),
                            clubId = UUID.fromString(rs.getString("club_id_snapshot")),
                            sessionId = rs.getString("session_id_snapshot")?.let(UUID::fromString),
                            publicationId = rs.getString("publication_id_snapshot")?.let(UUID::fromString),
                        )
                    },
                    convergenceId.dbString(),
                    clubId.dbString(),
                    sessionId.dbString(),
                ).firstOrNull() ?: return null
        val current = loadCurrentEvent(convergenceId) ?: return null
        if (current.status != ConvergenceAttemptStatus.FAILED ||
            current.attemptNo >= maxAttempts ||
            current.resultCategory != ProviderResultCategory.TEMPORARY_FAILURE.name ||
            work.attemptNo != current.attemptNo + 1
        ) {
            return null
        }
        val inserted =
            jdbcTemplate.update(
                """
                insert ignore into public_convergence_events (
                  convergence_id, attempt_no, event_seq, pending_event_seq, status,
                  observed_at, result_category, club_id_snapshot, session_id_snapshot,
                  publication_id_snapshot, created_at
                ) values (?, ?, 0, 0, 'PENDING', ?, null, ?, ?, ?, ?)
                """.trimIndent(),
                work.convergenceId.dbString(),
                work.attemptNo,
                now.utc(),
                work.clubId.dbString(),
                work.sessionId?.dbString(),
                work.publicationId?.dbString(),
                now.utc(),
            )
        if (inserted == 0) return null
        jdbcTemplate.update(
            """
            update public_convergence_work
            set available_at = ?, updated_at = ?
            where convergence_id = ? and lease_owner is null
            """.trimIndent(),
            now.utc(),
            now.utc(),
            convergenceId.dbString(),
        )
        return loadLatestViewInternal(clubId, sessionId, maxAttempts)
    }

    private fun loadLatestViewInternal(
        clubId: UUID,
        sessionId: UUID,
        maxAttempts: Int,
    ): PublicConvergenceView? =
        jdbcTemplate
            .query(
                """
                select links.convergence_id, links.committed_generation,
                       current.attempt_no, current.status, current.observed_at,
                       current.result_category
                from public_mutation_convergence_links links
                left join public_convergence_current current
                  on current.convergence_id = links.convergence_id
                where links.club_id_snapshot = ? and links.session_id_snapshot = ?
                order by links.created_at desc, links.convergence_id desc
                limit 1
                """.trimIndent(),
                { rs, _ ->
                    val status = rs.getString("status") ?: ConvergenceAttemptStatus.PENDING.name
                    val attemptNo = rs.getInt("attempt_no").let { if (rs.wasNull()) 0 else it }
                    val resultCategory = rs.getString("result_category")
                    PublicConvergenceView(
                        convergenceId = UUID.fromString(rs.getString("convergence_id")),
                        originResult = "APPLIED",
                        committedGeneration = rs.getLong("committed_generation"),
                        status = status,
                        lastAttemptAt =
                            rs.getTimestamp("observed_at")?.toLocalDateTime()?.toInstant(ZoneOffset.UTC),
                        retryable =
                            status == ConvergenceAttemptStatus.FAILED.name &&
                                attemptNo < maxAttempts &&
                                resultCategory == ProviderResultCategory.TEMPORARY_FAILURE.name,
                    )
                },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    private fun Instant.utc(): LocalDateTime = atOffset(ZoneOffset.UTC).toLocalDateTime()

    private data class ClaimRow(
        val convergenceId: UUID,
        val attemptNo: Int,
        val clubId: UUID,
        val sessionId: UUID?,
        val publicationId: UUID?,
    )

    private data class LeaseRow(
        val owner: String?,
        val expiresAt: LocalDateTime?,
        val retentionUntil: LocalDateTime,
    )

    private data class RetryRow(
        val convergenceId: UUID,
        val attemptNo: Int,
        val clubId: UUID,
        val sessionId: UUID?,
        val publicationId: UUID?,
    )
}
