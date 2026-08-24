package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceAcquisition
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceLease
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceOutcome
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandPort
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandReceiptRecord
import com.readmates.aigen.application.port.out.LoadAiGenerationAdminCommandPreviewResult
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOrigin
import com.readmates.aigen.application.port.out.StoreAiGenerationAdminCommandOriginResult
import com.readmates.aigen.application.port.out.StoredAiGenerationAdminCommandPreview
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@Repository
@Suppress("TooManyFunctions", "ReturnCount")
class JdbcAiGenerationAdminCommandRepository(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : AiGenerationAdminCommandPort {
    override fun savePreview(preview: StoredAiGenerationAdminCommandPreview) {
        jdbcTemplate.update(
            """
            insert into ai_generation_admin_command_previews (
              id, action, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, job_id_snapshot, club_id_snapshot,
              job_status_snapshot, job_revision_snapshot, canonical_schema_version,
              digest_key_version, request_hmac, sanitized_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, null, null, ?)
            """.trimIndent(),
            preview.previewId.dbString(),
            preview.action.name,
            preview.actorAdminId.dbString(),
            preview.actorRoleSnapshot,
            objectMapper.writeValueAsString(preview.actorCapabilities),
            preview.jobId.dbString(),
            preview.clubId.dbString(),
            preview.jobStatus.name,
            preview.jobRevision,
            preview.canonicalSchemaVersion,
            preview.digestKeyVersion,
            preview.requestHmac,
            objectMapper.writeValueAsString(preview.sanitizedImpact),
            preview.expiresAt.utc(),
            preview.createdAt.utc(),
        )
    }

    override fun loadPreview(previewId: UUID): LoadAiGenerationAdminCommandPreviewResult =
        jdbcTemplate
            .query(
                """
                select id, action, actor_user_id_snapshot, actor_platform_role_snapshot,
                       cast(actor_capabilities_json as char) actor_capabilities_json,
                       job_id_snapshot, club_id_snapshot, job_status_snapshot, job_revision_snapshot,
                       canonical_schema_version, digest_key_version, request_hmac,
                       cast(sanitized_impact_json as char) sanitized_impact_json,
                       expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
                from ai_generation_admin_command_previews where id = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toPreview() },
                previewId.dbString(),
            ).firstOrNull()
            ?.let(LoadAiGenerationAdminCommandPreviewResult::Loaded)
            ?: LoadAiGenerationAdminCommandPreviewResult.Missing

    override fun storeOrigin(command: StoreAiGenerationAdminCommandOrigin): StoreAiGenerationAdminCommandOriginResult {
        if (!previewOpenForUpdate(command.preview.previewId)) {
            return StoreAiGenerationAdminCommandOriginResult.PreviewConsumed
        }
        insertAudit(command)
        insertReceipt(command)
        insertConvergence(command)
        val consumed =
            jdbcTemplate.update(
                """
                update ai_generation_admin_command_previews
                set consumed_at = ?, consumed_receipt_id_snapshot = ?
                where id = ? and consumed_at is null and consumed_receipt_id_snapshot is null
                """.trimIndent(),
                command.occurredAt.utc(),
                command.receiptId.dbString(),
                command.preview.previewId.dbString(),
            ) == 1
        return if (consumed) {
            StoreAiGenerationAdminCommandOriginResult.Stored(command.toReceipt())
        } else {
            StoreAiGenerationAdminCommandOriginResult.PreviewConsumed
        }
    }

    private fun previewOpenForUpdate(previewId: UUID): Boolean =
        jdbcTemplate
            .query(
                """
                select consumed_at is null and consumed_receipt_id_snapshot is null as is_open
                from ai_generation_admin_command_previews where id = ? for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.getBoolean("is_open") },
                previewId.dbString(),
            ).firstOrNull() == true

    override fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        jobId: UUID,
        action: AiOpsAction,
    ): AiGenerationAdminCommandReceiptRecord? =
        jdbcTemplate
            .query(
                """
                select r.id, r.preview_id_snapshot, r.action, r.actor_user_id_snapshot,
                       r.job_id_snapshot, r.club_id_snapshot, r.before_job_status_snapshot,
                       r.before_job_revision_snapshot, r.after_job_status_snapshot,
                       r.after_job_revision_snapshot, r.origin_outcome,
                       cast(r.safe_result_json as char) safe_result_json,
                       c.id convergence_id, c.state effect_status, c.last_safe_error_code
                from ai_generation_admin_command_receipts r
                join admin_service_command_convergence c on c.ai_receipt_id_snapshot = r.id
                where r.id = ? and r.actor_user_id_snapshot = ? and r.job_id_snapshot = ? and r.action = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toReceipt() },
                receiptId.dbString(),
                actorAdminId.dbString(),
                jobId.dbString(),
                action.name,
            ).firstOrNull()

    override fun loadAvailableConvergenceIds(
        now: Instant,
        limit: Int,
    ): List<UUID> =
        jdbcTemplate.query(
            """
            select id from admin_service_command_convergence
            where state = 'PENDING' and ai_receipt_id_snapshot is not null
              and available_at <= ? and (lease_expires_at is null or lease_expires_at <= ?)
            order by available_at, id limit ?
            """.trimIndent(),
            { resultSet, _ -> UUID.fromString(resultSet.getString("id")) },
            now.utc(),
            now.utc(),
            limit,
        )

    override fun tryAcquireConvergence(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): AiGenerationAdminCommandConvergenceAcquisition {
        val candidate =
            loadConvergenceForUpdate(convergenceId)
                ?: return AiGenerationAdminCommandConvergenceAcquisition.Unavailable
        if (candidate.state != "PENDING") return AiGenerationAdminCommandConvergenceAcquisition.Terminalized
        if (candidate.availableAt?.isAfter(now) == true || candidate.leaseExpiresAt?.isAfter(now) == true) {
            return AiGenerationAdminCommandConvergenceAcquisition.Unavailable
        }
        val attemptNo = candidate.attemptCount + 1
        val updated =
            jdbcTemplate.update(
                """
                update admin_service_command_convergence
                set attempt_count = ?, next_attempt_no = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?
                where id = ? and state = 'PENDING' and attempt_count = ?
                """.trimIndent(),
                attemptNo,
                attemptNo + 1,
                leaseOwner,
                leaseExpiresAt.utc(),
                now.utc(),
                convergenceId.dbString(),
                candidate.attemptCount,
            )
        if (updated != 1) return AiGenerationAdminCommandConvergenceAcquisition.Unavailable
        insertConvergenceEvent(candidate, attemptNo, 0, "PENDING", null, now)
        return AiGenerationAdminCommandConvergenceAcquisition.Acquired(
            AiGenerationAdminCommandConvergenceLease(
                convergenceId,
                candidate.receiptId,
                candidate.effectType,
                candidate.jobId,
                candidate.action,
                candidate.expectedJobRevision,
                attemptNo,
            ),
        )
    }

    override fun finishConvergence(
        lease: AiGenerationAdminCommandConvergenceLease,
        leaseOwner: String,
        outcome: AiGenerationAdminCommandConvergenceOutcome,
        completedAt: Instant,
    ): Boolean {
        val candidate = loadConvergenceForUpdate(lease.convergenceId) ?: return false
        val owned =
            candidate.state == "PENDING" &&
                candidate.attemptCount == lease.attemptNo &&
                candidate.leaseOwner == leaseOwner &&
                candidate.leaseExpiresAt?.isAfter(completedAt) == true
        if (!owned) return false
        insertConvergenceEvent(candidate, lease.attemptNo, 1, outcome.state, outcome.safeErrorCode, completedAt)
        return jdbcTemplate.update(
            """
            update admin_service_command_convergence
            set state = ?, lease_owner = null, lease_expires_at = null,
                last_safe_error_code = ?, available_at = ?, updated_at = ?
            where id = ? and state = 'PENDING' and attempt_count = ? and lease_owner = ?
            """.trimIndent(),
            outcome.state,
            outcome.safeErrorCode,
            outcome.availableAt?.utc(),
            completedAt.utc(),
            lease.convergenceId.dbString(),
            lease.attemptNo,
            leaseOwner,
        ) == 1
    }

    private fun insertAudit(command: StoreAiGenerationAdminCommandOrigin) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, 'ADMIN_AI_GENERATION_COMMAND_ACCEPTED', cast(? as json), ?)
            """.trimIndent(),
            command.auditEventId.dbString(),
            command.actorAdminId.dbString(),
            command.actorRoleSnapshot,
            objectMapper.writeValueAsString(
                mapOf(
                    "receiptId" to command.receiptId.toString(),
                    "jobId" to command.preview.jobId.toString(),
                    "action" to command.preview.action.name,
                    "effectType" to command.preview.effectType(),
                    "beforeJobStatus" to command.beforeJobStatus.name,
                    "beforeJobRevision" to command.beforeJobRevision,
                    "providerCancellation" to false,
                ),
            ),
            command.occurredAt.utc(),
        )
    }

    private fun insertReceipt(command: StoreAiGenerationAdminCommandOrigin) {
        jdbcTemplate.update(
            """
            insert into ai_generation_admin_command_receipts (
              id, preview_id_snapshot, action, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, job_id_snapshot, club_id_snapshot,
              before_job_status_snapshot, before_job_revision_snapshot,
              after_job_status_snapshot, after_job_revision_snapshot, origin_outcome,
              canonical_schema_version, digest_key_version, request_hmac, safe_reason_code,
              safe_result_json, platform_audit_event_id_snapshot, origin_at
            ) values (?, ?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, ?, ?, 'ACCEPTED', ?, ?, ?, null,
                      cast(? as json), ?, ?)
            """.trimIndent(),
            command.receiptId.dbString(),
            command.preview.previewId.dbString(),
            command.preview.action.name,
            command.actorAdminId.dbString(),
            command.actorRoleSnapshot,
            objectMapper.writeValueAsString(command.actorCapabilities),
            command.preview.jobId.dbString(),
            command.preview.clubId.dbString(),
            command.beforeJobStatus.name,
            command.beforeJobRevision,
            command.afterJobStatus.name,
            command.afterJobRevision,
            command.digest.schemaVersion,
            command.digest.digestKeyVersion,
            command.digest.requestHmac,
            objectMapper.writeValueAsString(command.safeResult),
            command.auditEventId.dbString(),
            command.occurredAt.utc(),
        )
    }

    private fun insertConvergence(command: StoreAiGenerationAdminCommandOrigin) {
        jdbcTemplate.update(
            """
            insert into admin_service_command_convergence (
              id, notification_receipt_id_snapshot, ai_receipt_id_snapshot, effect_type,
              effect_target_id_snapshot, state, attempt_count, next_attempt_no,
              lease_owner, lease_expires_at, last_safe_error_code, available_at, created_at, updated_at
            ) values (?, null, ?, ?, ?, 'PENDING', 0, 1, null, null, null, ?, ?, ?)
            """.trimIndent(),
            command.convergenceId.dbString(),
            command.receiptId.dbString(),
            command.preview.effectType(),
            command.preview.jobId.dbString(),
            command.occurredAt.utc(),
            command.occurredAt.utc(),
            command.occurredAt.utc(),
        )
    }

    private fun loadConvergenceForUpdate(convergenceId: UUID): ConvergenceCandidate? =
        jdbcTemplate
            .query(
                """
                select c.id, c.ai_receipt_id_snapshot, c.effect_type, c.effect_target_id_snapshot,
                       c.state, c.attempt_count, c.lease_owner, c.lease_expires_at, c.available_at,
                       r.action, r.before_job_revision_snapshot
                from admin_service_command_convergence c
                join ai_generation_admin_command_receipts r on r.id = c.ai_receipt_id_snapshot
                where c.id = ? for update
                """.trimIndent(),
                { resultSet, _ ->
                    ConvergenceCandidate(
                        UUID.fromString(resultSet.getString("id")),
                        UUID.fromString(resultSet.getString("ai_receipt_id_snapshot")),
                        resultSet.getString("effect_type"),
                        UUID.fromString(resultSet.getString("effect_target_id_snapshot")),
                        AiOpsAction.valueOf(resultSet.getString("action")),
                        resultSet.getLong("before_job_revision_snapshot"),
                        resultSet.getString("state"),
                        resultSet.getInt("attempt_count"),
                        resultSet.getString("lease_owner"),
                        resultSet.getTimestamp("lease_expires_at")?.toInstant(),
                        resultSet.getTimestamp("available_at")?.toInstant(),
                    )
                },
                convergenceId.dbString(),
            ).firstOrNull()

    private fun insertConvergenceEvent(
        candidate: ConvergenceCandidate,
        attemptNo: Int,
        eventSeq: Int,
        state: String,
        safeErrorCode: String?,
        observedAt: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_service_command_convergence_events (
              convergence_id, notification_receipt_id_snapshot, ai_receipt_id_snapshot,
              effect_type, effect_target_id_snapshot, attempt_no, event_seq,
              state, safe_error_code, observed_at
            ) values (?, null, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            candidate.id.dbString(),
            candidate.receiptId.dbString(),
            candidate.effectType,
            candidate.jobId.dbString(),
            attemptNo,
            eventSeq,
            state,
            safeErrorCode,
            observedAt.utc(),
        )
    }

    private fun ResultSet.toPreview() =
        StoredAiGenerationAdminCommandPreview(
            previewId = UUID.fromString(getString("id")),
            action = AiOpsAction.valueOf(getString("action")),
            actorAdminId = UUID.fromString(getString("actor_user_id_snapshot")),
            actorRoleSnapshot = getString("actor_platform_role_snapshot"),
            actorCapabilities = objectMapper.readValue(getString("actor_capabilities_json"), STRING_LIST_TYPE),
            jobId = UUID.fromString(getString("job_id_snapshot")),
            clubId = UUID.fromString(getString("club_id_snapshot")),
            jobStatus = JobStatus.valueOf(getString("job_status_snapshot")),
            jobRevision = getLong("job_revision_snapshot"),
            canonicalSchemaVersion = getString("canonical_schema_version"),
            digestKeyVersion = getInt("digest_key_version"),
            requestHmac = getBytes("request_hmac"),
            sanitizedImpact = objectMapper.readValue(getString("sanitized_impact_json"), OBJECT_MAP_TYPE),
            expiresAt = getTimestamp("expires_at").toInstant(),
            consumedAt = getTimestamp("consumed_at")?.toInstant(),
            consumedReceiptId = getString("consumed_receipt_id_snapshot")?.let(UUID::fromString),
            createdAt = getTimestamp("created_at").toInstant(),
        )

    private fun ResultSet.toReceipt() =
        AiGenerationAdminCommandReceiptRecord(
            receiptId = UUID.fromString(getString("id")),
            previewId = UUID.fromString(getString("preview_id_snapshot")),
            action = AiOpsAction.valueOf(getString("action")),
            actorAdminId = UUID.fromString(getString("actor_user_id_snapshot")),
            jobId = UUID.fromString(getString("job_id_snapshot")),
            clubId = UUID.fromString(getString("club_id_snapshot")),
            beforeJobStatus = JobStatus.valueOf(getString("before_job_status_snapshot")),
            beforeJobRevision = getLong("before_job_revision_snapshot"),
            afterJobStatus = JobStatus.valueOf(getString("after_job_status_snapshot")),
            afterJobRevision = getLong("after_job_revision_snapshot"),
            originStatus = getString("origin_outcome"),
            safeResult = objectMapper.readValue(getString("safe_result_json"), STRING_MAP_TYPE),
            convergenceId = UUID.fromString(getString("convergence_id")),
            effectStatus = getString("effect_status"),
            safeErrorCode = getString("last_safe_error_code"),
        )

    private fun StoreAiGenerationAdminCommandOrigin.toReceipt() =
        AiGenerationAdminCommandReceiptRecord(
            receiptId,
            preview.previewId,
            preview.action,
            actorAdminId,
            preview.jobId,
            preview.clubId,
            beforeJobStatus,
            beforeJobRevision,
            afterJobStatus,
            afterJobRevision,
            "ACCEPTED",
            safeResult,
            convergenceId,
            "PENDING",
            null,
        )

    private fun StoredAiGenerationAdminCommandPreview.effectType(): String =
        if (action == AiOpsAction.FORCE_CANCEL) "AI_JOB_CANCEL" else "AI_COMMIT_RETRY"

    private fun Instant.utc() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()

    private companion object {
        val STRING_LIST_TYPE = object : TypeReference<List<String>>() {}
        val STRING_MAP_TYPE = object : TypeReference<Map<String, String>>() {}
        val OBJECT_MAP_TYPE = object : TypeReference<Map<String, Any>>() {}
    }
}

private data class ConvergenceCandidate(
    val id: UUID,
    val receiptId: UUID,
    val effectType: String,
    val jobId: UUID,
    val action: AiOpsAction,
    val expectedJobRevision: Long,
    val state: String,
    val attemptCount: Int,
    val leaseOwner: String?,
    val leaseExpiresAt: Instant?,
    val availableAt: Instant?,
)
