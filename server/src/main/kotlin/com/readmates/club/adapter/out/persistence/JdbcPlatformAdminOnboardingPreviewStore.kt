package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.FirstHostPreviewKind
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.port.out.LoadPlatformAdminOnboardingPreviewResult
import com.readmates.club.application.port.out.LockedPlatformAdminOnboardingSource
import com.readmates.club.application.port.out.PlatformAdminExistingUser
import com.readmates.club.application.port.out.StoredPlatformAdminOnboardingPreview
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

internal class JdbcPlatformAdminOnboardingPreviewStore(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun save(preview: StoredPlatformAdminOnboardingPreview) {
        jdbcTemplate.update(
            """
            insert into platform_admin_club_command_previews (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, target_kind, club_id_snapshot, new_club_slot_id_snapshot,
              canonical_schema_version, digest_key_version, request_hmac, sanitized_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, 'club.onboarding.create', ?, ?, cast(? as json), 'NEW_CLUB', null, ?,
                      ?, ?, ?, cast(? as json), ?, null, null, ?)
            """.trimIndent(),
            preview.previewId.dbString(),
            preview.actorAdminId.dbString(),
            preview.actorRoleSnapshot,
            objectMapper.writeValueAsString(preview.actorCapabilities),
            preview.newClubSlotId.dbString(),
            preview.canonicalSchemaVersion,
            preview.digestKeyVersion,
            preview.requestHmac,
            objectMapper.writeValueAsString(preview.safeImpact()),
            preview.expiresAt.dbTime(),
            preview.createdAt.dbTime(),
        )
    }

    fun load(previewId: UUID): LoadPlatformAdminOnboardingPreviewResult {
        val row =
            jdbcTemplate
                .query(
                    """
                    select id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
                           cast(actor_capabilities_json as char) actor_capabilities_json,
                           target_kind, club_id_snapshot, new_club_slot_id_snapshot,
                           canonical_schema_version, digest_key_version, request_hmac,
                           cast(sanitized_impact_json as char) sanitized_impact_json,
                           expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
                    from platform_admin_club_command_previews
                    where id = ?
                    for update
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.toPreview(objectMapper) },
                    previewId.dbString(),
                ).firstOrNull()
        return when {
            row == null -> LoadPlatformAdminOnboardingPreviewResult.Missing
            row.commandType == "club.onboarding.create" && row.targetKind == "NEW_CLUB" ->
                LoadPlatformAdminOnboardingPreviewResult.Loaded(row.preview)
            else -> LoadPlatformAdminOnboardingPreviewResult.CommandMismatch
        }
    }

    fun lockSource(command: PlatformAdminOnboardingCommand): LockedPlatformAdminOnboardingSource {
        val slugExists = lockExists("select id from clubs where slug = ? for update", command.club.slug)
        val domainExists =
            command.domain?.let {
                lockExists("select id from club_domains where lower(hostname) = ? for update", it.hostname)
            } ?: false
        val existingUser =
            jdbcTemplate
                .query(
                    "select id, email, name from users where lower(email) = ? limit 1 for update",
                    { resultSet, _ -> resultSet.toExistingUser() },
                    command.firstHost.email,
                ).firstOrNull()
        return LockedPlatformAdminOnboardingSource(slugExists, domainExists, existingUser)
    }

    private fun lockExists(
        sql: String,
        value: String,
    ): Boolean = jdbcTemplate.query(sql, { _, _ -> true }, value).isNotEmpty()
}

private data class PreviewRow(
    val commandType: String,
    val targetKind: String,
    val preview: StoredPlatformAdminOnboardingPreview,
)

private fun StoredPlatformAdminOnboardingPreview.safeImpact(): Map<String, Any> =
    buildMap {
        put("clubSlug", clubSlug)
        put("firstHostKind", firstHostKind.name)
        put("impactCodes", impactCodes)
        put("prerequisiteCodes", prerequisiteCodes)
        requiredConfirmation?.let { put("requiredConfirmation", it) }
    }

private fun ResultSet.toPreview(objectMapper: ObjectMapper): PreviewRow {
    val impact: Map<String, Any> = objectMapper.readValue(getString("sanitized_impact_json"), mapType())
    val capabilities: List<String> = objectMapper.readValue(getString("actor_capabilities_json"), listType())
    return PreviewRow(
        commandType = getString("command_type"),
        targetKind = getString("target_kind"),
        preview =
            StoredPlatformAdminOnboardingPreview(
                previewId = uuid("id"),
                actorAdminId = uuid("actor_user_id_snapshot"),
                actorRoleSnapshot = getString("actor_platform_role_snapshot"),
                actorCapabilities = capabilities,
                newClubSlotId = uuid("new_club_slot_id_snapshot"),
                canonicalSchemaVersion = getString("canonical_schema_version"),
                digestKeyVersion = getInt("digest_key_version"),
                requestHmac = getBytes("request_hmac"),
                clubSlug = impact.getValue("clubSlug") as String,
                firstHostKind = FirstHostPreviewKind.valueOf(impact.getValue("firstHostKind") as String),
                requiredConfirmation = impact["requiredConfirmation"] as String?,
                impactCodes = (impact.getValue("impactCodes") as List<*>).map(Any?::toString),
                prerequisiteCodes = (impact.getValue("prerequisiteCodes") as List<*>).map(Any?::toString),
                expiresAt = getTimestamp("expires_at").toInstant(),
                consumedAt = getTimestamp("consumed_at")?.toInstant(),
                consumedReceiptId = getString("consumed_receipt_id_snapshot")?.let(UUID::fromString),
                createdAt = getTimestamp("created_at").toInstant(),
            ),
    )
}

private fun ResultSet.toExistingUser() = PlatformAdminExistingUser(uuid("id"), getString("email"), getString("name"))

private fun mapType() = object : TypeReference<Map<String, Any>>() {}

private fun listType() = object : TypeReference<List<String>>() {}

private fun Instant.dbTime() = atOffset(ZoneOffset.UTC).toUtcLocalDateTime()
