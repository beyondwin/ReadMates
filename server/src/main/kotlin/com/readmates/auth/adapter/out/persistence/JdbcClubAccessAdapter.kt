package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.ClubAccessPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.OffsetDateTime
import java.util.UUID

@Repository
class JdbcClubAccessAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : ClubAccessPort {
    override fun touch(
        membershipId: UUID,
        clubId: UUID,
    ): OffsetDateTime? {
        jdbcTemplate.update(
            """
            insert into membership_club_access (membership_id, club_id, last_access_at)
            select memberships.id, memberships.club_id, utc_timestamp(6)
            from memberships
            where memberships.id = ?
              and memberships.club_id = ?
              and memberships.status in ('VIEWER', 'ACTIVE', 'SUSPENDED')
            on duplicate key update
              last_access_at = if(
                membership_club_access.last_access_at <= utc_timestamp(6) - interval 15 minute,
                utc_timestamp(6),
                membership_club_access.last_access_at
              )
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        )
        return jdbcTemplate
            .query(
                """
                select membership_club_access.last_access_at
                from membership_club_access
                join memberships on memberships.id = membership_club_access.membership_id
                  and memberships.club_id = membership_club_access.club_id
                where membership_club_access.membership_id = ?
                  and membership_club_access.club_id = ?
                  and memberships.status in ('VIEWER', 'ACTIVE', 'SUSPENDED')
                """.trimIndent(),
                { resultSet, _ -> resultSet.utcOffsetDateTime("last_access_at") },
                membershipId.dbString(),
                clubId.dbString(),
            ).firstOrNull()
    }
}
