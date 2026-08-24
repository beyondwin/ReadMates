package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.LoadPlatformAdminClubCommandPreviewResult
import com.readmates.club.application.port.out.StoredPlatformAdminClubCommandPreview
import com.readmates.club.application.port.out.StoredPlatformAdminDomainCommandPreview
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.ZoneOffset
import java.util.UUID

internal class JdbcPlatformAdminClubPreviewStore(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun saveVisibility(preview: StoredPlatformAdminClubCommandPreview) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_previews (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, target_kind, club_id_snapshot, new_club_slot_id_snapshot,
              canonical_schema_version, digest_key_version, request_hmac, sanitized_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, ?, ?, ?, cast(? as json), 'EXISTING_CLUB', ?, null, ?, ?, ?, cast(? as json), ?, null, null, ?)
            """.trimIndent(),
            preview.previewId.dbString(),
            preview.commandType,
            preview.actorAdminId.dbString(),
            preview.actorRoleSnapshot,
            objectMapper.writeValueAsString(preview.actorCapabilities),
            preview.clubId.dbString(),
            preview.canonicalSchemaVersion,
            preview.digestKeyVersion,
            preview.requestHmac,
            objectMapper.writeValueAsString(
                mapOf(
                    "expectedAdminRevision" to preview.expectedAdminRevision,
                    "currentVisibility" to preview.currentVisibility.name,
                    "targetVisibility" to preview.targetVisibility.name,
                    "impactCodes" to preview.impactCodes,
                ),
            ),
            preview.expiresAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            preview.createdAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    fun loadVisibility(previewId: UUID): LoadPlatformAdminClubCommandPreviewResult {
        val row =
            jdbcTemplate
                .query(
                    """
                    select id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
                           cast(actor_capabilities_json as char) actor_capabilities_json,
                           club_id_snapshot, canonical_schema_version, digest_key_version, request_hmac,
                           cast(sanitized_impact_json as char) sanitized_impact_json,
                           expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
                    from platform_admin_club_command_previews
                    where id = ?
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.toVisibilityPreviewRow(objectMapper) },
                    previewId.dbString(),
                ).firstOrNull()
        return when {
            row == null -> LoadPlatformAdminClubCommandPreviewResult.Missing
            row is VisibilityPreviewRow.CommandMismatch -> LoadPlatformAdminClubCommandPreviewResult.CommandMismatch
            else -> LoadPlatformAdminClubCommandPreviewResult.Loaded((row as VisibilityPreviewRow.Loaded).preview)
        }
    }

    fun saveDomain(preview: StoredPlatformAdminDomainCommandPreview) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_previews (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, target_kind, club_id_snapshot, new_club_slot_id_snapshot,
              canonical_schema_version, digest_key_version, request_hmac, sanitized_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, 'club.domain.create', ?, ?, cast(? as json), 'EXISTING_CLUB', ?, null, ?, ?, ?, cast(? as json), ?, null, null, ?)
            """.trimIndent(),
            preview.previewId.dbString(),
            preview.actorAdminId.dbString(),
            preview.actorRoleSnapshot,
            objectMapper.writeValueAsString(preview.actorCapabilities),
            preview.clubId.dbString(),
            preview.canonicalSchemaVersion,
            preview.digestKeyVersion,
            preview.requestHmac,
            objectMapper.writeValueAsString(
                mapOf(
                    "expectedAdminRevision" to preview.expectedAdminRevision,
                    "kind" to preview.kind.name,
                    "isPrimary" to preview.isPrimary,
                    "impactCodes" to preview.impactCodes,
                ),
            ),
            preview.expiresAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            preview.createdAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    fun loadDomain(previewId: UUID): StoredPlatformAdminDomainCommandPreview? =
        jdbcTemplate
            .query(
                """
                select id, actor_user_id_snapshot, actor_platform_role_snapshot,
                       cast(actor_capabilities_json as char) actor_capabilities_json,
                       club_id_snapshot, canonical_schema_version, digest_key_version, request_hmac,
                       cast(sanitized_impact_json as char) sanitized_impact_json,
                       expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
                from platform_admin_club_command_previews
                where id = ? and command_type = 'club.domain.create'
                """.trimIndent(),
                { resultSet, _ -> resultSet.toDomainPreview(objectMapper) },
                previewId.dbString(),
            ).firstOrNull()
}

private fun ResultSet.toVisibilityPreviewRow(objectMapper: ObjectMapper): VisibilityPreviewRow {
    val commandType = getString("command_type")
    if (commandType != "club.visibility.change") {
        return VisibilityPreviewRow.CommandMismatch
    }
    val impact = objectMapper.readValue(getString("sanitized_impact_json"), VisibilityImpactJson::class.java)
    return VisibilityPreviewRow.Loaded(
        StoredPlatformAdminClubCommandPreview(
            previewId = uuid("id"),
            commandType = commandType,
            actorAdminId = uuid("actor_user_id_snapshot"),
            actorRoleSnapshot = getString("actor_platform_role_snapshot"),
            actorCapabilities = objectMapper.stringList(getString("actor_capabilities_json")),
            clubId = uuid("club_id_snapshot"),
            canonicalSchemaVersion = getString("canonical_schema_version"),
            digestKeyVersion = getInt("digest_key_version"),
            requestHmac = getBytes("request_hmac"),
            expectedAdminRevision = impact.expectedAdminRevision,
            currentVisibility = impact.currentVisibility,
            targetVisibility = impact.targetVisibility,
            impactCodes = impact.impactCodes,
            expiresAt = getTimestamp("expires_at").toInstant(),
            consumedAt = getTimestamp("consumed_at")?.toInstant(),
            consumedReceiptId = getString("consumed_receipt_id_snapshot")?.let(UUID::fromString),
            createdAt = getTimestamp("created_at").toInstant(),
        ),
    )
}

private fun ResultSet.toDomainPreview(objectMapper: ObjectMapper): StoredPlatformAdminDomainCommandPreview {
    val impact = objectMapper.readValue(getString("sanitized_impact_json"), DomainImpactJson::class.java)
    return StoredPlatformAdminDomainCommandPreview(
        previewId = uuid("id"),
        actorAdminId = uuid("actor_user_id_snapshot"),
        actorRoleSnapshot = getString("actor_platform_role_snapshot"),
        actorCapabilities = objectMapper.stringList(getString("actor_capabilities_json")),
        clubId = uuid("club_id_snapshot"),
        canonicalSchemaVersion = getString("canonical_schema_version"),
        digestKeyVersion = getInt("digest_key_version"),
        requestHmac = getBytes("request_hmac"),
        expectedAdminRevision = impact.expectedAdminRevision,
        kind = impact.kind,
        isPrimary = impact.isPrimary,
        impactCodes = impact.impactCodes,
        expiresAt = getTimestamp("expires_at").toInstant(),
        consumedAt = getTimestamp("consumed_at")?.toInstant(),
        consumedReceiptId = getString("consumed_receipt_id_snapshot")?.let(UUID::fromString),
        createdAt = getTimestamp("created_at").toInstant(),
    )
}

private fun ObjectMapper.stringList(value: String): List<String> = readValue(value, Array<String>::class.java).toList()

private sealed interface VisibilityPreviewRow {
    data class Loaded(
        val preview: StoredPlatformAdminClubCommandPreview,
    ) : VisibilityPreviewRow

    data object CommandMismatch : VisibilityPreviewRow
}

private data class VisibilityImpactJson(
    val expectedAdminRevision: Long,
    val currentVisibility: ClubPublicVisibility,
    val targetVisibility: ClubPublicVisibility,
    val impactCodes: List<String>,
)

private data class DomainImpactJson(
    val expectedAdminRevision: Long,
    val kind: ClubDomainKind,
    val isPrimary: Boolean,
    val impactCodes: List<String>,
)
