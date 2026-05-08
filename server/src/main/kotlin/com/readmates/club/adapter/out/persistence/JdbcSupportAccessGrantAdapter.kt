package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.SupportAccessGrant
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
    LoadSupportAccessGrantPort {

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
    override fun revokeGrant(grantId: UUID, revokedAt: OffsetDateTime): SupportAccessGrant? {
        val affected = jdbcTemplate.update(
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

    override fun hasActiveGrant(granteeUserId: UUID, clubId: UUID): Boolean {
        val count = jdbcTemplate.queryForObject(
            """
            select count(*) from support_access_grants
            where grantee_user_id = ? and club_id = ? and revoked_at is null and expires_at > utc_timestamp(6)
            """.trimIndent(),
            Long::class.java,
            granteeUserId.dbString(),
            clubId.dbString(),
        ) ?: 0L
        return count > 0
    }

    private fun loadGrant(grantId: UUID): SupportAccessGrant? =
        jdbcTemplate.query(
            """
            select id, club_id, granted_by_user_id, grantee_user_id, scope, reason, expires_at, revoked_at, created_at
            from support_access_grants
            where id = ?
            limit 1
            """.trimIndent(),
            ::mapGrant,
            grantId.dbString(),
        ).firstOrNull()

    private fun mapGrant(rs: ResultSet, @Suppress("UNUSED_PARAMETER") rowNum: Int): SupportAccessGrant =
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
}

private fun OffsetDateTime.toTimestamp(): Timestamp = Timestamp.from(toInstant())
