package com.readmates.admin.takedown.adapter.out.persistence

import com.readmates.admin.takedown.application.model.PUBLIC_TAKEDOWN_OPERATION
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import com.readmates.admin.takedown.application.port.out.StorePublicTakedownCommand
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import tools.jackson.databind.ObjectMapper
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcPublicTakedownWriter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun claimIdempotency(command: StorePublicTakedownCommand): Boolean =
        jdbcTemplate
            .update(
                """
                insert ignore into admin_public_takedown_idempotency (
                  actor_user_id, operation, club_id, publication_id, idempotency_key,
                  request_hmac, canonical_schema_version, digest_key_version,
                  created_at, expires_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
                command.scope.actorAdminId.dbString(),
                PUBLIC_TAKEDOWN_OPERATION,
                command.scope.clubId.dbString(),
                command.scope.publicationId.dbString(),
                command.scope.idempotencyKey,
                command.identity.requestHmac,
                command.identity.canonicalSchemaVersion,
                command.identity.digestKeyVersion,
                command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                command.idempotencyExpiresAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            ).also { inserted ->
                if (inserted == 1) markDigestKeyReferenced(command)
            } == 1

    fun denyOrigin(target: PublicTakedownTarget): Long {
        val committedGeneration = target.generation + 1
        val denied =
            jdbcTemplate.update(
                """
                update public_projection_generations
                set generation = ?, origin_readable = false, updated_at = utc_timestamp(6)
                where publication_id = ? and club_id = ? and session_id = ?
                  and generation = ? and origin_readable = true
                """.trimIndent(),
                committedGeneration,
                target.publicationId.dbString(),
                target.clubId.dbString(),
                target.sessionId.dbString(),
                target.generation,
            )
        if (denied != 1) fail(PublicTakedownError.GENERATION_MISMATCH)
        return committedGeneration
    }

    fun insertReceipt(
        command: StorePublicTakedownCommand,
        target: PublicTakedownTarget,
        receiptId: UUID,
        convergenceId: UUID,
        committedGeneration: Long,
    ) {
        val surfacesJson = objectMapper.writeValueAsString(target.currentSurfaces.sorted())
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_receipts (
              id, convergence_id, actor_user_id_snapshot, actor_platform_role_snapshot,
              reason_category, reason_redacted, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, committed_generation, origin_result,
              current_surfaces_json, remote_copy_limitation_code, created_at
            ) values (?, ?, ?, ?, ?, true, ?, ?, ?, ?, 'DENIED', cast(? as json),
                      'REMOTE_STORED_OR_OFFLINE_COPY_NOT_ERASABLE', ?)
            """.trimIndent(),
            receiptId.dbString(),
            convergenceId.dbString(),
            command.preview.actorAdminId.dbString(),
            command.preview.actorRoleSnapshot,
            command.reasonCategory.name,
            target.clubId.dbString(),
            target.sessionId.dbString(),
            target.publicationId.dbString(),
            committedGeneration,
            surfacesJson,
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    fun insertConvergence(
        command: StorePublicTakedownCommand,
        target: PublicTakedownTarget,
        receiptId: UUID,
        convergenceId: UUID,
        committedGeneration: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_receipts (
              mutation_receipt_id, convergence_id, publication_id_snapshot,
              session_id_snapshot, committed_generation, origin_readable, created_at
            ) values (?, ?, ?, ?, ?, false, ?)
            """.trimIndent(),
            receiptId.dbString(),
            convergenceId.dbString(),
            target.publicationId.dbString(),
            target.sessionId.dbString(),
            committedGeneration,
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into public_convergence_work (
              convergence_id, next_attempt_no, available_at, created_at, updated_at
            ) values (?, 1, ?, ?, ?)
            """.trimIndent(),
            convergenceId.dbString(),
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    fun insertAudit(
        command: StorePublicTakedownCommand,
        receiptId: UUID,
        convergenceId: UUID,
        generation: Long,
    ) {
        val metadata =
            objectMapper.writeValueAsString(
                mapOf(
                    "receiptId" to receiptId.toString(),
                    "convergenceId" to convergenceId.toString(),
                    "clubId" to command.preview.clubId.toString(),
                    "sessionId" to command.preview.sessionId.toString(),
                    "publicationId" to command.preview.publicationId.toString(),
                    "committedGeneration" to generation,
                    "originResult" to "DENIED",
                    "reasonCategory" to command.reasonCategory.name,
                    "reasonRedacted" to true,
                    "remoteCopyLimitationCode" to "REMOTE_STORED_OR_OFFLINE_COPY_NOT_ERASABLE",
                ),
            )
        jdbcTemplate.update(
            """
            insert into platform_audit_events (
              id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at
            ) values (?, ?, ?, null, 'EMERGENCY_PUBLIC_TAKEDOWN_CONFIRMED', cast(? as json), ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            command.preview.actorAdminId.dbString(),
            command.preview.actorRoleSnapshot,
            metadata,
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    fun completeIdempotency(
        command: StorePublicTakedownCommand,
        receiptId: UUID,
    ) {
        jdbcTemplate
            .update(
                """
                update admin_public_takedown_idempotency
                set receipt_id = ?, completed_at = ?
                where actor_user_id = ? and operation = ? and club_id = ?
                  and publication_id = ? and idempotency_key = ? and receipt_id is null
                """.trimIndent(),
                receiptId.dbString(),
                command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
                command.scope.actorAdminId.dbString(),
                PUBLIC_TAKEDOWN_OPERATION,
                command.scope.clubId.dbString(),
                command.scope.publicationId.dbString(),
                command.scope.idempotencyKey,
            ).also { completed ->
                check(completed == 1) { "Public takedown idempotency completion changed unexpectedly" }
            }
    }

    private fun markDigestKeyReferenced(command: StorePublicTakedownCommand) {
        jdbcTemplate.update(
            """
            insert into mutation_digest_key_state (
              digest_key_version, last_referenced_at, unreferenced_since
            ) values (?, ?, null)
            on duplicate key update
              last_referenced_at = values(last_referenced_at),
              unreferenced_since = null
            """.trimIndent(),
            command.identity.digestKeyVersion,
            command.now.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    private fun fail(error: PublicTakedownError): Nothing = throw PublicTakedownException(error)
}
