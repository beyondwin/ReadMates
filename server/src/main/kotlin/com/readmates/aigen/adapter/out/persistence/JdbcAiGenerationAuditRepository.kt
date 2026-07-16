package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp

private const val ERROR_MESSAGE_MAX_LENGTH = 512
private val TRACE_ID_PATTERN = Regex("^[0-9a-fA-F]{32}$")
private val INSERT_AUDIT_SQL =
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
      created_at,
      pipeline_version,
      input_turn_count,
      speaker_count,
      grounding_status,
      grounding_warning_count,
      reviewed_section_count,
      user_edited_section_count,
      trace_id,
      provider_attempt,
      provider_call_mode,
      cost_basis,
      cache_write_input_tokens
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """.trimIndent()

@Repository
class JdbcAiGenerationAuditRepository(
    private val jdbcTemplate: JdbcTemplate,
) : AiGenerationAuditPort {
    override fun insert(entry: AuditLogEntry) {
        require(entry.traceId == null || TRACE_ID_PATTERN.matches(entry.traceId)) {
            "traceId must be a 32-character hexadecimal value or null"
        }
        jdbcTemplate.update(INSERT_AUDIT_SQL, *entry.insertParameters())
    }

    private fun AuditLogEntry.insertParameters(): Array<Any?> =
        arrayOf(
            jobId.dbString(),
            sessionId.dbString(),
            clubId.dbString(),
            hostUserId.dbString(),
            kind.name,
            item?.name,
            provider.name,
            model,
            transcriptSha256,
            usage.nonCachedInputTokens.toIntClamped(),
            usage.publicCachedInputTokens.toIntClamped(),
            usage.outputTokens.toIntClamped(),
            costEstimateUsd,
            status.name,
            errorCode?.name,
            errorMessage?.take(ERROR_MESSAGE_MAX_LENGTH),
            latencyMs,
            Timestamp.from(createdAt),
            pipelineVersion,
            inputTurnCount,
            speakerCount,
            groundingStatus,
            groundingWarningCount,
            reviewedSectionCount,
            userEditedSectionCount,
            traceId,
            providerAttempt,
            providerCallMode?.name,
            costBasis.name,
            usage.cacheWriteInputTokens.toIntClamped(),
        )

    private fun Long.toIntClamped(): Int =
        when {
            this > Int.MAX_VALUE -> Int.MAX_VALUE
            this < Int.MIN_VALUE -> Int.MIN_VALUE
            else -> toInt()
        }
}
