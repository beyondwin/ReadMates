package com.readmates.admin.takedown.adapter.out.persistence

import com.readmates.admin.takedown.application.model.PreparedPublicTakedownConfirm
import com.readmates.admin.takedown.application.model.PublicTakedownActor
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import com.readmates.admin.takedown.application.model.StoredPublicTakedownPreview
import com.readmates.admin.takedown.application.port.out.PublicTakedownPort
import com.readmates.shared.db.dbString
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Repository
class JdbcPublicTakedownAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : PublicTakedownPort {
    override fun loadTarget(
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ): PublicTakedownTarget? =
        jdbcTemplate
            .query(
                """
                select current_projection.club_id, current_projection.session_id,
                       current_projection.publication_id_snapshot, current_projection.generation,
                       current_projection.origin_readable
                from public_projection_current current_projection
                join sessions on sessions.id = current_projection.session_id
                  and sessions.club_id = current_projection.club_id
                join public_session_publications publications
                  on publications.id = current_projection.publication_id_snapshot
                  and publications.session_id = current_projection.session_id
                  and publications.club_id = current_projection.club_id
                where current_projection.club_id = ?
                  and current_projection.session_id = ?
                  and current_projection.publication_id_snapshot = ?
                """.trimIndent(),
                { rs, _ ->
                    if (!rs.getBoolean("origin_readable")) {
                        null
                    } else {
                        PublicTakedownTarget(
                            clubId = UUID.fromString(rs.getString("club_id")),
                            sessionId = UUID.fromString(rs.getString("session_id")),
                            publicationId = UUID.fromString(rs.getString("publication_id_snapshot")),
                            targetGeneration = rs.getLong("generation"),
                            currentSurfaces = CURRENT_SURFACES,
                        )
                    }
                },
                clubId.dbString(),
                sessionId.dbString(),
                publicationId.dbString(),
            ).firstOrNull()

    override fun savePreview(
        actor: PublicTakedownActor,
        target: PublicTakedownTarget,
        bindingDigestKeyVersion: Int,
        bindingHmac: ByteArray,
        now: Instant,
        expiresAt: Instant,
    ): PublicTakedownPreview {
        val previewId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_previews (
              id, actor_admin_id, actor_role_snapshot, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, target_generation, binding_digest_key_version,
              binding_hmac, expires_at, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            previewId.dbString(),
            actor.authority.adminId.dbString(),
            actor.roleSnapshot,
            target.clubId.dbString(),
            target.sessionId.dbString(),
            target.publicationId.dbString(),
            target.targetGeneration,
            bindingDigestKeyVersion,
            bindingHmac,
            expiresAt.utc(),
            now.utc(),
        )
        return PublicTakedownPreview(
            previewId = previewId,
            expiresAt = expiresAt,
            clubId = target.clubId,
            sessionId = target.sessionId,
            publicationId = target.publicationId,
            targetGeneration = target.targetGeneration,
            currentSurfaces = target.currentSurfaces,
        )
    }

    override fun loadPreview(previewId: UUID): StoredPublicTakedownPreview? =
        jdbcTemplate
            .query(
                """
                select id, actor_admin_id, actor_role_snapshot, club_id_snapshot, session_id_snapshot,
                       publication_id_snapshot, target_generation, binding_digest_key_version,
                       binding_hmac, expires_at
                from admin_public_takedown_previews
                where id = ?
                """.trimIndent(),
                { rs, _ -> rs.toPreview() },
                previewId.dbString(),
            ).firstOrNull()

    @Transactional
    override fun confirm(
        actor: PublicTakedownActor,
        prepared: PreparedPublicTakedownConfirm,
        now: Instant,
    ): PublicTakedownReceipt {
        val lockedPreview =
            loadPreviewForUpdate(prepared.preview.previewId)
                ?: throw PublicTakedownException(PublicTakedownError.PREVIEW_NOT_FOUND)
        validateLockedPreview(actor, prepared, lockedPreview)
        lockSession(lockedPreview.clubId, lockedPreview.sessionId)
        loadReceipt(actor, lockedPreview, prepared.idempotencyKeyHmac)?.let { existing ->
            if (!RequestIdentityHmac.equal(existing.requestHmac, prepared.requestHmac)) {
                throw PublicTakedownException(PublicTakedownError.IDEMPOTENCY_CONFLICT)
            }
            return existing.receipt
        }
        if (!lockedPreview.expiresAt.isAfter(now)) {
            throw PublicTakedownException(PublicTakedownError.PREVIEW_EXPIRED)
        }
        val liveTarget = loadLockedTarget(lockedPreview)
        if (liveTarget.publicationId != lockedPreview.publicationId) {
            throw PublicTakedownException(PublicTakedownError.PREVIEW_TARGET_MISMATCH)
        }
        if (liveTarget.generation != lockedPreview.targetGeneration || !liveTarget.originReadable) {
            throw PublicTakedownException(PublicTakedownError.GENERATION_MISMATCH)
        }

        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        val clubGeneration = incrementClubGeneration(lockedPreview.clubId)
        val generation = denyOrigin(lockedPreview, clubGeneration, convergenceId)
        insertReceipt(actor, prepared, receiptId, convergenceId, generation, clubGeneration, now)
        insertConvergenceLink(receiptId, lockedPreview, convergenceId, generation, clubGeneration, now)
        insertConvergenceWork(lockedPreview, convergenceId, now)
        return PublicTakedownReceipt(
            receiptId = receiptId,
            convergenceId = convergenceId,
            clubId = lockedPreview.clubId,
            sessionId = lockedPreview.sessionId,
            publicationId = lockedPreview.publicationId,
            committedGeneration = generation,
            committedClubGeneration = clubGeneration,
            reasonCategory = prepared.reasonCategory,
            createdAt = now,
        )
    }

    private fun validateLockedPreview(
        actor: PublicTakedownActor,
        prepared: PreparedPublicTakedownConfirm,
        locked: StoredPublicTakedownPreview,
    ) {
        val expected = prepared.preview
        if (locked.actorAdminId != actor.authority.adminId || locked.roleSnapshot != actor.roleSnapshot ||
            locked.previewId != expected.previewId || locked.clubId != expected.clubId ||
            locked.sessionId != expected.sessionId || locked.publicationId != expected.publicationId ||
            locked.targetGeneration != expected.targetGeneration ||
            locked.bindingDigestKeyVersion != expected.bindingDigestKeyVersion ||
            !RequestIdentityHmac.equal(locked.bindingHmac, expected.bindingHmac)
        ) {
            throw PublicTakedownException(PublicTakedownError.PREVIEW_TARGET_MISMATCH)
        }
    }

    private fun lockSession(
        clubId: UUID,
        sessionId: UUID,
    ) {
        val found =
            jdbcTemplate
                .query(
                    "select id from sessions where club_id = ? and id = ? for update",
                    { rs, _ -> rs.getString("id") },
                    clubId.dbString(),
                    sessionId.dbString(),
                ).firstOrNull()
        if (found == null) throw PublicTakedownException(PublicTakedownError.TARGET_NOT_FOUND)
    }

    private fun loadLockedTarget(preview: StoredPublicTakedownPreview): LockedTarget =
        jdbcTemplate
            .query(
                """
                select current_projection.publication_id_snapshot, current_projection.generation,
                       current_projection.origin_readable
                from public_projection_current current_projection
                join public_session_publications publications
                  on publications.id = current_projection.publication_id_snapshot
                  and publications.club_id = current_projection.club_id
                  and publications.session_id = current_projection.session_id
                where current_projection.club_id = ? and current_projection.session_id = ?
                for update
                """.trimIndent(),
                { rs, _ ->
                    LockedTarget(
                        publicationId = UUID.fromString(rs.getString("publication_id_snapshot")),
                        generation = rs.getLong("generation"),
                        originReadable = rs.getBoolean("origin_readable"),
                    )
                },
                preview.clubId.dbString(),
                preview.sessionId.dbString(),
            ).firstOrNull() ?: throw PublicTakedownException(PublicTakedownError.TARGET_NOT_FOUND)

    private fun incrementClubGeneration(clubId: UUID): Long {
        jdbcTemplate.update(
            """
            update public_club_projection_generations
            set generation = generation + 1, updated_at = utc_timestamp(6)
            where club_id = ?
            """.trimIndent(),
            clubId.dbString(),
        )
        return jdbcTemplate.queryForObject(
            "select generation from public_club_projection_generations where club_id = ?",
            Long::class.java,
            clubId.dbString(),
        ) ?: throw PublicTakedownException(PublicTakedownError.TARGET_NOT_FOUND)
    }

    private fun denyOrigin(
        preview: StoredPublicTakedownPreview,
        clubGeneration: Long,
        convergenceId: UUID,
    ): Long {
        val updated =
            jdbcTemplate.update(
                """
                update public_projection_current
                set generation = generation + 1, club_generation = ?, origin_readable = false,
                    convergence_id = ?, updated_at = utc_timestamp(6)
                where club_id = ? and session_id = ? and publication_id_snapshot = ?
                  and generation = ? and origin_readable = true
                """.trimIndent(),
                clubGeneration,
                convergenceId.dbString(),
                preview.clubId.dbString(),
                preview.sessionId.dbString(),
                preview.publicationId.dbString(),
                preview.targetGeneration,
            )
        if (updated != 1) throw PublicTakedownException(PublicTakedownError.GENERATION_MISMATCH)
        return preview.targetGeneration + 1
    }

    private fun insertReceipt(
        actor: PublicTakedownActor,
        prepared: PreparedPublicTakedownConfirm,
        receiptId: UUID,
        convergenceId: UUID,
        generation: Long,
        clubGeneration: Long,
        now: Instant,
    ) {
        val preview = prepared.preview
        jdbcTemplate.update(
            """
            insert into admin_public_takedown_receipts (
              id, actor_admin_id, actor_role_snapshot, capability_snapshot,
              club_id_snapshot, session_id_snapshot, publication_id_snapshot, preview_id_snapshot,
              idempotency_key_hmac, canonical_schema_version, digest_key_version, request_hmac,
              reason_category, reason_summary, origin_result, committed_generation,
              committed_club_generation, convergence_id, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REDACTED_NON_EMPTY',
                      'DENIED', ?, ?, ?, ?)
            """.trimIndent(),
            receiptId.dbString(),
            actor.authority.adminId.dbString(),
            actor.roleSnapshot,
            PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN.name,
            preview.clubId.dbString(),
            preview.sessionId.dbString(),
            preview.publicationId.dbString(),
            preview.previewId.dbString(),
            prepared.idempotencyKeyHmac,
            prepared.canonicalSchemaVersion,
            prepared.digestKeyVersion,
            prepared.requestHmac,
            prepared.reasonCategory,
            generation,
            clubGeneration,
            convergenceId.dbString(),
            now.utc(),
        )
    }

    private fun insertConvergenceLink(
        receiptId: UUID,
        preview: StoredPublicTakedownPreview,
        convergenceId: UUID,
        generation: Long,
        clubGeneration: Long,
        now: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_links (
              mutation_receipt_id, convergence_id, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, committed_generation, committed_club_generation,
              live_record_revision, origin_readable, created_at
            ) select ?, ?, ?, ?, ?, ?, ?, live_record_revision, false, ?
              from public_projection_current where session_id = ?
            """.trimIndent(),
            receiptId.dbString(),
            convergenceId.dbString(),
            preview.clubId.dbString(),
            preview.sessionId.dbString(),
            preview.publicationId.dbString(),
            generation,
            clubGeneration,
            now.utc(),
            preview.sessionId.dbString(),
        )
    }

    private fun insertConvergenceWork(
        preview: StoredPublicTakedownPreview,
        convergenceId: UUID,
        now: Instant,
    ) {
        jdbcTemplate.update(
            """
            insert into public_convergence_work (
              convergence_id, club_id_snapshot, session_id_snapshot, publication_id_snapshot,
              next_attempt_no, available_at, retention_until, created_at, updated_at
            ) values (?, ?, ?, ?, 1, ?, timestampadd(day, 30, ?), ?, ?)
            """.trimIndent(),
            convergenceId.dbString(),
            preview.clubId.dbString(),
            preview.sessionId.dbString(),
            preview.publicationId.dbString(),
            now.utc(),
            now.utc(),
            now.utc(),
            now.utc(),
        )
    }

    private fun loadPreviewForUpdate(previewId: UUID): StoredPublicTakedownPreview? =
        jdbcTemplate
            .query(
                """
                select id, actor_admin_id, actor_role_snapshot, club_id_snapshot, session_id_snapshot,
                       publication_id_snapshot, target_generation, binding_digest_key_version,
                       binding_hmac, expires_at
                from admin_public_takedown_previews where id = ? for update
                """.trimIndent(),
                { rs, _ -> rs.toPreview() },
                previewId.dbString(),
            ).firstOrNull()

    private fun loadReceipt(
        actor: PublicTakedownActor,
        preview: StoredPublicTakedownPreview,
        keyHmac: ByteArray,
    ): StoredReceipt? =
        jdbcTemplate
            .query(
                """
                select id, convergence_id, club_id_snapshot, session_id_snapshot,
                       publication_id_snapshot, committed_generation, committed_club_generation,
                       origin_result, reason_category, request_hmac, created_at
                from admin_public_takedown_receipts
                where actor_admin_id = ? and capability_snapshot = ? and club_id_snapshot = ?
                  and publication_id_snapshot = ? and idempotency_key_hmac = ?
                """.trimIndent(),
                { rs, _ ->
                    StoredReceipt(
                        requestHmac = rs.getBytes("request_hmac"),
                        receipt =
                            PublicTakedownReceipt(
                                receiptId = UUID.fromString(rs.getString("id")),
                                convergenceId = UUID.fromString(rs.getString("convergence_id")),
                                clubId = UUID.fromString(rs.getString("club_id_snapshot")),
                                sessionId = UUID.fromString(rs.getString("session_id_snapshot")),
                                publicationId = UUID.fromString(rs.getString("publication_id_snapshot")),
                                committedGeneration = rs.getLong("committed_generation"),
                                committedClubGeneration = rs.getLong("committed_club_generation"),
                                originResult = rs.getString("origin_result"),
                                reasonCategory = rs.getString("reason_category"),
                                createdAt = rs.getTimestamp("created_at").toInstant(),
                            ),
                    )
                },
                actor.authority.adminId.dbString(),
                PlatformCapability.EMERGENCY_PUBLIC_TAKEDOWN.name,
                preview.clubId.dbString(),
                preview.publicationId.dbString(),
                keyHmac,
            ).firstOrNull()

    private fun ResultSet.toPreview() =
        StoredPublicTakedownPreview(
            previewId = UUID.fromString(getString("id")),
            actorAdminId = UUID.fromString(getString("actor_admin_id")),
            roleSnapshot = getString("actor_role_snapshot"),
            clubId = UUID.fromString(getString("club_id_snapshot")),
            sessionId = UUID.fromString(getString("session_id_snapshot")),
            publicationId = UUID.fromString(getString("publication_id_snapshot")),
            targetGeneration = getLong("target_generation"),
            bindingDigestKeyVersion = getInt("binding_digest_key_version"),
            bindingHmac = getBytes("binding_hmac"),
            expiresAt = getTimestamp("expires_at").toInstant(),
        )

    private data class LockedTarget(
        val publicationId: UUID,
        val generation: Long,
        val originReadable: Boolean,
    )

    private data class StoredReceipt(
        val requestHmac: ByteArray,
        val receipt: PublicTakedownReceipt,
    )

    private companion object {
        val CURRENT_SURFACES = setOf("ORIGIN", "BFF", "CDN", "BROWSER")
    }
}

private fun Instant.utc(): Timestamp = Timestamp.from(this)
