package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.AppendPublicConvergenceEventCommand
import com.readmates.publication.application.model.ClaimPublicConvergenceWorkCommand
import com.readmates.publication.application.model.ClaimedPublicConvergenceWork
import com.readmates.publication.application.model.CompletePublicConvergenceAttemptCommand
import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceHostSnapshot
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

internal class PublicConvergenceEventRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun appendAndAdvance(command: AppendPublicConvergenceEventCommand): PublicConvergenceEvent {
        val context = lockContext(command.convergenceId)
        val history = lockHistory(command.convergenceId)
        requireCanonicalHistory(context, history)
        val expected = expectedCursor(context, history)
        check(command.expectedAttemptNo == expected.attemptNo && command.expectedEventSeq == expected.eventSeq) {
            "Public convergence event cursor is stale or non-contiguous"
        }
        val event = insert(command, context)
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

    fun lockContext(convergenceId: UUID): AppendContext =
        jdbcTemplate
            .query(
                """
                select receipt.publication_id_snapshot, receipt.session_id_snapshot, work.next_attempt_no,
                       work.lease_owner, work.lease_expires_at
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
                        leaseOwner = resultSet.getString("lease_owner"),
                        leaseExpiresAt = resultSet.utcOffsetDateTimeOrNull("lease_expires_at")?.toInstant(),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull() ?: throw IllegalStateException("Public convergence receipt/work does not exist")

    fun lockHistory(convergenceId: UUID): List<StoredEvent> =
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

    fun requireCanonicalHistory(
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

    fun expectedCursor(
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

    fun insert(
        command: AppendPublicConvergenceEventCommand,
        context: AppendContext,
    ): PublicConvergenceEvent {
        requireExpectedStatus(command)
        val event =
            PublicConvergenceEvent(
                convergenceId = command.convergenceId,
                attemptNo = command.expectedAttemptNo,
                eventSeq = command.expectedEventSeq,
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
        return event
    }

    private fun requireExpectedStatus(command: AppendPublicConvergenceEventCommand) {
        if (command.expectedEventSeq == PENDING_EVENT_SEQ) {
            check(command.status == ConvergenceAttemptStatus.PENDING && command.resultCategory == null) {
                "Public convergence attempt must start with PENDING"
            }
        } else {
            check(command.status != ConvergenceAttemptStatus.PENDING && !command.resultCategory.isNullOrBlank()) {
                "Public convergence terminal event requires a result category"
            }
        }
    }
}

internal class PublicConvergenceWorkRepository(
    private val jdbcTemplate: JdbcTemplate,
    private val events: PublicConvergenceEventRepository,
) {
    fun claim(command: ClaimPublicConvergenceWorkCommand): ClaimedPublicConvergenceWork? {
        val candidate = lockCandidate(command) ?: return null
        val context = events.lockContext(candidate.convergenceId)
        val history = events.lockHistory(candidate.convergenceId)
        events.requireCanonicalHistory(context, history)
        val cursor = events.expectedCursor(context, history)
        check(cursor.attemptNo == candidate.nextAttemptNo) { "Public convergence claim cursor is inconsistent" }
        val claimed =
            jdbcTemplate.update(
                """
                update public_convergence_work
                set lease_owner = ?, lease_expires_at = ?, updated_at = utc_timestamp(6)
                where convergence_id = ? and next_attempt_no = ?
                """.trimIndent(),
                command.workerId,
                command.leaseExpiresAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                candidate.convergenceId.dbString(),
                candidate.nextAttemptNo,
            )
        check(claimed == 1) { "Public convergence work claim changed unexpectedly" }
        if (cursor.eventSeq == PENDING_EVENT_SEQ) {
            events.insert(
                AppendPublicConvergenceEventCommand(
                    convergenceId = candidate.convergenceId,
                    expectedAttemptNo = cursor.attemptNo,
                    expectedEventSeq = cursor.eventSeq,
                    status = ConvergenceAttemptStatus.PENDING,
                    observedAt = command.now,
                    resultCategory = null,
                ),
                context,
            )
        } else {
            check(history.lastOrNull()?.status == ConvergenceAttemptStatus.PENDING) {
                "Only a pending provider attempt may be reclaimed"
            }
        }
        return candidate.claimed(command)
    }

    fun complete(command: CompletePublicConvergenceAttemptCommand): PublicConvergenceEvent {
        check(command.status != ConvergenceAttemptStatus.PENDING) { "Provider completion must be terminal" }
        val context = events.lockContext(command.convergenceId)
        check(
            context.nextAttemptNo == command.attemptNo &&
                context.leaseOwner == command.workerId &&
                context.leaseExpiresAt?.isAfter(command.observedAt) == true,
        ) { "Public convergence completion does not own the active lease" }
        val history = events.lockHistory(command.convergenceId)
        events.requireCanonicalHistory(context, history)
        val cursor = events.expectedCursor(context, history)
        check(cursor.attemptNo == command.attemptNo && cursor.eventSeq == TERMINAL_EVENT_SEQ) {
            "Public convergence completion cursor is stale"
        }
        val event =
            events.insert(
                AppendPublicConvergenceEventCommand(
                    convergenceId = command.convergenceId,
                    expectedAttemptNo = command.attemptNo,
                    expectedEventSeq = TERMINAL_EVENT_SEQ,
                    status = command.status,
                    observedAt = command.observedAt,
                    resultCategory = command.resultCategory,
                ),
                context,
            )
        val nextAttemptNo = if (command.exhausted) Int.MAX_VALUE else command.attemptNo + 1
        val completed =
            jdbcTemplate.update(
                """
                update public_convergence_work
                set next_attempt_no = ?, lease_owner = null, lease_expires_at = null,
                    available_at = ?, updated_at = utc_timestamp(6)
                where convergence_id = ? and next_attempt_no = ? and lease_owner = ?
                """.trimIndent(),
                nextAttemptNo,
                command.nextAvailableAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                command.convergenceId.dbString(),
                command.attemptNo,
                command.workerId,
            )
        check(completed == 1) { "Public convergence completion lost its lease" }
        return event
    }

    private fun lockCandidate(command: ClaimPublicConvergenceWorkCommand): ClaimCandidate? =
        jdbcTemplate
            .query(
                """
                select work.convergence_id, work.next_attempt_no,
                       receipt.publication_id_snapshot, receipt.session_id_snapshot,
                       receipt.committed_generation, receipt.origin_readable
                from public_convergence_work work
                join public_mutation_convergence_receipts receipt
                  on receipt.convergence_id = work.convergence_id
                left join public_convergence_current current
                  on current.convergence_id = work.convergence_id
                where work.available_at <= ?
                  and (work.lease_owner is null or work.lease_expires_at <= ?)
                  and work.next_attempt_no <= ?
                  and (current.status is null or binary current.status <> binary 'SUCCEEDED')
                order by work.available_at, work.created_at, work.convergence_id
                limit 1
                for update skip locked
                """.trimIndent(),
                { resultSet, _ ->
                    ClaimCandidate(
                        convergenceId = resultSet.uuid("convergence_id"),
                        nextAttemptNo = resultSet.getInt("next_attempt_no"),
                        publicationId = resultSet.uuid("publication_id_snapshot"),
                        sessionId = resultSet.uuid("session_id_snapshot"),
                        committedGeneration = resultSet.getLong("committed_generation"),
                        originReadable = resultSet.getBoolean("origin_readable"),
                    )
                },
                command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                command.maxAttempts,
            ).firstOrNull()
}

internal class PublicConvergenceHostQueryRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun load(
        clubId: UUID,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ): PublicConvergenceHostSnapshot? =
        jdbcTemplate
            .query(
                """
                select receipt.mutation_receipt_id, receipt.convergence_id,
                       receipt.publication_id_snapshot, receipt.session_id_snapshot,
                       receipt.committed_generation, receipt.origin_readable,
                       work.next_attempt_no,
                       current.attempt_no, current.event_seq, current.status,
                       current.observed_at, current.result_category
                from (
                  select mutation_receipt_id, convergence_id, publication_id_snapshot,
                         session_id_snapshot, committed_generation, origin_readable
                  from public_mutation_convergence_receipts
                  union all
                  select mutation_receipt_id, convergence_id, publication_id_snapshot,
                         session_id_snapshot, committed_generation, origin_readable
                  from public_mutation_convergence_links
                ) receipt
                left join public_convergence_work work on work.convergence_id = receipt.convergence_id
                join active_sessions sessions on sessions.id = receipt.session_id_snapshot
                left join public_convergence_current current on current.convergence_id = receipt.convergence_id
                where receipt.mutation_receipt_id = ? and receipt.session_id_snapshot = ?
                  and sessions.club_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    val receipt =
                        PublicMutationConvergenceReceipt(
                            mutationReceiptId = resultSet.getString("mutation_receipt_id"),
                            convergenceId = resultSet.uuid("convergence_id"),
                            publicationIdSnapshot =
                                resultSet.getString("publication_id_snapshot")?.let(UUID::fromString),
                            sessionIdSnapshot = resultSet.getString("session_id_snapshot")?.let(UUID::fromString),
                            committedGeneration = resultSet.getLong("committed_generation"),
                            originReadable = resultSet.getBoolean("origin_readable"),
                        )
                    val status = resultSet.getString("status")
                    PublicConvergenceHostSnapshot(
                        receipt = receipt,
                        currentEvent =
                            status?.let {
                                PublicConvergenceEvent(
                                    convergenceId = receipt.convergenceId,
                                    attemptNo = resultSet.getInt("attempt_no"),
                                    eventSeq = resultSet.getInt("event_seq"),
                                    status = ConvergenceAttemptStatus.valueOf(it),
                                    observedAt = resultSet.utcOffsetDateTime("observed_at").toInstant(),
                                    resultCategory = resultSet.getString("result_category"),
                                )
                            },
                        nextAttemptNo = resultSet.getIntOrNull("next_attempt_no"),
                    )
                },
                mutationReceiptId.dbString(),
                sessionId.dbString(),
                clubId.dbString(),
            ).firstOrNull()
}

internal class PublicConvergenceReceiptRepository(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun load(mutationReceiptId: String): PublicMutationConvergenceReceipt? =
        loadOriginReceipt(mutationReceiptId) ?: loadProjectionLinkReceipt(mutationReceiptId)

    private fun loadOriginReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt? =
        jdbcTemplate
            .query(
                """
                select mutation_receipt_id, convergence_id, publication_id_snapshot,
                       session_id_snapshot, committed_generation, origin_readable
                from public_mutation_convergence_receipts
                where mutation_receipt_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PublicMutationConvergenceReceipt(
                        mutationReceiptId = resultSet.getString("mutation_receipt_id"),
                        convergenceId = resultSet.uuid("convergence_id"),
                        publicationIdSnapshot = resultSet.uuid("publication_id_snapshot"),
                        sessionIdSnapshot = resultSet.uuid("session_id_snapshot"),
                        committedGeneration = resultSet.getLong("committed_generation"),
                        originReadable = resultSet.getBoolean("origin_readable"),
                    )
                },
                mutationReceiptId,
            ).firstOrNull()

    private fun loadProjectionLinkReceipt(mutationReceiptId: String): PublicMutationConvergenceReceipt? =
        jdbcTemplate
            .query(
                """
                select mutation_receipt_id, convergence_id, publication_id_snapshot,
                       session_id_snapshot, committed_generation, origin_readable
                from public_mutation_convergence_links
                where mutation_receipt_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PublicMutationConvergenceReceipt(
                        mutationReceiptId = resultSet.getString("mutation_receipt_id"),
                        convergenceId = resultSet.uuid("convergence_id"),
                        publicationIdSnapshot = resultSet.getString("publication_id_snapshot")?.let(UUID::fromString),
                        sessionIdSnapshot = resultSet.getString("session_id_snapshot")?.let(UUID::fromString),
                        committedGeneration = resultSet.getLong("committed_generation"),
                        originReadable = resultSet.getBoolean("origin_readable"),
                    )
                },
                mutationReceiptId,
            ).firstOrNull()
}

internal data class AppendContext(
    val publicationIdSnapshot: UUID,
    val sessionIdSnapshot: UUID,
    val nextAttemptNo: Int,
    val leaseOwner: String?,
    val leaseExpiresAt: Instant?,
)

internal data class StoredEvent(
    val publicationIdSnapshot: UUID,
    val sessionIdSnapshot: UUID,
    val attemptNo: Int,
    val eventSeq: Int,
    val status: ConvergenceAttemptStatus,
)

internal data class EventCursor(
    val attemptNo: Int,
    val eventSeq: Int,
)

private data class ClaimCandidate(
    val convergenceId: UUID,
    val nextAttemptNo: Int,
    val publicationId: UUID,
    val sessionId: UUID,
    val committedGeneration: Long,
    val originReadable: Boolean,
) {
    fun claimed(command: ClaimPublicConvergenceWorkCommand) =
        ClaimedPublicConvergenceWork(
            convergenceId = convergenceId,
            publicationId = publicationId,
            sessionId = sessionId,
            committedGeneration = committedGeneration,
            originReadable = originReadable,
            attemptNo = nextAttemptNo,
            workerId = command.workerId,
            leaseExpiresAt = command.leaseExpiresAt,
        )
}

private fun java.sql.ResultSet.utcOffsetDateTimeOrNull(column: String): java.time.OffsetDateTime? =
    getObject(column)?.let {
        utcOffsetDateTime(column)
    }

private fun java.sql.ResultSet.getIntOrNull(column: String): Int? {
    val value = getInt(column)
    return if (wasNull()) null else value
}

private const val PENDING_EVENT_SEQ = 0
private const val TERMINAL_EVENT_SEQ = 1
