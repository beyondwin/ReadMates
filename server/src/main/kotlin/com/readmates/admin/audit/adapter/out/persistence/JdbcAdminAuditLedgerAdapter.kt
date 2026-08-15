package com.readmates.admin.audit.adapter.out.persistence

import com.readmates.admin.audit.application.model.AdminAuditFilter
import com.readmates.admin.audit.application.model.AdminAuditSourceRow
import com.readmates.admin.audit.application.model.AdminAuditSourceType
import com.readmates.admin.audit.application.port.out.AdminAuditLedgerReadPort
import com.readmates.shared.db.dbString
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcAdminAuditLedgerAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : AdminAuditLedgerReadPort {
    override fun listPlatformEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, actor_user_id, actor_platform_role, target_user_id, event_type,
                   cast(metadata_json as char) as metadata_json, created_at
            from platform_audit_events
            where created_at >= ? and created_at < ?
              and (? is null or json_unquote(json_extract(metadata_json, '$.clubId')) = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toPlatformRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    override fun listClubEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, actor_user_id, actor_platform_role, club_id, event_type,
                   cast(metadata_json as char) as metadata_json, created_at
            from club_audit_events
            where created_at >= ? and created_at < ?
              and (? is null or club_id = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toClubRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    override fun listAiGenerationEvents(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, job_id, club_id, host_user_id, kind, provider, model, status, error_code,
                   input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            from ai_generation_audit_log
            where created_at >= ? and created_at < ?
              and (? is null or club_id = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toAiRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    override fun listNotificationReplayPreviews(
        filter: AdminAuditFilter,
        pageRequest: PageRequest,
    ): List<AdminAuditSourceRow> =
        jdbcTemplate.query(
            """
            select id, contract_version, actor_user_id, actor_platform_role, club_id, selection_hash,
                   matched_count, expires_at, consumed_at, created_at
            from admin_notification_replay_previews
            where created_at >= ? and created_at < ?
              and (? is null or club_id = ?)
            order by created_at desc, id desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toReplayPreviewRow() },
            filter.from.toSqlTimestamp(),
            filter.to.toSqlTimestamp(),
            filter.clubId?.dbString(),
            filter.clubId?.dbString(),
            pageRequest.limit,
        )

    private fun ResultSet.toPlatformRow(): AdminAuditSourceRow =
        AdminAuditSourceRow(
            sourceType = AdminAuditSourceType.PLATFORM,
            sourceId = getString("id"),
            occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            actorUserId = uuidOrNull("actor_user_id"),
            actorRole = getString("actor_platform_role"),
            clubId = null,
            targetUserId = uuidOrNull("target_user_id"),
            actionType = getString("event_type"),
            outcomeHint = null,
            metadataJson = getString("metadata_json"),
        )

    private fun ResultSet.toClubRow(): AdminAuditSourceRow =
        AdminAuditSourceRow(
            sourceType = AdminAuditSourceType.CLUB,
            sourceId = getString("id"),
            occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            actorUserId = uuidOrNull("actor_user_id"),
            actorRole = getString("actor_platform_role"),
            clubId = uuidOrNull("club_id"),
            targetUserId = null,
            actionType = getString("event_type"),
            outcomeHint = null,
            metadataJson = getString("metadata_json"),
        )

    private fun ResultSet.toAiRow(): AdminAuditSourceRow {
        val jobId = getString("job_id")
        val metadataJson =
            objectMapper.writeValueAsString(
                mapOf(
                    "jobId" to jobId,
                    "provider" to getString("provider"),
                    "model" to getString("model"),
                    "status" to getString("status"),
                    "errorCode" to getString("error_code"),
                    "inputTokens" to getInt("input_tokens"),
                    "cachedInputTokens" to getInt("cached_input_tokens"),
                    "outputTokens" to getInt("output_tokens"),
                    "costEstimateUsd" to getBigDecimal("cost_estimate_usd")?.toPlainString(),
                    "latencyMs" to getInt("latency_ms"),
                ),
            )
        return AdminAuditSourceRow(
            sourceType = AdminAuditSourceType.AI_GENERATION,
            sourceId = getLong("id").toString(),
            occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            actorUserId = uuidOrNull("host_user_id"),
            actorRole = "HOST",
            clubId = uuidOrNull("club_id"),
            targetUserId = null,
            actionType = "AI_GENERATION_AUDIT",
            outcomeHint = getString("status"),
            metadataJson = metadataJson,
        )
    }

    private fun ResultSet.toReplayPreviewRow(): AdminAuditSourceRow {
        val contractVersion = getInt("contract_version")
        val consumedAt = getTimestamp("consumed_at")?.toInstant()?.atOffset(ZoneOffset.UTC)
        val projection = replayPreviewProjection(contractVersion, consumedAt != null)
        val metadataJson =
            objectMapper.writeValueAsString(
                mapOf(
                    "matchedCount" to getInt("matched_count"),
                    "selectionHash" to getString("selection_hash"),
                    "expiresAt" to getTimestamp("expires_at").toInstant().atOffset(ZoneOffset.UTC).toString(),
                    "consumedAt" to consumedAt?.toString(),
                ),
            )
        return AdminAuditSourceRow(
            sourceType = AdminAuditSourceType.NOTIFICATION_REPLAY_PREVIEW,
            sourceId = getString("id"),
            occurredAt = getTimestamp("created_at").toInstant().atOffset(ZoneOffset.UTC),
            actorUserId = uuidOrNull("actor_user_id"),
            actorRole = getString("actor_platform_role"),
            clubId = uuidOrNull("club_id"),
            targetUserId = null,
            actionType = projection.actionType,
            outcomeHint = projection.outcomeHint,
            metadataJson = metadataJson,
        )
    }
}

private fun replayPreviewProjection(
    contractVersion: Int,
    consumed: Boolean,
): ReplayPreviewProjection =
    when {
        contractVersion != ATOMIC_REPLAY_CONTRACT_VERSION ->
            ReplayPreviewProjection("ADMIN_NOTIFICATION_REPLAY_PREVIEW_LEGACY", "UNKNOWN")
        consumed -> ReplayPreviewProjection("ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONSUMED", "CONSUMED")
        else -> ReplayPreviewProjection("ADMIN_NOTIFICATION_REPLAY_PREVIEW_PREPARED", "PREPARED")
    }

private data class ReplayPreviewProjection(
    val actionType: String,
    val outcomeHint: String,
)

private fun ResultSet.uuidOrNull(column: String): UUID? = getString(column)?.let(UUID::fromString)

private fun OffsetDateTime.toSqlTimestamp(): Timestamp = Timestamp.from(toInstant())

private const val ATOMIC_REPLAY_CONTRACT_VERSION = 2
