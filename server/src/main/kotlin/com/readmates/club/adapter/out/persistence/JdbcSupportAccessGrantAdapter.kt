package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminSupportGrantLedgerItem
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.CreateSupportAccessGrantPort
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.club.application.port.out.RevokeSupportAccessGrantPort
import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcSupportAccessGrantAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : CreateSupportAccessGrantPort,
    RevokeSupportAccessGrantPort,
    LoadSupportAccessGrantPort,
    AdminSupportGrantLedgerPort {
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
        granteeUserId: UUID?,
        limit: Int,
    ): List<AdminSupportGrantLedgerItem> =
        jdbcTemplate.query(
            """
            select
              sag.id,
              sag.club_id,
              clubs.name as club_name,
              sag.grantee_user_id,
              users.name as grantee_display_name,
              users.email as grantee_email,
              sag.scope,
              sag.reason,
              sag.expires_at,
              sag.created_at,
              sag.revoked_at,
              case
                when sag.revoked_at is not null then 'REVOKED'
                when sag.expires_at <= utc_timestamp(6) then 'EXPIRED'
                else 'ACTIVE'
              end as grant_status,
              pa.role as created_by_role
            from support_access_grants sag
            join clubs on clubs.id = sag.club_id
            join users on users.id = sag.grantee_user_id
            left join platform_admins pa on pa.user_id = sag.granted_by_user_id
            where (? is null or sag.club_id = ?)
              and (? is null or sag.grantee_user_id = ?)
            order by sag.created_at desc
            limit ?
            """.trimIndent(),
            ::mapLedgerItem,
            clubId?.dbString(),
            clubId?.dbString(),
            granteeUserId?.dbString(),
            granteeUserId?.dbString(),
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
        granteeUserId = rs.uuid("grantee_user_id"),
        granteeDisplayName = rs.getString("grantee_display_name"),
        granteeMaskedEmail = maskEmail(rs.getString("grantee_email")),
        scope = SupportAccessGrantScope.valueOf(rs.getString("scope")),
        reason = rs.getString("reason"),
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
