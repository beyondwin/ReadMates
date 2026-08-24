package com.readmates.admin.takedown.adapter.out.persistence

import com.readmates.admin.takedown.application.model.PUBLIC_TAKEDOWN_OPERATION
import com.readmates.admin.takedown.application.model.PUBLIC_TAKEDOWN_REMOTE_COPY_LIMITATION
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownIdempotencyScope
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReasonCategory
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownRequestIdentity
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.admin.takedown.application.port.out.StorePublicTakedownCommand
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcPublicTakedownAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    private val writer: JdbcPublicTakedownWriter,
) : PublicTakedownPort {
    override fun loadTarget(
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ): PublicTakedownTarget? = queryTarget(clubId, sessionId, publicationId, lock = false)

    override fun savePreview(preview: PublicTakedownPreview) {
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_previews (
              id, actor_user_id_snapshot, actor_platform_role_snapshot,
              club_id_snapshot, session_id_snapshot, publication_id_snapshot,
              target_generation, current_surfaces_json, expires_at, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, utc_timestamp(6))
            """.trimIndent(),
            preview.previewId.dbString(),
            preview.actorAdminId.dbString(),
            preview.actorRoleSnapshot,
            preview.clubId.dbString(),
            preview.sessionId.dbString(),
            preview.publicationId.dbString(),
            preview.targetGeneration,
            objectMapper.writeValueAsString(preview.currentSurfaces.sorted()),
            preview.expiresAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    override fun loadPreview(previewId: UUID): PublicTakedownPreview? =
        jdbcTemplate
            .query(
                """
                select id, actor_user_id_snapshot, actor_platform_role_snapshot,
                       club_id_snapshot, session_id_snapshot, publication_id_snapshot,
                       target_generation, cast(current_surfaces_json as char) current_surfaces_json,
                       expires_at
                from admin_public_takedown_previews
                where id = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toPreview() },
                previewId.dbString(),
            ).firstOrNull()

    override fun loadReplay(
        scope: PublicTakedownIdempotencyScope,
        identity: PublicTakedownRequestIdentity,
    ): PublicTakedownPort.ReplayResult {
        val row = loadIdempotency(scope, lock = false)
        val expectedHmac = row?.let { identity.replayHmacs[it.keyVersion] }
        return when {
            row == null -> PublicTakedownPort.ReplayResult.Missing
            expectedHmac == null -> PublicTakedownPort.ReplayResult.Conflict
            !RequestIdentityHmac.equal(row.requestHmac, expectedHmac) ->
                PublicTakedownPort.ReplayResult.Conflict
            row.schemaVersion != identity.canonicalSchemaVersion -> PublicTakedownPort.ReplayResult.Conflict
            row.receiptId == null -> PublicTakedownPort.ReplayResult.Conflict
            else -> PublicTakedownPort.ReplayResult.Replayed(loadReceipt(row.receiptId))
        }
    }

    override fun confirmNew(command: StorePublicTakedownCommand): PublicTakedownReceipt {
        if (!writer.claimIdempotency(command)) return replayExisting(command)
        val target = lockAndValidateTarget(command)
        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        val committedGeneration = writer.denyOrigin(target, convergenceId)
        writer.insertReceipt(command, target, receiptId, convergenceId, committedGeneration)
        writer.insertConvergence(command, target, receiptId, convergenceId, committedGeneration)
        writer.insertAudit(command, receiptId, convergenceId, committedGeneration)
        writer.completeIdempotency(command, receiptId)
        return loadReceipt(receiptId)
    }

    private fun replayExisting(command: StorePublicTakedownCommand): PublicTakedownReceipt {
        val row = loadIdempotency(command.scope, lock = true)
        val expectedHmac = row?.let { command.identity.replayHmacs[it.keyVersion] }
        val receiptId = row?.receiptId
        val digestMatches =
            row != null && expectedHmac != null && RequestIdentityHmac.equal(row.requestHmac, expectedHmac)
        val completedRequestMatches =
            row != null &&
                row.schemaVersion == command.identity.canonicalSchemaVersion &&
                receiptId != null
        if (
            !digestMatches || !completedRequestMatches
        ) {
            fail(PublicTakedownError.IDEMPOTENCY_KEY_REUSED)
        }
        return loadReceipt(receiptId, lock = true)
    }

    private fun lockAndValidateTarget(command: StorePublicTakedownCommand): PublicTakedownTarget {
        val target =
            queryTarget(
                command.preview.clubId,
                command.preview.sessionId,
                command.preview.publicationId,
                lock = true,
            ) ?: fail(PublicTakedownError.TARGET_MISMATCH)
        if (target.generation != command.preview.targetGeneration) {
            fail(PublicTakedownError.GENERATION_MISMATCH)
        }
        if (target.currentSurfaces != command.preview.currentSurfaces) {
            fail(PublicTakedownError.SURFACES_MISMATCH)
        }
        if (!target.originReadable) fail(PublicTakedownError.TARGET_NOT_PUBLIC)
        return target
    }

    private fun queryTarget(
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
        lock: Boolean,
    ): PublicTakedownTarget? {
        if (lock) {
            jdbcTemplate.queryForObject(
                "select id from active_sessions where club_id = ? and id = ? for update",
                String::class.java,
                clubId.dbString(),
                sessionId.dbString(),
            ) ?: return null
        }
        return jdbcTemplate
            .query(
                """
                select projection.club_id, projection.session_id,
                       projection.publication_id_snapshot as publication_id,
                       projection.generation, projection.origin_readable
                from public_projection_current projection
                join active_sessions session
                  on session.id = projection.session_id and session.club_id = projection.club_id
                join public_session_publications publication
                  on publication.id = projection.publication_id_snapshot
                 and publication.session_id = projection.session_id
                 and publication.club_id = projection.club_id
                where projection.club_id = ? and projection.session_id = ?
                  and projection.publication_id_snapshot = ?
                """.trimIndent(),
                { resultSet, _ ->
                    val readable = resultSet.getBoolean("origin_readable")
                    PublicTakedownTarget(
                        clubId = resultSet.uuid("club_id"),
                        sessionId = resultSet.uuid("session_id"),
                        publicationId = resultSet.uuid("publication_id"),
                        generation = resultSet.getLong("generation"),
                        originReadable = readable,
                        currentSurfaces = if (readable) ACTIVE_PUBLIC_SURFACES else emptySet(),
                    )
                },
                clubId.dbString(),
                sessionId.dbString(),
                publicationId.dbString(),
            ).firstOrNull()
    }

    private fun loadIdempotency(
        scope: PublicTakedownIdempotencyScope,
        lock: Boolean,
    ): IdempotencyRow? {
        val suffix = if (lock) " for update" else ""
        return jdbcTemplate
            .query(
                """
                select request_hmac, canonical_schema_version, digest_key_version, receipt_id
                from admin_public_takedown_idempotency
                where actor_user_id = ? and operation = ? and club_id = ?
                  and publication_id = ? and idempotency_key = ?$suffix
                """.trimIndent(),
                { resultSet, _ ->
                    IdempotencyRow(
                        requestHmac = resultSet.getBytes("request_hmac"),
                        schemaVersion = resultSet.getInt("canonical_schema_version"),
                        keyVersion = resultSet.getInt("digest_key_version"),
                        receiptId = resultSet.getString("receipt_id")?.let(UUID::fromString),
                    )
                },
                scope.actorAdminId.dbString(),
                PUBLIC_TAKEDOWN_OPERATION,
                scope.clubId.dbString(),
                scope.publicationId.dbString(),
                scope.idempotencyKey,
            ).firstOrNull()
    }

    private fun loadReceipt(
        receiptId: UUID,
        lock: Boolean = false,
    ): PublicTakedownReceipt {
        val suffix = if (lock) " for update" else ""
        return jdbcTemplate
            .query(
                """
                select id, convergence_id, club_id_snapshot, session_id_snapshot, publication_id_snapshot,
                       committed_generation, origin_result, reason_category, reason_redacted, created_at
                from admin_public_takedown_receipts where id = ?$suffix
                """.trimIndent(),
                { resultSet, _ ->
                    PublicTakedownReceipt(
                        receiptId = resultSet.uuid("id"),
                        convergenceId = resultSet.uuid("convergence_id"),
                        clubId = resultSet.uuid("club_id_snapshot"),
                        sessionId = resultSet.uuid("session_id_snapshot"),
                        publicationId = resultSet.uuid("publication_id_snapshot"),
                        committedGeneration = resultSet.getLong("committed_generation"),
                        originResult = resultSet.getString("origin_result"),
                        reasonCategory = PublicTakedownReasonCategory.valueOf(resultSet.getString("reason_category")),
                        reasonRedacted = resultSet.getBoolean("reason_redacted"),
                        createdAt = resultSet.utcOffsetDateTime("created_at").toInstant(),
                    )
                },
                receiptId.dbString(),
            ).single()
    }

    private fun ResultSet.toPreview(): PublicTakedownPreview =
        PublicTakedownPreview(
            previewId = uuid("id"),
            actorAdminId = uuid("actor_user_id_snapshot"),
            actorRoleSnapshot = getString("actor_platform_role_snapshot"),
            expiresAt = utcOffsetDateTime("expires_at").toInstant(),
            clubId = uuid("club_id_snapshot"),
            sessionId = uuid("session_id_snapshot"),
            publicationId = uuid("publication_id_snapshot"),
            targetGeneration = getLong("target_generation"),
            currentSurfaces =
                objectMapper
                    .readValue(
                        getString("current_surfaces_json"),
                        object : TypeReference<List<String>>() {},
                    ).toSet(),
            confirmEnabled = false,
        )

    private data class IdempotencyRow(
        val requestHmac: ByteArray,
        val schemaVersion: Int,
        val keyVersion: Int,
        val receiptId: UUID?,
    )

    private companion object {
        val ACTIVE_PUBLIC_SURFACES = setOf("ORIGIN", "BFF_CACHE", "CDN_CACHE", "BROWSER_CACHE")
    }
}

private fun fail(error: PublicTakedownError): Nothing = throw PublicTakedownException(error)
