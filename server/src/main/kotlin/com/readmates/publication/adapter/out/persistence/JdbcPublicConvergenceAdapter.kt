package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import com.readmates.publication.application.model.PublicProjectionGeneration
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcPublicConvergenceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : PublicConvergencePort {
    override fun loadGenerationBySession(sessionId: UUID): PublicProjectionGeneration? =
        jdbcTemplate
            .query(
                """
                select publication_id, generation, live_record_revision, origin_readable
                from public_projection_generations
                where session_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PublicProjectionGeneration(
                        publicationId = resultSet.uuid("publication_id"),
                        generation = resultSet.getLong("generation"),
                        liveRecordRevision = resultSet.getLongOrNull("live_record_revision"),
                        originReadable = resultSet.getBoolean("origin_readable"),
                    )
                },
                sessionId.dbString(),
            ).firstOrNull()

    override fun loadReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt? =
        jdbcTemplate
            .query(
                """
                select mutation_receipt_id, convergence_id, committed_generation
                from public_mutation_convergence_receipts
                where mutation_receipt_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PublicMutationConvergenceReceipt(
                        mutationReceiptId = resultSet.getString("mutation_receipt_id"),
                        convergenceId = resultSet.uuid("convergence_id"),
                        committedGeneration = resultSet.getLong("committed_generation"),
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
                { resultSet, _ ->
                    PublicConvergenceWork(
                        convergenceId = resultSet.uuid("convergence_id"),
                        nextAttemptNo = resultSet.getInt("next_attempt_no"),
                        leaseOwner = resultSet.getString("lease_owner"),
                        leaseExpiresAt = resultSet.utcOffsetDateTimeOrNull("lease_expires_at")?.toInstant(),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull()

    override fun appendEvent(
        publicationIdSnapshot: UUID,
        sessionIdSnapshot: UUID,
        event: PublicConvergenceEvent,
    ) {
        jdbcTemplate.update(
            """
            insert into public_convergence_events (
              convergence_id, publication_id_snapshot, session_id_snapshot,
              attempt_no, event_seq, status, observed_at, result_category
            ) values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            event.convergenceId.dbString(),
            publicationIdSnapshot.dbString(),
            sessionIdSnapshot.dbString(),
            event.attemptNo,
            event.eventSeq,
            event.status.name,
            event.observedAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            event.resultCategory,
        )
    }

    override fun currentEvent(convergenceId: UUID): PublicConvergenceEvent? =
        jdbcTemplate
            .query(
                """
                select convergence_id, attempt_no, event_seq, status, observed_at, result_category
                from public_convergence_current
                where convergence_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PublicConvergenceEvent(
                        convergenceId = resultSet.uuid("convergence_id"),
                        attemptNo = resultSet.getInt("attempt_no"),
                        eventSeq = resultSet.getInt("event_seq"),
                        status = ConvergenceAttemptStatus.valueOf(resultSet.getString("status")),
                        observedAt = resultSet.utcOffsetDateTime("observed_at").toInstant(),
                        resultCategory = resultSet.getString("result_category"),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull()

    private fun java.sql.ResultSet.getLongOrNull(column: String): Long? {
        val value = getLong(column)
        return if (wasNull()) null else value
    }

    private fun java.sql.ResultSet.utcOffsetDateTimeOrNull(column: String) =
        getObject(column)?.let {
            utcOffsetDateTime(column)
        }
}
