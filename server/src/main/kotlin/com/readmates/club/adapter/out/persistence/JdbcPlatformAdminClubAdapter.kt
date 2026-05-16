package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcPlatformAdminClubAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : LoadPlatformAdminClubsPort,
    UpdatePlatformAdminClubPort {
    override fun listClubs(limit: Int): List<PlatformAdminClubListItem> =
        jdbcTemplate.query(CLUB_LIST_SQL, ::mapClub, limit.coerceIn(1, 100)) ?: emptyList()

    override fun loadClub(clubId: UUID): PlatformAdminClubListItem? =
        jdbcTemplate
            .query("$CLUB_BASE_SQL where clubs.id = ? limit 1", ::mapClub, clubId.dbString())
            .firstOrNull()

    override fun activeHostCount(clubId: UUID): Int =
        jdbcTemplate.queryForObject(
            """
            select count(*)
            from memberships
            where club_id = ?
              and role = 'HOST'
              and status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
        ) ?: 0

    @Transactional
    override fun updateClub(
        clubId: UUID,
        name: String?,
        tagline: String?,
        about: String?,
        status: ClubStatus?,
        publicVisibility: ClubPublicVisibility?,
    ): PlatformAdminClubListItem? {
        val updated =
            jdbcTemplate.update(
                """
                update clubs
                set name = coalesce(?, name),
                    tagline = coalesce(?, tagline),
                    about = coalesce(?, about),
                    status = coalesce(?, status),
                    public_visibility = coalesce(?, public_visibility),
                    updated_at = utc_timestamp(6)
                where id = ?
                """.trimIndent(),
                name,
                tagline,
                about,
                status?.name,
                publicVisibility?.name,
                clubId.dbString(),
            )
        return if (updated == 0) null else loadClub(clubId)
    }

    private fun mapClub(
        resultSet: ResultSet,
        @Suppress("UNUSED_PARAMETER") rowNumber: Int,
    ): PlatformAdminClubListItem =
        PlatformAdminClubListItem(
            clubId = resultSet.uuid("id"),
            slug = resultSet.getString("slug"),
            name = resultSet.getString("name"),
            tagline = resultSet.getString("tagline"),
            about = resultSet.getString("about"),
            status = ClubStatus.valueOf(resultSet.getString("status")),
            publicVisibility = ClubPublicVisibility.valueOf(resultSet.getString("public_visibility")),
            domainCount = resultSet.getInt("domain_count"),
            domainActionRequiredCount = resultSet.getInt("domain_action_required_count"),
            firstHostOnboardingState = FirstHostOnboardingState.valueOf(resultSet.getString("first_host_state")),
        )

    private companion object {
        private const val CLUB_BASE_SQL = """
            select
              clubs.id,
              clubs.slug,
              clubs.name,
              clubs.tagline,
              clubs.about,
              clubs.status,
              clubs.public_visibility,
              coalesce(domain_counts.domain_count, 0) as domain_count,
              coalesce(domain_counts.action_required_count, 0) as domain_action_required_count,
              case
                when exists (
                  select 1 from memberships
                  where memberships.club_id = clubs.id
                    and memberships.role = 'HOST'
                    and memberships.status = 'ACTIVE'
                ) then 'ASSIGNED'
                when exists (
                  select 1 from invitations
                  where invitations.club_id = clubs.id
                    and invitations.role = 'HOST'
                    and invitations.status = 'PENDING'
                    and invitations.expires_at >= utc_timestamp(6)
                ) then 'INVITED'
                else 'MISSING'
              end as first_host_state
            from clubs
            left join (
              select
                club_id,
                count(*) as domain_count,
                sum(case when status = 'ACTION_REQUIRED' then 1 else 0 end) as action_required_count
              from club_domains
              group by club_id
            ) domain_counts on domain_counts.club_id = clubs.id
        """

        private const val CLUB_LIST_SQL = """
            $CLUB_BASE_SQL
            order by clubs.updated_at desc, clubs.created_at desc
            limit ?
        """
    }
}
