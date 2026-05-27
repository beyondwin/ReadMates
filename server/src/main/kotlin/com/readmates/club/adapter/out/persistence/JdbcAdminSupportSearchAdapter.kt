package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminSupportClubMembershipSummary
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.port.out.AdminSupportSearchPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcAdminSupportSearchAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminSupportSearchPort {
    override fun search(
        query: String,
        clubId: UUID?,
        limit: Int,
    ): List<AdminSupportSearchResult> {
        val like = "%${query.lowercase()}%"
        return jdbcTemplate.query(
            """
            select
              users.id,
              users.name,
              users.email,
              pa.role as platform_role,
              pa.status as platform_status
            from users
            left join platform_admins pa on pa.user_id = users.id
            where (lower(users.email) like ? or lower(users.name) like ?)
              and (? is null or exists (
                select 1 from memberships m where m.user_id = users.id and m.club_id = ?
              ))
            order by users.updated_at desc
            limit ?
            """.trimIndent(),
            { rs, _ -> rs.toSearchResult(clubId) },
            like,
            like,
            clubId?.dbString(),
            clubId?.dbString(),
            limit.coerceIn(1, 10),
        )
    }

    private fun ResultSet.toSearchResult(clubId: UUID?): AdminSupportSearchResult {
        val userId = uuid("id")
        val role = getString("platform_role")?.let(PlatformAdminRole::valueOf)
        val status = getString("platform_status")
        val eligible = role != null && status == "ACTIVE"
        return AdminSupportSearchResult(
            subjectId = userId,
            displayName = getString("name"),
            maskedEmail = maskEmail(getString("email")),
            kind = if (role != null) "PLATFORM_ADMIN" else "USER",
            platformAdminRole = role,
            platformAdminStatus = status,
            clubMembershipSummary = memberships(userId, clubId),
            grantEligible = eligible,
            grantBlockedReason = if (eligible) null else "NOT_ACTIVE_PLATFORM_ADMIN",
        )
    }

    private fun memberships(
        userId: UUID,
        clubId: UUID?,
    ): List<AdminSupportClubMembershipSummary> =
        jdbcTemplate.query(
            """
            select m.club_id, clubs.name as club_name, m.role, m.status
            from memberships m
            join clubs on clubs.id = m.club_id
            where m.user_id = ?
              and (? is null or m.club_id = ?)
            order by clubs.name asc
            limit 5
            """.trimIndent(),
            { rs, _ ->
                AdminSupportClubMembershipSummary(
                    clubId = rs.uuid("club_id"),
                    clubName = rs.getString("club_name"),
                    role = rs.getString("role"),
                    status = rs.getString("status"),
                )
            },
            userId.dbString(),
            clubId?.dbString(),
            clubId?.dbString(),
        )
}

private fun maskEmail(email: String): String {
    val parts = email.split("@", limit = 2)
    if (parts.size != 2) return "***"
    val head = parts[0].firstOrNull()?.toString() ?: "*"
    return "$head***@${parts[1]}"
}
