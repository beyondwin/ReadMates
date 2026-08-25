package com.readmates.publication.adapter.out.persistence

import com.readmates.publication.application.model.ConvergenceAttemptStatus
import com.readmates.publication.application.model.PublicConvergenceEvent
import com.readmates.publication.application.model.PublicConvergenceHostSnapshot
import com.readmates.publication.application.model.PublicConvergenceWork
import com.readmates.publication.application.model.PublicMutationConvergenceReceipt
import com.readmates.publication.application.model.PublicProjectionGeneration
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID
import com.readmates.publication.application.model.AppendPublicConvergenceEventCommand as AppendEventCommand
import com.readmates.publication.application.model.ClaimPublicConvergenceWorkCommand as ClaimWorkCommand
import com.readmates.publication.application.model.ClaimedPublicConvergenceWork as ClaimedWork
import com.readmates.publication.application.model.CompletePublicConvergenceAttemptCommand as CompleteAttemptCommand

@Repository
@Suppress("TooManyFunctions")
class JdbcPublicConvergenceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : PublicConvergencePort {
    private val events = PublicConvergenceEventRepository(jdbcTemplate)
    private val work = PublicConvergenceWorkRepository(jdbcTemplate, events)
    private val receipts = PublicConvergenceReceiptRepository(jdbcTemplate)
    private val hostQuery = PublicConvergenceHostQueryRepository(jdbcTemplate)

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

    override fun loadReceipt(mutationReceiptId: String) = receipts.load(mutationReceiptId)

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
    override fun appendEvent(command: AppendEventCommand): PublicConvergenceEvent = events.appendAndAdvance(command)

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

    @Transactional
    override fun claimNext(command: ClaimWorkCommand): ClaimedWork? = work.claim(command)

    @Transactional
    override fun completeAttempt(command: CompleteAttemptCommand): PublicConvergenceEvent = work.complete(command)

    override fun purgeExpiredWork(
        createdBefore: java.time.Instant,
        now: java.time.Instant,
        limit: Int,
    ): Int {
        if (limit <= 0) return 0
        return jdbcTemplate.update(
            """
            delete from public_convergence_work
            where created_at <= ?
              and (lease_expires_at is null or lease_expires_at <= ?)
              and exists (
                select 1 from public_mutation_convergence_receipts receipt
                where receipt.convergence_id = public_convergence_work.convergence_id
              )
            order by created_at, convergence_id
            limit ?
            """.trimIndent(),
            createdBefore.atOffset(java.time.ZoneOffset.UTC).toLocalDateTime(),
            now.atOffset(java.time.ZoneOffset.UTC).toLocalDateTime(),
            limit,
        )
    }

    override fun countWorkBacklog(): Long =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from public_convergence_work work
            join public_mutation_convergence_receipts receipt
              on receipt.convergence_id = work.convergence_id
            """.trimIndent(),
            Long::class.java,
        ) ?: 0L

    override fun loadHostSnapshot(
        clubId: UUID,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ): PublicConvergenceHostSnapshot? = hostQuery.load(clubId, sessionId, mutationReceiptId)

    override fun loadLatestHostSnapshot(
        clubId: UUID,
        sessionId: UUID,
    ): PublicConvergenceHostSnapshot? = hostQuery.loadLatest(clubId, sessionId)

    @Transactional
    override fun requestHostRetry(
        clubId: UUID,
        sessionId: UUID,
        convergenceId: UUID,
        now: java.time.Instant,
        maxAttempts: Int,
    ): Boolean = hostQuery.requestRetry(clubId, sessionId, convergenceId, now, maxAttempts)
}

private fun java.sql.ResultSet.getLongOrNull(column: String): Long? {
    val value = getLong(column)
    return if (wasNull()) null else value
}

private fun java.sql.ResultSet.utcOffsetDateTimeOrNull(column: String): java.time.OffsetDateTime? =
    getObject(column)?.let {
        utcOffsetDateTime(column)
    }
