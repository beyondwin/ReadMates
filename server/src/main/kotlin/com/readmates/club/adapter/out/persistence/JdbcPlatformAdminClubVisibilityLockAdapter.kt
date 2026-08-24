package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.LockedPlatformAdminClubVisibilityState
import com.readmates.club.application.port.out.PlatformAdminClubVisibilityLockPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcPlatformAdminClubVisibilityLockAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : PlatformAdminClubVisibilityLockPort {
    override fun lockVisibilityState(
        clubId: UUID,
        requireActiveHost: Boolean,
    ): LockedPlatformAdminClubVisibilityState? {
        val club =
            jdbcTemplate
                .query(
                    """
                    select id, name, tagline, about, admin_revision, status, public_visibility
                    from clubs
                    where id = ?
                    for update
                    """.trimIndent(),
                    { resultSet, _ -> resultSet.toLockedVisibilityState() },
                    clubId.dbString(),
                ).firstOrNull()
        val hasActiveHost = club != null && requireActiveHost && lockActiveHostRows(clubId)
        return club?.copy(hasActiveHost = hasActiveHost)
    }

    private fun lockActiveHostRows(clubId: UUID): Boolean =
        jdbcTemplate
            .query(
                """
                select id
                from memberships
                where club_id = ?
                  and role = 'HOST'
                  and status = 'ACTIVE'
                order by id
                for update
                """.trimIndent(),
                { resultSet, _ -> resultSet.getString("id") },
                clubId.dbString(),
            ).isNotEmpty()
}

private fun ResultSet.toLockedVisibilityState() =
    LockedPlatformAdminClubVisibilityState(
        clubId = uuid("id"),
        name = getString("name"),
        tagline = getString("tagline"),
        about = getString("about"),
        adminRevision = getLong("admin_revision"),
        status = ClubStatus.valueOf(getString("status")),
        publicVisibility = ClubPublicVisibility.valueOf(getString("public_visibility")),
        hasActiveHost = false,
    )
