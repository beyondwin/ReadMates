package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.aigen.application.model.AiOpsWindowUsage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditPort
import com.readmates.aigen.application.port.out.AiGenerationAuditQueryPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAiGenerationOpsAuditRepository(
    private val jdbcTemplate: JdbcTemplate,
) : AiGenerationAuditQueryPort,
    AiGenerationAdminActionAuditPort {
    override fun countFailuresSince(since: Instant): Long =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from ai_generation_audit_log
            where status = 'FAILED'
              and created_at >= ?
            """.trimIndent(),
            Long::class.java,
            Timestamp.from(since),
        ) ?: 0L

    override fun costSince(since: Instant): BigDecimal =
        jdbcTemplate.queryForObject(
            """
            select coalesce(sum(cost_estimate_usd), 0)
            from ai_generation_audit_log
            where created_at >= ?
            """.trimIndent(),
            BigDecimal::class.java,
            Timestamp.from(since),
        ) ?: BigDecimal.ZERO

    override fun windowUsageBetween(
        start: Instant,
        endExclusive: Instant,
    ): AiOpsWindowUsage =
        jdbcTemplate
            .query(
                """
                select
                  coalesce(sum(cost_estimate_usd), 0) as cost,
                  count(*) as cnt
                from ai_generation_audit_log
                where created_at >= ?
                  and created_at < ?
                """.trimIndent(),
                { rs, _ ->
                    AiOpsWindowUsage(
                        costUsd = rs.getBigDecimal("cost"),
                        jobCount = rs.getLong("cnt"),
                    )
                },
                Timestamp.from(start),
                Timestamp.from(endExclusive),
            ).first()

    override fun failureCodesSince(since: Instant): List<AiOpsFailureCodeCount> =
        jdbcTemplate.query(
            """
            select error_code, count(*) as failure_count
            from ai_generation_audit_log
            where status = 'FAILED'
              and error_code is not null
              and created_at >= ?
            group by error_code
            order by failure_count desc, error_code asc
            """.trimIndent(),
            { rs, _ ->
                AiOpsFailureCodeCount(
                    code = rs.getString("error_code"),
                    count = rs.getLong("failure_count"),
                )
            },
            Timestamp.from(since),
        )

    override fun providerCostsSince(since: Instant): List<AiOpsProviderCost> =
        jdbcTemplate.query(
            """
            select provider, model, coalesce(sum(cost_estimate_usd), 0) as cost_estimate_usd
            from ai_generation_audit_log
            where created_at >= ?
            group by provider, model
            order by cost_estimate_usd desc, provider asc, model asc
            """.trimIndent(),
            { rs, _ ->
                AiOpsProviderCost(
                    provider = Provider.valueOf(rs.getString("provider")),
                    model = rs.getString("model"),
                    costEstimateUsd = rs.getBigDecimal("cost_estimate_usd"),
                )
            },
            Timestamp.from(since),
        )

    override fun listJobs(filters: AiOpsJobFilters): AiOpsJobList {
        val params = mutableListOf<Any>()
        val where = StringBuilder("where 1 = 1")
        addFilters(where, params, filters)
        val rows =
            jdbcTemplate.query(
                """
                select
                  a.id as audit_id,
                  a.job_id,
                  a.club_id,
                  c.slug as club_slug,
                  c.name as club_name,
                  a.session_id,
                  s.number as session_number,
                  s.book_title,
                  a.kind,
                  a.status as audit_status,
                  a.provider,
                  a.model,
                  a.error_code,
                  a.error_message,
                  a.cost_estimate_usd,
                  a.created_at
                from ai_generation_audit_log a
                left join clubs c on c.id = a.club_id
                left join sessions s on s.id = a.session_id
                $where
                order by a.created_at desc, a.id desc
                limit ${LIST_LIMIT + 1}
                """.trimIndent(),
                { rs, _ -> rs.getLong("audit_id") to rs.toJobListItem() },
                *params.toTypedArray(),
            )
        val items = rows.take(LIST_LIMIT).map { it.second }
        val nextCursor = if (rows.size > LIST_LIMIT) rows[LIST_LIMIT - 1].first.toString() else null
        return AiOpsJobList(items, nextCursor)
    }

    override fun findJobById(jobId: UUID): AiOpsJobListItem? =
        jdbcTemplate
            .query(
                """
                select
                  a.id as audit_id,
                  a.job_id,
                  a.club_id,
                  c.slug as club_slug,
                  c.name as club_name,
                  a.session_id,
                  s.number as session_number,
                  s.book_title,
                  a.kind,
                  a.status as audit_status,
                  a.provider,
                  a.model,
                  a.error_code,
                  a.error_message,
                  a.cost_estimate_usd,
                  a.created_at
                from ai_generation_audit_log a
                left join clubs c on c.id = a.club_id
                left join sessions s on s.id = a.session_id
                where a.job_id = ?
                order by a.created_at desc, a.id desc
                limit 1
                """.trimIndent(),
                { rs, _ -> rs.toJobListItem() },
                jobId.dbString(),
            ).firstOrNull()

    override fun record(entry: AiGenerationAdminActionAuditEntry) {
        jdbcTemplate.update(
            """
            insert into ai_generation_admin_action_audit (
              job_id,
              club_id,
              session_id,
              admin_user_id,
              admin_role,
              action,
              previous_status,
              next_status,
              result,
              safe_error_code,
              created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            entry.jobId.dbString(),
            entry.clubId.dbString(),
            entry.sessionId.dbString(),
            entry.adminUserId.dbString(),
            entry.adminRole.name,
            entry.action,
            entry.previousStatus,
            entry.nextStatus,
            entry.result,
            entry.safeErrorCode,
            Timestamp.from(entry.createdAt),
        )
    }

    private fun addFilters(
        where: StringBuilder,
        params: MutableList<Any>,
        filters: AiOpsJobFilters,
    ) {
        filters.status?.let { status ->
            when (status) {
                JobStatus.PENDING,
                JobStatus.RUNNING,
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
                -> where.append(" and 1 = 0")
                JobStatus.COMMITTED -> {
                    where.append(" and a.status = 'SUCCESS' and a.kind = 'COMMIT'")
                }
                JobStatus.SUCCEEDED -> {
                    where.append(" and a.status = 'SUCCESS' and a.kind <> 'COMMIT'")
                }
                JobStatus.FAILED,
                JobStatus.CANCELLED,
                -> {
                    where.append(" and a.status = ?")
                    params += status.toAuditStatus()
                }
            }
        }
        filters.clubId?.let { clubId ->
            where.append(" and a.club_id = ?")
            params += clubId.dbString()
        }
        filters.errorCode?.let { errorCode ->
            where.append(" and a.error_code = ?")
            params += errorCode
        }
        filters.cursor?.toLongOrNull()?.let { cursor ->
            where.append(" and a.id < ?")
            params += cursor
        }
    }

    private fun ResultSet.toJobListItem(): AiOpsJobListItem {
        val kind = getString("kind")
        val auditStatus = getString("audit_status")
        val createdAt = getInstant("created_at")
        return AiOpsJobListItem(
            jobId = uuid("job_id"),
            clubId = uuid("club_id"),
            clubSlug = getString("club_slug"),
            clubName = null,
            sessionId = uuid("session_id"),
            sessionNumber = getObject("session_number") as? Int,
            bookTitle = null,
            status = auditStatusToJobStatus(kind, auditStatus),
            stage = null,
            provider = Provider.valueOf(getString("provider")),
            model = getString("model"),
            errorCode = getString("error_code"),
            safeErrorMessage = null,
            costEstimateUsd = getBigDecimal("cost_estimate_usd"),
            createdAt = createdAt,
            lastUpdatedAt = createdAt,
            expiresAt = null,
            staleCandidate = false,
            availableActions = emptySet(),
        )
    }

    private fun ResultSet.getInstant(column: String): Instant = getObject(column, LocalDateTime::class.java).toInstant(ZoneOffset.UTC)

    private fun JobStatus.toAuditStatus(): String =
        when (this) {
            JobStatus.FAILED -> "FAILED"
            JobStatus.CANCELLED -> "CANCELLED"
            JobStatus.SUCCEEDED,
            JobStatus.COMMITTED,
            -> "SUCCESS"
            JobStatus.PENDING,
            JobStatus.RUNNING,
            JobStatus.COMMITTING,
            JobStatus.COMMIT_RETRY,
            -> error("Active job status $this is not stored in ai_generation_audit_log")
        }

    private fun auditStatusToJobStatus(
        kind: String,
        auditStatus: String,
    ): JobStatus =
        when (auditStatus) {
            "FAILED" -> JobStatus.FAILED
            "CANCELLED" -> JobStatus.CANCELLED
            else -> if (kind == "COMMIT") JobStatus.COMMITTED else JobStatus.SUCCEEDED
        }

    private companion object {
        const val LIST_LIMIT = 50
    }
}
