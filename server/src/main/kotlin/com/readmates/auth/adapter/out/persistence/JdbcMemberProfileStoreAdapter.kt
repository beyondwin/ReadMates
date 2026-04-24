package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.util.Locale
import java.util.UUID

@Repository
class JdbcMemberProfileStoreAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberProfileStorePort {
    override fun findProfileMemberByEmail(email: String): MemberProfileRow? {
        val normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() } ?: return null
        return jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              memberships.club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              users.profile_image_url,
              memberships.role,
              memberships.status
            from users
            join memberships on memberships.user_id = users.id
            where lower(users.email) = ?
              and memberships.status in ('VIEWER', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMemberProfileRow() },
            normalizedEmail,
        ).firstOrNull()
    }

    override fun findProfileMemberByUserId(userId: UUID): MemberProfileRow? =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              memberships.club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              users.profile_image_url,
              memberships.role,
              memberships.status
            from users
            join memberships on memberships.user_id = users.id
            where users.id = ?
              and memberships.status in ('VIEWER', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE')
            order by memberships.joined_at is null, memberships.joined_at desc, memberships.created_at desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMemberProfileRow() },
            userId.dbString(),
        ).firstOrNull()

    override fun findProfileMemberInClubForUpdate(clubId: UUID, membershipId: UUID): MemberProfileRow? =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              memberships.club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              users.profile_image_url,
              memberships.role,
              memberships.status
            from memberships
            join users on users.id = memberships.user_id
            where memberships.id = ?
              and memberships.club_id = ?
              and memberships.status in ('VIEWER', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE')
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.toMemberProfileRow() },
            membershipId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    override fun shortNameExistsInClub(clubId: UUID, shortName: String, excludingMembershipId: UUID): Boolean =
        (jdbcTemplate().queryForObject(
            """
            select count(*)
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = ?
              and memberships.id <> ?
              and users.short_name = ?
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
            excludingMembershipId.dbString(),
            shortName,
        ) ?: 0) > 0

    override fun updateShortName(clubId: UUID, membershipId: UUID, shortName: String): Boolean =
        jdbcTemplate().update(
            """
            update users
            join memberships on memberships.user_id = users.id
            set users.short_name = ?,
                users.updated_at = utc_timestamp(6)
            where memberships.id = ?
              and memberships.club_id = ?
              and memberships.status in ('VIEWER', 'ACTIVE', 'SUSPENDED', 'LEFT', 'INACTIVE')
            """.trimIndent(),
            shortName,
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow? =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as display_name,
              users.short_name,
              users.profile_image_url,
              memberships.role,
              memberships.status,
              memberships.joined_at,
              memberships.created_at,
              current_session.id as current_session_id,
              session_participants.participation_status
            from memberships
            join users on users.id = memberships.user_id
            left join sessions current_session on current_session.club_id = memberships.club_id
              and current_session.state = 'OPEN'
              and current_session.id = (
                select sessions.id
                from sessions
                where sessions.club_id = memberships.club_id
                  and sessions.state = 'OPEN'
                order by sessions.number desc
                limit 1
              )
            left join session_participants on session_participants.session_id = current_session.id
              and session_participants.club_id = memberships.club_id
              and session_participants.membership_id = memberships.id
            where memberships.id = ?
              and memberships.club_id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostMemberListRow() },
            membershipId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    private fun ResultSet.toMemberProfileRow(): MemberProfileRow =
        MemberProfileRow(
            membershipId = uuid("membership_id"),
            userId = uuid("user_id"),
            clubId = uuid("club_id"),
            email = getString("email"),
            displayName = getString("display_name"),
            shortName = getString("short_name"),
            profileImageUrl = getString("profile_image_url"),
            role = MembershipRole.valueOf(getString("role")),
            status = MembershipStatus.valueOf(getString("status")),
        )

    private fun ResultSet.toHostMemberListRow(): HostMemberListRow {
        val currentSessionId = getString("current_session_id")?.let { uuid("current_session_id") }
        val participationStatus = getString("participation_status")
            ?.let { SessionParticipationStatus.valueOf(it) }
        return HostMemberListRow(
            membershipId = uuid("membership_id"),
            userId = uuid("user_id"),
            email = getString("email"),
            displayName = getString("display_name"),
            shortName = getString("short_name"),
            profileImageUrl = getString("profile_image_url"),
            role = MembershipRole.valueOf(getString("role")),
            status = MembershipStatus.valueOf(getString("status")),
            joinedAt = utcOffsetDateTimeOrNull("joined_at"),
            createdAt = utcOffsetDateTime("created_at"),
            currentSessionId = currentSessionId,
            participationStatus = participationStatus,
        )
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Member profile storage is unavailable",
            )
}
