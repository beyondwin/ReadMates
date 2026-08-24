package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.port.out.CreatePlatformAdminClubDomainOrigin
import com.readmates.club.application.port.out.StorePlatformAdminClubDomainEvidenceCommand
import com.readmates.club.application.port.out.StorePlatformAdminClubDomainResult
import com.readmates.club.application.port.out.StorePlatformAdminClubVisibilityCommand
import com.readmates.club.application.port.out.StorePlatformAdminClubVisibilityResult
import com.readmates.club.application.port.out.StorePlatformAdminDomainRecheckCommand
import com.readmates.club.application.port.out.StorePlatformAdminDomainRecheckResult
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

internal class JdbcPlatformAdminClubOriginStore(
    private val jdbcTemplate: JdbcTemplate,
    objectMapper: ObjectMapper,
) {
    private val evidence = JdbcPlatformAdminClubEvidenceStore(jdbcTemplate, objectMapper)

    fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        commandType: String,
        targetType: String,
        targetId: UUID,
    ): PlatformAdminClubCommandReceipt? =
        jdbcTemplate
            .query(
                """
                select r.id, r.command_type, r.club_id_snapshot, r.before_admin_revision, r.after_admin_revision,
                       r.outcome, cast(r.safe_result_json as char) safe_result_json,
                       c.state live_convergence_state
                from platform_admin_club_command_receipts r
                left join platform_admin_club_command_convergence c
                  on c.receipt_id_snapshot = r.id and c.effect_type = 'DOMAIN_PROVISIONING'
                where r.id = ? and r.actor_user_id_snapshot = ? and r.command_type = ?
                  and (
                    (? = 'club' and r.club_id_snapshot = ?)
                    or
                    (? = 'club-domain' and json_unquote(json_extract(r.safe_result_json, '$.targetId')) = ?)
                  )
                """.trimIndent(),
                { resultSet, _ -> resultSet.toClubCommandReceipt(evidence.objectMapper) },
                receiptId.dbString(),
                actorAdminId.dbString(),
                commandType,
                targetType,
                targetId.dbString(),
                targetType,
                targetId.dbString(),
            ).firstOrNull()

    fun storeVisibility(command: StorePlatformAdminClubVisibilityCommand): StorePlatformAdminClubVisibilityResult =
        if (!updateVisibility(command)) {
            StorePlatformAdminClubVisibilityResult.RevisionConflict
        } else {
            evidence.insertVisibility(command)
            if (evidence.consumePreview(command.preview.previewId, command.receiptId, command.occurredAt)) {
                StorePlatformAdminClubVisibilityResult.Stored(evidence.visibilityReceipt(command))
            } else {
                StorePlatformAdminClubVisibilityResult.PreviewConsumed
            }
        }

    fun storeDomainCreation(
        origin: CreatePlatformAdminClubDomainOrigin,
        command: StorePlatformAdminClubDomainEvidenceCommand,
    ): StorePlatformAdminClubDomainResult {
        val expectedRevision = command.preview.expectedAdminRevision
        val revisionUpdated =
            jdbcTemplate.update(
                """
                update clubs
                set admin_revision = admin_revision + 1, updated_at = utc_timestamp(6)
                where id = ? and admin_revision = ?
                """.trimIndent(),
                command.preview.clubId.dbString(),
                expectedRevision,
            ) == 1
        return if (!revisionUpdated) {
            StorePlatformAdminClubDomainResult.RevisionConflict
        } else if (!insertDomain(origin)) {
            StorePlatformAdminClubDomainResult.DuplicateHostname
        } else {
            val domainEvidence = DomainEvidence.from(origin, command)
            evidence.insertDomain(domainEvidence)
            if (evidence.consumePreview(command.preview.previewId, command.receiptId, command.occurredAt)) {
                StorePlatformAdminClubDomainResult.Stored(evidence.domainReceipt(domainEvidence))
            } else {
                StorePlatformAdminClubDomainResult.PreviewConsumed
            }
        }
    }

    fun storeDomainRecheck(command: StorePlatformAdminDomainRecheckCommand): StorePlatformAdminDomainRecheckResult {
        val origin = lockedDomainOrigin(command.domainId)
        return when {
            origin == null -> StorePlatformAdminDomainRecheckResult.DomainNotFound
            origin.status != command.expectedStatus -> StorePlatformAdminDomainRecheckResult.StateConflict
            else -> {
                val domainEvidence = DomainEvidence.from(command, origin.updatedAt)
                evidence.insertDomain(domainEvidence)
                StorePlatformAdminDomainRecheckResult.Stored(evidence.domainReceipt(domainEvidence))
            }
        }
    }

    private fun updateVisibility(command: StorePlatformAdminClubVisibilityCommand): Boolean =
        jdbcTemplate.update(
            """
            update clubs
            set public_visibility = ?, status = ?, admin_revision = admin_revision + 1, updated_at = ?
            where id = ?
              and admin_revision = ?
              and status = ?
              and public_visibility = ?
            """.trimIndent(),
            command.preview.targetVisibility.name,
            command.nextStatus.name,
            command.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            command.preview.clubId.dbString(),
            command.preview.expectedAdminRevision,
            command.previousStatus.name,
            command.preview.currentVisibility.name,
        ) == 1

    private fun insertDomain(origin: CreatePlatformAdminClubDomainOrigin): Boolean =
        try {
            jdbcTemplate.update(
                """
                insert into club_domains (
                  id, club_id, hostname, kind, status, is_primary, created_at, updated_at
                ) values (?, ?, ?, ?, 'ACTION_REQUIRED', false, ?, ?)
                """.trimIndent(),
                origin.domainId.dbString(),
                origin.clubId.dbString(),
                origin.hostname.value,
                origin.kind.name,
                origin.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                origin.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            )
            true
        } catch (_: DuplicateKeyException) {
            false
        }

    private fun lockedDomainOrigin(domainId: UUID): LockedDomainOrigin? =
        jdbcTemplate
            .query(
                "select status, updated_at from club_domains where id = ? for update",
                { resultSet, _ ->
                    LockedDomainOrigin(
                        ClubDomainStatus.valueOf(resultSet.getString("status")),
                        resultSet.getTimestamp("updated_at").toInstant(),
                    )
                },
                domainId.dbString(),
            ).firstOrNull()
}

private data class LockedDomainOrigin(
    val status: ClubDomainStatus,
    val updatedAt: Instant,
)

internal class JdbcPlatformAdminClubEvidenceStore(
    private val jdbcTemplate: JdbcTemplate,
    internal val objectMapper: ObjectMapper,
) {
    fun insertVisibility(command: StorePlatformAdminClubVisibilityCommand) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, 'ADMIN_CLUB_VISIBILITY_CHANGED', cast(? as json), ?)
            """.trimIndent(),
            command.auditEventId.dbString(),
            command.actorAdminId.dbString(),
            command.actorRoleSnapshot,
            objectMapper.writeValueAsString(
                mapOf(
                    "receiptId" to command.receiptId.toString(),
                    "clubId" to command.preview.clubId.toString(),
                    "beforeAdminRevision" to command.preview.expectedAdminRevision,
                    "afterAdminRevision" to command.preview.expectedAdminRevision + 1,
                    "beforeVisibility" to command.preview.currentVisibility.name,
                    "afterVisibility" to command.preview.targetVisibility.name,
                    "beforeStatus" to command.previousStatus.name,
                    "afterStatus" to command.nextStatus.name,
                ),
            ),
            command.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
        insertVisibilityReceipt(command)
    }

    fun insertDomain(domain: DomainEvidence) {
        insertDomainAudit(domain)
        insertDomainReceipt(domain)
        insertDomainConvergence(domain)
    }

    fun consumePreview(
        previewId: UUID,
        receiptId: UUID,
        occurredAt: Instant,
    ): Boolean =
        jdbcTemplate.update(
            """
            update platform_admin_club_command_previews
            set consumed_at = ?, consumed_receipt_id_snapshot = ?
            where id = ? and consumed_at is null and consumed_receipt_id_snapshot is null
            """.trimIndent(),
            occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            receiptId.dbString(),
            previewId.dbString(),
        ) == 1

    fun visibilityReceipt(command: StorePlatformAdminClubVisibilityCommand): PlatformAdminClubCommandReceipt =
        PlatformAdminClubCommandReceipt(
            receiptId = command.receiptId,
            commandType = command.preview.commandType,
            clubId = command.preview.clubId,
            beforeAdminRevision = command.preview.expectedAdminRevision,
            afterAdminRevision = command.preview.expectedAdminRevision + 1,
            outcome = "SUCCEEDED",
            resultCode = "VISIBILITY_CHANGED",
        )

    fun domainReceipt(domain: DomainEvidence): PlatformAdminClubCommandReceipt =
        PlatformAdminClubCommandReceipt(
            receiptId = domain.receiptId,
            commandType = domain.commandType,
            clubId = domain.clubId,
            beforeAdminRevision = domain.beforeRevision,
            afterAdminRevision = domain.afterRevision,
            outcome = "PARTIAL",
            resultCode = domain.resultCode,
            targetId = domain.domainId,
            convergenceId = domain.convergenceId,
            convergenceState = "PENDING",
        )

    private fun insertVisibilityReceipt(command: StorePlatformAdminClubVisibilityCommand) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_receipts (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, club_id_snapshot, preview_id_snapshot,
              before_admin_revision, after_admin_revision, outcome,
              canonical_schema_version, digest_key_version, request_hmac,
              platform_audit_event_id_snapshot, origin_at, safe_result_json
            ) values (?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, 'SUCCEEDED', ?, ?, ?, ?, ?, cast(? as json))
            """.trimIndent(),
            command.receiptId.dbString(),
            command.preview.commandType,
            command.actorAdminId.dbString(),
            command.actorRoleSnapshot,
            objectMapper.writeValueAsString(command.actorCapabilities),
            command.preview.clubId.dbString(),
            command.preview.previewId.dbString(),
            command.preview.expectedAdminRevision,
            command.preview.expectedAdminRevision + 1,
            command.digest.schemaVersion,
            command.digest.digestKeyVersion,
            command.digest.requestHmac,
            command.auditEventId.dbString(),
            command.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            objectMapper.writeValueAsString(
                mapOf(
                    "resultCode" to "VISIBILITY_CHANGED",
                    "beforeVisibility" to command.preview.currentVisibility.name,
                    "afterVisibility" to command.preview.targetVisibility.name,
                    "beforeStatus" to command.previousStatus.name,
                    "afterStatus" to command.nextStatus.name,
                ),
            ),
        )
    }

    private fun insertDomainAudit(domain: DomainEvidence) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, ?, cast(? as json), ?)
            """.trimIndent(),
            domain.auditEventId.dbString(),
            domain.actorAdminId.dbString(),
            domain.actorRoleSnapshot,
            domain.auditEventType,
            objectMapper.writeValueAsString(domain.auditMetadata()),
            domain.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    private fun insertDomainReceipt(domain: DomainEvidence) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_receipts (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, club_id_snapshot, preview_id_snapshot,
              before_admin_revision, after_admin_revision, outcome,
              canonical_schema_version, digest_key_version, request_hmac,
              platform_audit_event_id_snapshot, origin_at, safe_result_json
            ) values (?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, 'PARTIAL', ?, ?, ?, ?, ?, cast(? as json))
            """.trimIndent(),
            domain.receiptId.dbString(),
            domain.commandType,
            domain.actorAdminId.dbString(),
            domain.actorRoleSnapshot,
            objectMapper.writeValueAsString(domain.actorCapabilities),
            domain.clubId.dbString(),
            domain.previewId?.dbString(),
            domain.beforeRevision,
            domain.afterRevision,
            domain.digest.schemaVersion,
            domain.digest.digestKeyVersion,
            domain.digest.requestHmac,
            domain.auditEventId.dbString(),
            domain.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            objectMapper.writeValueAsString(domain.safeResult()),
        )
    }

    private fun insertDomainConvergence(domain: DomainEvidence) {
        val timestamp = domain.occurredAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime()
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_convergence (
              id, receipt_id_snapshot, effect_type, effect_target_id_snapshot, state, attempt_count, next_attempt_no,
              lease_owner, lease_expires_at, last_safe_error_code, available_at, created_at, updated_at
            ) values (?, ?, 'DOMAIN_PROVISIONING', ?, 'PENDING', 0, 1, null, null, null, ?, ?, ?)
            """.trimIndent(),
            domain.convergenceId.dbString(),
            domain.receiptId.dbString(),
            domain.domainId.dbString(),
            timestamp,
            timestamp,
            timestamp,
        )
    }
}

internal data class DomainEvidence(
    val commandType: String,
    val auditEventType: String,
    val resultCode: String,
    val clubId: UUID,
    val domainId: UUID,
    val previewId: UUID?,
    val beforeRevision: Long,
    val afterRevision: Long,
    val receiptId: UUID,
    val convergenceId: UUID,
    val auditEventId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val digest: AdminCommandDigest,
    val expectedDomainStatus: ClubDomainStatus,
    val originTargetUpdatedAt: Instant,
    val occurredAt: Instant,
) {
    fun auditMetadata(): Map<String, Any> =
        mapOf(
            "receiptId" to receiptId.toString(),
            "clubId" to clubId.toString(),
            "domainId" to domainId.toString(),
            "beforeAdminRevision" to beforeRevision,
            "afterAdminRevision" to afterRevision,
        )

    fun safeResult(): Map<String, Any> =
        mapOf(
            "resultCode" to resultCode,
            "targetId" to domainId.toString(),
            "convergenceId" to convergenceId.toString(),
            "convergenceState" to "PENDING",
            "expectedDomainStatus" to expectedDomainStatus.name,
            "originTargetUpdatedAt" to originTargetUpdatedAt.toString(),
        )

    companion object {
        fun from(
            origin: CreatePlatformAdminClubDomainOrigin,
            command: StorePlatformAdminClubDomainEvidenceCommand,
        ): DomainEvidence =
            DomainEvidence(
                commandType = "club.domain.create",
                auditEventType = "ADMIN_CLUB_DOMAIN_CREATED",
                resultCode = "DOMAIN_CREATED",
                clubId = origin.clubId,
                domainId = origin.domainId,
                previewId = command.preview.previewId,
                beforeRevision = command.preview.expectedAdminRevision,
                afterRevision = command.preview.expectedAdminRevision + 1,
                receiptId = command.receiptId,
                convergenceId = command.convergenceId,
                auditEventId = command.auditEventId,
                actorAdminId = command.actorAdminId,
                actorRoleSnapshot = command.actorRoleSnapshot,
                actorCapabilities = command.actorCapabilities,
                digest = command.digest,
                expectedDomainStatus = ClubDomainStatus.ACTION_REQUIRED,
                originTargetUpdatedAt = origin.occurredAt.truncatedTo(ChronoUnit.MICROS),
                occurredAt = command.occurredAt,
            )

        fun from(
            command: StorePlatformAdminDomainRecheckCommand,
            originTargetUpdatedAt: Instant,
        ): DomainEvidence =
            DomainEvidence(
                commandType = "club.domain.recheck",
                auditEventType = "ADMIN_CLUB_DOMAIN_RECHECK_REQUESTED",
                resultCode = "DOMAIN_RECHECK_REQUESTED",
                clubId = command.clubId,
                domainId = command.domainId,
                previewId = null,
                beforeRevision = command.clubAdminRevision,
                afterRevision = command.clubAdminRevision,
                receiptId = command.receiptId,
                convergenceId = command.convergenceId,
                auditEventId = command.auditEventId,
                actorAdminId = command.actorAdminId,
                actorRoleSnapshot = command.actorRoleSnapshot,
                actorCapabilities = command.actorCapabilities,
                digest = command.digest,
                expectedDomainStatus = command.expectedStatus,
                originTargetUpdatedAt = originTargetUpdatedAt,
                occurredAt = command.occurredAt,
            )
    }
}

private fun ResultSet.toClubCommandReceipt(objectMapper: ObjectMapper): PlatformAdminClubCommandReceipt {
    val safeResult: Map<String, Any> =
        objectMapper.readValue(
            getString("safe_result_json"),
            object : TypeReference<Map<String, Any>>() {},
        )
    val before = getLong("before_admin_revision").takeUnless { wasNull() }
    return PlatformAdminClubCommandReceipt(
        receiptId = uuid("id"),
        commandType = getString("command_type"),
        clubId = uuid("club_id_snapshot"),
        beforeAdminRevision = before,
        afterAdminRevision = getLong("after_admin_revision"),
        outcome = getString("outcome"),
        resultCode = safeResult.getValue("resultCode") as String,
        targetId = (safeResult["targetId"] as String?)?.let(UUID::fromString),
        convergenceId = (safeResult["convergenceId"] as String?)?.let(UUID::fromString),
        convergenceState = getString("live_convergence_state") ?: safeResult["convergenceState"] as String?,
    )
}
