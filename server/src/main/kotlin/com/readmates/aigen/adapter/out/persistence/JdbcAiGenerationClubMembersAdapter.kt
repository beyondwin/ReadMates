package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.port.out.ActiveClubMember
import com.readmates.aigen.application.port.out.LoadAiGenerationClubMembersPort
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcAiGenerationClubMembersAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadAiGenerationClubMembersPort {
    override fun loadActiveMembers(clubId: UUID): List<ActiveClubMember> =
        jdbcTemplate.query(
            """
            select memberships.id as membership_id,
                   coalesce(memberships.short_name, users.name) as display_name
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
            order by memberships.id
            """.trimIndent(),
            { resultSet, _ ->
                ActiveClubMember(
                    membershipId = UUID.fromString(resultSet.getString("membership_id")),
                    displayName = resultSet.getString("display_name"),
                )
            },
            clubId.dbString(),
        )
}
