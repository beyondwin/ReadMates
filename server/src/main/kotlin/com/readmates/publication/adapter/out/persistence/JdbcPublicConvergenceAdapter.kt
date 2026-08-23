package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.AppendPublicConvergenceEventCommand
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
import org.springframework.transaction.annotation.Transactional
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

    @Transactional
    override fun appendEvent(command: AppendPublicConvergenceEventCommand): PublicConvergenceEvent {
        val context = lockAppendContext(command.convergenceId)
        val history = lockEventHistory(command.convergenceId)
        requireCanonicalHistory(context, history)
        val expected = expectedCursor(context, history)
        check(command.expectedAttemptNo == expected.attemptNo && command.expectedEventSeq == expected.eventSeq) {
            "Public convergence event cursor is stale or non-contiguous"
        }
        requireExpectedStatus(command, expected)
        val event =
            PublicConvergenceEvent(
                convergenceId = command.convergenceId,
                attemptNo = expected.attemptNo,
                eventSeq = expected.eventSeq,
                status = command.status,
                observedAt = command.observedAt,
                resultCategory = command.resultCategory,
            )
        jdbcTemplate.update(
            """
            insert into public_convergence_events (
              convergence_id, publication_id_snapshot, session_id_snapshot,
              attempt_no, event_seq, status, observed_at, result_category
            ) values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            event.convergenceId.dbString(),
            context.publicationIdSnapshot.dbString(),
            context.sessionIdSnapshot.dbString(),
            event.attemptNo,
            event.eventSeq,
            event.status.name,
            event.observedAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            event.resultCategory,
        )
        if (event.eventSeq == TERMINAL_EVENT_SEQ) {
            val advanced =
                jdbcTemplate.update(
                    """
                    update public_convergence_work
                    set next_attempt_no = ?, updated_at = utc_timestamp(6)
                    where convergence_id = ? and next_attempt_no = ?
                    """.trimIndent(),
                    event.attemptNo + 1,
                    event.convergenceId.dbString(),
                    event.attemptNo,
                )
            check(advanced == 1) { "Public convergence work cursor changed unexpectedly" }
        }
        return event
    }

    private fun lockAppendContext(convergenceId: UUID): AppendContext =
        jdbcTemplate
            .query(
                """
                select receipt.publication_id_snapshot, receipt.session_id_snapshot, work.next_attempt_no
                from public_mutation_convergence_receipts receipt
                join public_convergence_work work on work.convergence_id = receipt.convergence_id
                where receipt.convergence_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    AppendContext(
                        publicationIdSnapshot = resultSet.uuid("publication_id_snapshot"),
                        sessionIdSnapshot = resultSet.uuid("session_id_snapshot"),
                        nextAttemptNo = resultSet.getInt("next_attempt_no"),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull() ?: throw IllegalStateException("Public convergence receipt/work does not exist")

    private fun lockEventHistory(convergenceId: UUID): List<StoredEvent> =
        jdbcTemplate.query(
            """
            select publication_id_snapshot, session_id_snapshot, attempt_no, event_seq, status
            from public_convergence_events
            where convergence_id = ?
            order by attempt_no, event_seq
            for update
            """.trimIndent(),
            { resultSet, _ ->
                StoredEvent(
                    publicationIdSnapshot = resultSet.uuid("publication_id_snapshot"),
                    sessionIdSnapshot = resultSet.uuid("session_id_snapshot"),
                    attemptNo = resultSet.getInt("attempt_no"),
                    eventSeq = resultSet.getInt("event_seq"),
                    status = ConvergenceAttemptStatus.valueOf(resultSet.getString("status")),
                )
            },
            convergenceId.dbString(),
        )

    private fun requireCanonicalHistory(
        context: AppendContext,
        history: List<StoredEvent>,
    ) {
        check(
            history.all { event ->
                event.publicationIdSnapshot == context.publicationIdSnapshot &&
                    event.sessionIdSnapshot == context.sessionIdSnapshot
            },
        ) { "Public convergence event snapshot does not match its receipt" }
    }

    private fun expectedCursor(
        context: AppendContext,
        history: List<StoredEvent>,
    ): EventCursor {
        var attemptNo = 1
        var expectingPending = true
        history.forEach { event ->
            val expectedSeq = if (expectingPending) PENDING_EVENT_SEQ else TERMINAL_EVENT_SEQ
            check(event.attemptNo == attemptNo && event.eventSeq == expectedSeq) {
                "Public convergence event history contains an attempt gap"
            }
            if (expectingPending) {
                check(event.status == ConvergenceAttemptStatus.PENDING) {
                    "Public convergence attempt must start with PENDING"
                }
                expectingPending = false
            } else {
                check(event.status != ConvergenceAttemptStatus.PENDING) {
                    "Public convergence terminal event is invalid"
                }
                attemptNo += 1
                expectingPending = true
            }
        }
        val expected =
            if (expectingPending) {
                EventCursor(attemptNo, PENDING_EVENT_SEQ)
            } else {
                EventCursor(attemptNo, TERMINAL_EVENT_SEQ)
            }
        check(context.nextAttemptNo == attemptNo) { "Public convergence work cursor is inconsistent" }
        return expected
    }

    private fun requireExpectedStatus(
        command: AppendPublicConvergenceEventCommand,
        expected: EventCursor,
    ) {
        if (expected.eventSeq == PENDING_EVENT_SEQ) {
            check(command.status == ConvergenceAttemptStatus.PENDING && command.resultCategory == null) {
                "Public convergence attempt must start with PENDING"
            }
        } else {
            check(command.status != ConvergenceAttemptStatus.PENDING && !command.resultCategory.isNullOrBlank()) {
                "Public convergence terminal event requires a result category"
            }
        }
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

    private fun java.sql.ResultSet.utcOffsetDateTimeOrNull(column: String) =
        getObject(column)?.let {
            utcOffsetDateTime(column)
        }

    private data class AppendContext(
        val publicationIdSnapshot: UUID,
        val sessionIdSnapshot: UUID,
        val nextAttemptNo: Int,
    )

    private data class StoredEvent(
        val publicationIdSnapshot: UUID,
        val sessionIdSnapshot: UUID,
        val attemptNo: Int,
        val eventSeq: Int,
        val status: ConvergenceAttemptStatus,
    )

    private data class EventCursor(
        val attemptNo: Int,
        val eventSeq: Int,
    )

    private companion object {
        const val PENDING_EVENT_SEQ = 0
        const val TERMINAL_EVENT_SEQ = 1
    }
}

private fun java.sql.ResultSet.getLongOrNull(column: String): Long? {
    val value = getLong(column)
    return if (wasNull()) null else value
}
