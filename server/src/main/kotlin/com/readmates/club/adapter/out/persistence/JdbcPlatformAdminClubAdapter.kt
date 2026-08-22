package com.readmates.club.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.PLATFORM_ADMIN_CLUB_ADMIN_REVISION
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.port.out.CreatePlatformAdminClubCommand
import com.readmates.club.application.port.out.CreatePlatformAdminHostInvitationCommand
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminClubRegistryQuery
import com.readmates.club.application.port.out.PlatformAdminClubRegistryRow
import com.readmates.club.application.port.out.PlatformAdminExistingUser
import com.readmates.club.application.port.out.PlatformAdminOnboardingPort
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPatch
import com.readmates.club.application.port.out.UpdatePlatformAdminClubPort
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcPlatformAdminClubAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val avatarAllocation: MemberAvatarAllocationPort,
) : LoadPlatformAdminClubsPort,
    UpdatePlatformAdminClubPort,
    PlatformAdminOnboardingPort {
    override fun listClubs(query: PlatformAdminClubRegistryQuery): List<PlatformAdminClubRegistryRow> {
        val prepared = PlatformAdminClubRegistrySql.listSql(query)
        return jdbcTemplate.query(
            prepared.sql,
            ::mapPlatformAdminClubRow,
            *prepared.arguments.toTypedArray(),
        )
    }

    override fun loadClub(clubId: UUID): PlatformAdminClubListItem? =
        jdbcTemplate
            .query(PlatformAdminClubRegistrySql.detailSql(), ::mapPlatformAdminClub, clubId.dbString())
            .firstOrNull()

    override fun loadClubDetail(clubId: UUID): PlatformAdminClubDetail? {
        val item = loadClub(clubId) ?: return null
        val domains =
            jdbcTemplate.query(
                PlatformAdminClubRegistrySql.DOMAIN_LIST_SQL,
                ::mapClubDomain,
                clubId.dbString(),
            )
        return PlatformAdminClubDetail(
            clubId = item.clubId,
            slug = item.slug,
            name = item.name,
            tagline = item.tagline,
            about = item.about,
            adminRevision = PLATFORM_ADMIN_CLUB_ADMIN_REVISION,
            status = item.status,
            publicVisibility = item.publicVisibility,
            domains = domains,
            firstHostOnboardingState = item.firstHostOnboardingState,
            domainCount = item.domainCount,
            domainActionRequiredCount = item.domainActionRequiredCount,
            notificationFailureCount = item.notificationFailureCount,
            aiFailureCount = item.aiFailureCount,
        )
    }

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

    @Transactional
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

        val avatarKey = avatarAllocation.allocate(clubId, userId)
        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), ?, ?)
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
            userId.dbString(),
            displayName.take(HOST_DISPLAY_NAME_MAX_LENGTH),
            avatarKey.wireValue,
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
        private const val HOST_DISPLAY_NAME_MAX_LENGTH = 50
    }
}

private fun mapPlatformAdminClubRow(
    resultSet: ResultSet,
    rowNumber: Int,
): PlatformAdminClubRegistryRow =
    PlatformAdminClubRegistryRow(
        item = mapPlatformAdminClub(resultSet, rowNumber),
        normalizedName = resultSet.getString("normalized_name"),
    )

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
        notificationFailureCount = resultSet.getInt("notification_failure_count"),
        aiFailureCount = resultSet.getInt("ai_failure_count"),
        firstHostOnboardingState = FirstHostOnboardingState.valueOf(resultSet.getString("first_host_state")),
    )

private fun mapClubDomain(
    resultSet: ResultSet,
    @Suppress("UNUSED_PARAMETER") rowNumber: Int,
): PlatformAdminClubDomain =
    PlatformAdminClubDomain(
        id = resultSet.uuid("id"),
        clubId = resultSet.uuid("club_id"),
        hostname = resultSet.getString("hostname"),
        kind = ClubDomainKind.valueOf(resultSet.getString("kind")),
        status = ClubDomainStatus.valueOf(resultSet.getString("status")),
        isPrimary = resultSet.getBoolean("is_primary"),
        verifiedAt = resultSet.utcOffsetDateTimeOrNull("verified_at"),
        lastCheckedAt = resultSet.utcOffsetDateTimeOrNull("last_checked_at"),
        errorCode = resultSet.getString("provisioning_error_code"),
    )
