package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
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
}
