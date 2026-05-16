package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp

private const val ERROR_MESSAGE_MAX_LENGTH = 512

@Repository
class JdbcAiGenerationAuditRepository(
    private val jdbcTemplate: JdbcTemplate,
) : AiGenerationAuditPort {
    override fun insert(entry: AuditLogEntry) {
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id,
              session_id,
              club_id,
              host_user_id,
              kind,
              item,
              provider,
              model,
              transcript_sha256,
              input_tokens,
              cached_input_tokens,
              output_tokens,
              cost_estimate_usd,
              status,
              error_code,
              error_message,
              latency_ms,
              created_at
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            entry.jobId.dbString(),
            entry.sessionId.dbString(),
            entry.clubId.dbString(),
            entry.hostUserId.dbString(),
            entry.kind.name,
            entry.item?.name,
            entry.provider.name,
            entry.model,
            entry.transcriptSha256,
            entry.usage.inputTokens.toIntClamped(),
            entry.usage.cachedInputTokens.toIntClamped(),
            entry.usage.outputTokens.toIntClamped(),
            entry.costEstimateUsd,
            entry.status.name,
            entry.errorCode?.name,
            entry.errorMessage?.take(ERROR_MESSAGE_MAX_LENGTH),
            entry.latencyMs,
            Timestamp.from(entry.createdAt),
        )
    }

    private fun Long.toIntClamped(): Int =
        when {
            this > Int.MAX_VALUE -> Int.MAX_VALUE
            this < Int.MIN_VALUE -> Int.MIN_VALUE
            else -> toInt()
        }
}
