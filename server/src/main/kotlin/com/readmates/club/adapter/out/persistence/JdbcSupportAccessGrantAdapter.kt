package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminSupportGrantLedgerCursor
import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.PersistSupportGrantOrigin
import com.readmates.club.application.model.StoredSupportGrantCommandPreview
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.model.SupportGrantCommandReceiptRecord
import com.readmates.club.application.model.SupportGrantCommandType
import com.readmates.club.application.model.SupportGrantReasonCategory
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.CreateSupportAccessGrantPort
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.club.application.port.out.RevokeSupportAccessGrantPort
import com.readmates.club.application.port.out.SupportGrantCommandPort
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcSupportAccessGrantAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) : CreateSupportAccessGrantPort,
    RevokeSupportAccessGrantPort,
    LoadSupportAccessGrantPort,
    AdminSupportGrantLedgerPort,
    SupportGrantCommandPort {
    @Transactional
    override fun createGrant(
        clubId: UUID,
        grantedByUserId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        reason: String,
        expiresAt: OffsetDateTime,
    ): SupportAccessGrant {
        val id = UUID.randomUUID()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        jdbcTemplate.update(
            """
            insert into support_access_grants
              (id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, created_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            clubId.dbString(),
            grantedByUserId.dbString(),
            granteeUserId.dbString(),
            scope.name,
            reason,
            expiresAt.toTimestamp(),
            now.toTimestamp(),
        )
        return SupportAccessGrant(
            id = id,
            clubId = clubId,
            grantedByUserId = grantedByUserId,
            granteeUserId = granteeUserId,
            scope = scope,
            reason = reason,
            expiresAt = expiresAt,
            revokedAt = null,
            createdAt = now,
        )
    }

    @Transactional
    override fun revokeGrant(
        grantId: UUID,
        revokedAt: OffsetDateTime,
    ): SupportAccessGrant? {
        val affected =
            jdbcTemplate.update(
                """
                update support_access_grants
                set revoked_at = ?
                where id = ? and revoked_at is null
                """.trimIndent(),
                revokedAt.toTimestamp(),
                grantId.dbString(),
            )
        if (affected == 0) return null
        return loadGrant(grantId)
    }

    override fun loadActiveGrantsByClub(clubId: UUID): List<SupportAccessGrant> =
        jdbcTemplate.query(
            """
            select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
            from support_access_grants
            where club_id = ? and revoked_at is null and expires_at > utc_timestamp(6)
            order by created_at desc
            """.trimIndent(),
            ::mapGrant,
            clubId.dbString(),
        )

    override fun loadActiveGrantById(grantId: UUID): SupportAccessGrant? =
        jdbcTemplate
            .query(
                """
                select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
                from support_access_grants
                where id = ? and revoked_at is null and expires_at > utc_timestamp(6)
                limit 1
                """.trimIndent(),
                ::mapGrant,
                grantId.dbString(),
            ).firstOrNull()

    override fun loadActiveGrantsByGrantee(granteeUserId: UUID): List<SupportAccessGrant> =
        jdbcTemplate.query(
            """
            select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
            from support_access_grants
            where grantee_user_id = ? and revoked_at is null and expires_at > utc_timestamp(6)
            order by created_at desc
            """.trimIndent(),
            ::mapGrant,
            granteeUserId.dbString(),
        )

    override fun loadActiveGrantByGranteeAndClub(
        granteeUserId: UUID,
        clubId: UUID,
    ): SupportAccessGrant? =
        jdbcTemplate
            .query(
                """
                select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
                from support_access_grants
                where grantee_user_id = ? and club_id = ?
                  and scope = 'HOST_SUPPORT_READ'
                  and revoked_at is null and expires_at > utc_timestamp(6)
                limit 1
                """.trimIndent(),
                ::mapGrant,
                granteeUserId.dbString(),
                clubId.dbString(),
            ).firstOrNull()

    override fun listLedger(
        clubId: UUID?,
        status: String?,
        cursor: AdminSupportGrantLedgerCursor?,
        limit: Int,
    ): List<AdminSupportGrantLedgerItem> =
        jdbcTemplate.query(
            """
            select
              sag.id,
              sag.club_id,
              clubs.name as club_name,
              users.name as grantee_display_name,
              users.email as grantee_email,
              sag.scope,
              sag.reason_category,
              sag.note_present,
              sag.expires_at,
              sag.created_at,
              sag.revoked_at,
              case
                when sag.revoked_at is not null then 'REVOKED'
                when sag.expires_at <= utc_timestamp(6) then 'EXPIRED'
                when sag.expires_at <= date_add(utc_timestamp(6), interval 4 hour) then 'EXPIRING'
                else 'ACTIVE'
              end as grant_status,
              pa.role as created_by_role
            from support_access_grants sag
            join clubs on clubs.id = sag.club_id
            join users on users.id = sag.grantee_user_id
            left join platform_admins pa on pa.user_id = sag.granted_by_user_id
            where (? is null or sag.club_id = ?)
              and (? is null or (case
                when sag.revoked_at is not null then 'REVOKED'
                when sag.expires_at <= utc_timestamp(6) then 'EXPIRED'
                when sag.expires_at <= date_add(utc_timestamp(6), interval 4 hour) then 'EXPIRING'
                else 'ACTIVE'
              end) = ?)
              and (? is null or sag.created_at < ? or (sag.created_at = ? and sag.id < ?))
            order by sag.created_at desc, sag.id desc
            limit ?
            """.trimIndent(),
            ::mapLedgerItem,
            clubId?.dbString(),
            clubId?.dbString(),
            status,
            status,
            cursor?.createdAt?.toTimestamp(),
            cursor?.createdAt?.toTimestamp(),
            cursor?.createdAt?.toTimestamp(),
            cursor?.grantId?.dbString(),
            limit.coerceIn(1, MAX_GRANT_LEDGER_LIMIT),
        )

    override fun hasActiveGrant(
        clubId: UUID,
        granteeUserId: UUID,
    ): Boolean = loadActiveGrantByGranteeAndClub(granteeUserId, clubId) != null

    override fun isGrantEligibleClub(clubId: UUID): Boolean =
        (
            jdbcTemplate.queryForObject(
                "select count(*) from clubs where id = ? and status <> 'ARCHIVED'",
                Int::class.java,
                clubId.dbString(),
            ) ?: 0
        ) > 0

    override fun isActivePlatformAdmin(userId: UUID): Boolean =
        (
            jdbcTemplate.queryForObject(
                "select count(*) from platform_admins where user_id = ? and status = 'ACTIVE'",
                Int::class.java,
                userId.dbString(),
            ) ?: 0
        ) > 0

    override fun savePreview(preview: StoredSupportGrantCommandPreview) {
        jdbcTemplate.update(
            """
            insert into platform_admin_support_command_previews (
              id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, grant_id_snapshot, club_id_snapshot, create_slot_id_snapshot,
              scope_snapshot, grant_expires_at_snapshot, reason_category, note_present,
              canonical_schema_version, digest_key_version, request_hmac, safe_impact_json,
              expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
            ) values (?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, null, null, ?)
            """.trimIndent(),
            preview.previewId.dbString(),
            preview.commandType.name,
            preview.actorAdminId.dbString(),
            preview.actorRoleSnapshot,
            objectMapper.writeValueAsString(preview.actorCapabilities),
            preview.grantId?.dbString(),
            preview.clubId.dbString(),
            preview.createSlotId?.dbString(),
            preview.scope.name,
            preview.grantExpiresAt.toTimestamp(),
            preview.reasonCategory.name,
            if (preview.notePresent) 1 else 0,
            preview.canonicalSchemaVersion,
            preview.digestKeyVersion,
            preview.requestHmac,
            objectMapper.writeValueAsString(mapOf("impactCodes" to preview.impactCodes)),
            Timestamp.from(preview.expiresAt),
            Timestamp.from(preview.createdAt),
        )
    }

    override fun loadPreview(previewId: UUID): StoredSupportGrantCommandPreview? =
        jdbcTemplate
            .query(
                """
                select id, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
                       actor_capabilities_json, grant_id_snapshot, club_id_snapshot, create_slot_id_snapshot,
                       scope_snapshot, grant_expires_at_snapshot, reason_category, note_present,
                       canonical_schema_version, digest_key_version, request_hmac, safe_impact_json,
                       expires_at, consumed_at, consumed_receipt_id_snapshot, created_at
                from platform_admin_support_command_previews
                where id = ?
                limit 1
                """.trimIndent(),
                { rs, _ -> mapPreview(rs) },
                previewId.dbString(),
            ).firstOrNull()

    override fun lockCreateIdentity(
        clubId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        now: OffsetDateTime,
    ): Boolean {
        jdbcTemplate.queryForList(
            """
            select id from support_access_grants
            where club_id = ? and grantee_user_id = ? and scope = ?
            order by id for update
            """.trimIndent(),
            clubId.dbString(),
            granteeUserId.dbString(),
            scope.name,
        )
        jdbcTemplate.update(
            """
            update support_access_grants
            set active_slot = null
            where club_id = ? and grantee_user_id = ? and scope = ? and active_slot = 1
              and (revoked_at is not null or expires_at <= ?)
            """.trimIndent(),
            clubId.dbString(),
            granteeUserId.dbString(),
            scope.name,
            now.toTimestamp(),
        )
        return (
            jdbcTemplate.queryForObject(
                """
                select count(*) from support_access_grants
                where club_id = ? and grantee_user_id = ? and scope = ?
                  and active_slot = 1 and revoked_at is null and expires_at > ?
                """.trimIndent(),
                Int::class.java,
                clubId.dbString(),
                granteeUserId.dbString(),
                scope.name,
                now.toTimestamp(),
            ) ?: 0
        ) > 0
    }

    override fun createCanonicalGrant(
        grantId: UUID,
        clubId: UUID,
        grantedByUserId: UUID,
        granteeUserId: UUID,
        scope: SupportAccessGrantScope,
        reasonCategory: SupportGrantReasonCategory,
        notePresent: Boolean,
        expiresAt: OffsetDateTime,
        createdAt: OffsetDateTime,
    ) {
        jdbcTemplate.update(
            """
            insert into support_access_grants (
              id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at,
              revoked_at, created_at, active_slot, reason_category, note_present, reason_evidence_version
            ) values (?, ?, ?, ?, ?, '[REDACTED]', ?, null, ?, 1, ?, ?, 1)
            """.trimIndent(),
            grantId.dbString(),
            clubId.dbString(),
            grantedByUserId.dbString(),
            granteeUserId.dbString(),
            scope.name,
            expiresAt.toTimestamp(),
            createdAt.toTimestamp(),
            reasonCategory.name,
            if (notePresent) 1 else 0,
        )
    }

    override fun lockActiveGrant(
        grantId: UUID,
        now: OffsetDateTime,
    ): SupportAccessGrant? =
        jdbcTemplate
            .query(
                """
                select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
                from support_access_grants
                where id = ? and active_slot = 1 and revoked_at is null and expires_at > ?
                for update
                """.trimIndent(),
                ::mapGrant,
                grantId.dbString(),
                now.toTimestamp(),
            ).firstOrNull()

    override fun revokeCanonicalGrant(
        grantId: UUID,
        revokedAt: OffsetDateTime,
    ): Boolean =
        jdbcTemplate.update(
            """
            update support_access_grants
            set revoked_at = ?, active_slot = null
            where id = ? and active_slot = 1 and revoked_at is null and expires_at > ?
            """.trimIndent(),
            revokedAt.toTimestamp(),
            grantId.dbString(),
            revokedAt.toTimestamp(),
        ) == 1

    override fun storeOrigin(origin: PersistSupportGrantOrigin): Boolean {
        val receipt = origin.receipt
        val metadata =
            mapOf(
                "receiptId" to receipt.receiptId.toString(),
                "grantId" to receipt.grantId.toString(),
                "clubId" to receipt.clubId.toString(),
                "commandType" to receipt.commandType.name,
                "beforeStatus" to receipt.beforeStatus,
                "afterStatus" to receipt.afterStatus,
                "reasonCategory" to receipt.reasonCategory.name,
                "notePresent" to receipt.notePresent,
            )
        jdbcTemplate.update(
            """
            insert into platform_audit_events
              (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, ?, null, ?, cast(? as json), ?)
            """.trimIndent(),
            receipt.auditEventId.dbString(),
            origin.actor.adminId.dbString(),
            origin.actor.role.name,
            "SUPPORT_ACCESS_GRANT_${receipt.commandType.name}D",
            objectMapper.writeValueAsString(metadata),
            Timestamp.from(receipt.createdAt),
        )
        jdbcTemplate.update(
            """
            insert into platform_admin_support_command_receipts (
              id, preview_id_snapshot, command_type, actor_user_id_snapshot, actor_platform_role_snapshot,
              actor_capabilities_json, grant_id_snapshot, club_id_snapshot, scope_snapshot,
              grant_expires_at_snapshot, reason_category, note_present, before_status, after_status,
              outcome, canonical_schema_version, digest_key_version, request_hmac,
              platform_audit_event_id_snapshot, created_at
            ) values (?, ?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            receipt.receiptId.dbString(),
            receipt.previewId.dbString(),
            receipt.commandType.name,
            receipt.actorAdminId.dbString(),
            receipt.actorRoleSnapshot,
            objectMapper.writeValueAsString(receipt.actorCapabilities),
            receipt.grantId.dbString(),
            receipt.clubId.dbString(),
            receipt.scope.name,
            receipt.grantExpiresAt.toTimestamp(),
            receipt.reasonCategory.name,
            if (receipt.notePresent) 1 else 0,
            receipt.beforeStatus,
            receipt.afterStatus,
            receipt.outcome,
            receipt.digest.schemaVersion,
            receipt.digest.digestKeyVersion,
            receipt.digest.requestHmac,
            receipt.auditEventId.dbString(),
            Timestamp.from(receipt.createdAt),
        )
        return jdbcTemplate.update(
            """
            update platform_admin_support_command_previews
            set consumed_at = ?, consumed_receipt_id_snapshot = ?
            where id = ? and consumed_at is null and consumed_receipt_id_snapshot is null
            """.trimIndent(),
            Timestamp.from(receipt.createdAt),
            receipt.receiptId.dbString(),
            receipt.previewId.dbString(),
        ) == 1
    }

    override fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        commandType: String,
        targetId: UUID,
    ): SupportGrantCommandReceiptRecord? =
        jdbcTemplate
            .query(
                """
                select id, preview_id_snapshot, command_type, actor_user_id_snapshot,
                       actor_platform_role_snapshot, actor_capabilities_json, grant_id_snapshot,
                       club_id_snapshot, scope_snapshot, grant_expires_at_snapshot, reason_category,
                       note_present, before_status, after_status, outcome, canonical_schema_version,
                       digest_key_version, request_hmac, platform_audit_event_id_snapshot, created_at
                from platform_admin_support_command_receipts
                where id = ? and actor_user_id_snapshot = ? and command_type = ?
                  and ((command_type = 'CREATE' and club_id_snapshot = ?)
                    or (command_type = 'REVOKE' and grant_id_snapshot = ?))
                limit 1
                """.trimIndent(),
                { rs, _ -> mapReceipt(rs) },
                receiptId.dbString(),
                actorAdminId.dbString(),
                commandType,
                targetId.dbString(),
                targetId.dbString(),
            ).firstOrNull()

    private fun loadGrant(grantId: UUID): SupportAccessGrant? =
        jdbcTemplate
            .query(
                """
                select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
                from support_access_grants
                where id = ?
                limit 1
                """.trimIndent(),
                ::mapGrant,
                grantId.dbString(),
            ).firstOrNull()

    private fun mapPreview(rs: ResultSet): StoredSupportGrantCommandPreview {
        val impact = objectMapper.readTree(rs.getString("safe_impact_json")).get("impactCodes")
        return StoredSupportGrantCommandPreview(
            previewId = rs.uuid("id"),
            commandType = SupportGrantCommandType.valueOf(rs.getString("command_type")),
            actorAdminId = rs.uuid("actor_user_id_snapshot"),
            actorRoleSnapshot = rs.getString("actor_platform_role_snapshot"),
            actorCapabilities = objectMapper.readValue(rs.getString("actor_capabilities_json"), Array<String>::class.java).toList(),
            grantId = rs.getString("grant_id_snapshot")?.let(UUID::fromString),
            clubId = rs.uuid("club_id_snapshot"),
            createSlotId = rs.getString("create_slot_id_snapshot")?.let(UUID::fromString),
            scope = SupportAccessGrantScope.valueOf(rs.getString("scope_snapshot")),
            grantExpiresAt = rs.utcOffsetDateTime("grant_expires_at_snapshot"),
            reasonCategory = SupportGrantReasonCategory.valueOf(rs.getString("reason_category")),
            notePresent = rs.getInt("note_present") == 1,
            canonicalSchemaVersion = rs.getString("canonical_schema_version"),
            digestKeyVersion = rs.getInt("digest_key_version"),
            requestHmac = rs.getBytes("request_hmac"),
            impactCodes = objectMapper.readValue(impact.toString(), Array<String>::class.java).toList(),
            expiresAt = rs.getTimestamp("expires_at").toInstant(),
            consumedAt = rs.getTimestamp("consumed_at")?.toInstant(),
            consumedReceiptId = rs.getString("consumed_receipt_id_snapshot")?.let(UUID::fromString),
            createdAt = rs.getTimestamp("created_at").toInstant(),
        )
    }

    private fun mapReceipt(rs: ResultSet): SupportGrantCommandReceiptRecord =
        SupportGrantCommandReceiptRecord(
            receiptId = rs.uuid("id"),
            previewId = rs.uuid("preview_id_snapshot"),
            commandType = SupportGrantCommandType.valueOf(rs.getString("command_type")),
            actorAdminId = rs.uuid("actor_user_id_snapshot"),
            actorRoleSnapshot = rs.getString("actor_platform_role_snapshot"),
            actorCapabilities = objectMapper.readValue(rs.getString("actor_capabilities_json"), Array<String>::class.java).toList(),
            grantId = rs.uuid("grant_id_snapshot"),
            clubId = rs.uuid("club_id_snapshot"),
            scope = SupportAccessGrantScope.valueOf(rs.getString("scope_snapshot")),
            grantExpiresAt = rs.utcOffsetDateTime("grant_expires_at_snapshot"),
            reasonCategory = SupportGrantReasonCategory.valueOf(rs.getString("reason_category")),
            notePresent = rs.getInt("note_present") == 1,
            beforeStatus = rs.getString("before_status"),
            afterStatus = rs.getString("after_status"),
            outcome = rs.getString("outcome"),
            digest =
                com.readmates.shared.adminmutation.application.model.AdminCommandDigest(
                    schemaVersion = rs.getString("canonical_schema_version"),
                    digestKeyVersion = rs.getInt("digest_key_version"),
                    idempotencyKeyHmac = ByteArray(32),
                    requestHmac = rs.getBytes("request_hmac"),
                ),
            auditEventId = rs.uuid("platform_audit_event_id_snapshot"),
            createdAt = rs.getTimestamp("created_at").toInstant(),
        )
}

private fun mapGrant(
    rs: ResultSet,
    @Suppress("UNUSED_PARAMETER") rowNum: Int,
): SupportAccessGrant =
    SupportAccessGrant(
        id = rs.uuid("id"),
        clubId = rs.uuid("club_id"),
        grantedByUserId = rs.uuid("granted_by_user_id"),
        granteeUserId = rs.uuid("grantee_user_id"),
        scope = SupportAccessGrantScope.valueOf(rs.getString("scope")),
        reason = rs.getString("reason"),
        expiresAt = rs.utcOffsetDateTime("expires_at"),
        revokedAt = rs.utcOffsetDateTimeOrNull("revoked_at"),
        createdAt = rs.utcOffsetDateTime("created_at"),
    )

private fun mapLedgerItem(
    rs: ResultSet,
    @Suppress("UNUSED_PARAMETER") rowNum: Int,
): AdminSupportGrantLedgerItem =
    AdminSupportGrantLedgerItem(
        grantId = rs.uuid("id"),
        clubId = rs.uuid("club_id"),
        clubName = rs.getString("club_name"),
        granteeDisplayName = rs.getString("grantee_display_name"),
        granteeMaskedEmail = maskEmail(rs.getString("grantee_email")),
        scope = SupportAccessGrantScope.valueOf(rs.getString("scope")),
        reasonCategory = rs.getString("reason_category"),
        notePresent = rs.getInt("note_present") == 1,
        expiresAt = rs.utcOffsetDateTime("expires_at"),
        createdAt = rs.utcOffsetDateTime("created_at"),
        revokedAt = rs.utcOffsetDateTimeOrNull("revoked_at"),
        status = rs.getString("grant_status"),
        createdByRole = rs.getString("created_by_role") ?: "UNKNOWN",
    )

private fun OffsetDateTime.toTimestamp(): Timestamp = Timestamp.from(toInstant())

private fun maskEmail(email: String): String {
    val parts = email.split("@", limit = 2)
    if (parts.size != 2) return "***"
    val head = parts[0].firstOrNull()?.toString() ?: "*"
    return "$head***@${parts[1]}"
}

private const val MAX_GRANT_LEDGER_LIMIT = 100
