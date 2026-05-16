package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.port.out.CreatePlatformAdminClubCommand
import com.readmates.club.application.port.out.CreatePlatformAdminHostInvitationCommand
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminExistingUser
import com.readmates.club.application.port.out.PlatformAdminOnboardingPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
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
    UpdatePlatformAdminClubPort,
    PlatformAdminOnboardingPort {
    override fun listClubs(limit: Int): List<PlatformAdminClubListItem> =
        jdbcTemplate.query(CLUB_LIST_SQL, ::mapPlatformAdminClub, limit.coerceIn(1, MAX_CLUB_LIST_LIMIT))
            ?: emptyList()

    override fun loadClub(clubId: UUID): PlatformAdminClubListItem? =
        jdbcTemplate
            .query("$CLUB_BASE_SQL where clubs.id = ? limit 1", ::mapPlatformAdminClub, clubId.dbString())
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
        patch: UpdatePlatformAdminClubPatch,
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
                patch.name,
                patch.tagline,
                patch.about,
                patch.status?.name,
                patch.publicVisibility?.name,
                clubId.dbString(),
            )
        return if (updated == 0) null else loadClub(clubId)
    }

    override fun slugExists(slug: String): Boolean =
        (jdbcTemplate.queryForObject("select count(*) from clubs where slug = ?", Int::class.java, slug) ?: 0) > 0

    override fun domainHostnameExists(hostname: String): Boolean =
        (
            jdbcTemplate.queryForObject(
                "select count(*) from club_domains where lower(hostname) = ?",
                Int::class.java,
                hostname,
            ) ?: 0
        ) > 0

    override fun findUserByEmail(email: String): PlatformAdminExistingUser? =
        jdbcTemplate
            .query(
                """
                select id, email, name
                from users
                where lower(email) = ?
                limit 1
                """.trimIndent(),
                { resultSet, _ ->
                    PlatformAdminExistingUser(
                        userId = resultSet.uuid("id"),
                        email = resultSet.getString("email"),
                        name = resultSet.getString("name"),
                    )
                },
                email,
            ).firstOrNull()

    override fun createClub(command: CreatePlatformAdminClubCommand): UUID {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, ?, ?, ?, 'SETUP_REQUIRED', 'PRIVATE')
            """.trimIndent(),
            command.clubId.dbString(),
            command.slug,
            command.name,
            command.tagline,
            command.about,
        )
        return command.clubId
    }

    override fun upsertHostMembership(
        clubId: UUID,
        userId: UUID,
        displayName: String,
    ): UUID {
        val existing =
            jdbcTemplate
                .query(
                    "select id from memberships where club_id = ? and user_id = ? limit 1",
                    { resultSet, _ -> resultSet.uuid("id") },
                    clubId.dbString(),
                    userId.dbString(),
                ).firstOrNull()
        if (existing != null) {
            jdbcTemplate.update(
                """
                update memberships
                set role = 'HOST',
                    status = 'ACTIVE',
                    joined_at = coalesce(joined_at, utc_timestamp(6)),
                    short_name = ?,
                    updated_at = utc_timestamp(6)
                where id = ?
                """.trimIndent(),
                displayName.take(HOST_DISPLAY_NAME_MAX_LENGTH),
                existing.dbString(),
            )
            return existing
        }

        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), ?)
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
            userId.dbString(),
            displayName.take(HOST_DISPLAY_NAME_MAX_LENGTH),
        )
        return membershipId
    }

    override fun createHostInvitation(command: CreatePlatformAdminHostInvitationCommand) {
        jdbcTemplate.update(
            """
            insert into invitations (
              id,
              club_id,
              invited_by_membership_id,
              invited_by_platform_admin_user_id,
              invited_email,
              invited_name,
              role,
              token_hash,
              status,
              apply_to_current_session,
              expires_at
            )
            values (?, ?, null, ?, ?, ?, 'HOST', ?, 'PENDING', false, ?)
            """.trimIndent(),
            command.invitationId.dbString(),
            command.clubId.dbString(),
            command.invitedByPlatformAdminUserId.dbString(),
            command.email,
            command.name,
            command.tokenHash,
            command.expiresAt.toUtcLocalDateTime(),
        )
    }

    private companion object {
        private const val MAX_CLUB_LIST_LIMIT = 100
        private const val HOST_DISPLAY_NAME_MAX_LENGTH = 50

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

private fun mapPlatformAdminClub(
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
