package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.HostMemberListRow
import com.readmates.auth.application.port.out.LifecycleMembershipRow
import com.readmates.auth.application.port.out.MemberLifecycleStorePort
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
import java.util.UUID

@Repository
class JdbcMemberLifecycleStoreAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberLifecycleStorePort {
    override fun listMembers(clubId: UUID): List<HostMemberListRow> =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as display_name,
              memberships.short_name,
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
            where memberships.club_id = ?
            order by
              case memberships.role when 'HOST' then 0 else 1 end,
              case memberships.status
                when 'ACTIVE' then 0
                when 'VIEWER' then 1
                when 'SUSPENDED' then 2
                when 'LEFT' then 3
                when 'INACTIVE' then 4
                else 5
              end,
              users.name,
              users.email
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostMemberListRow() },
            clubId.dbString(),
        )

    override fun suspendActiveMember(clubId: UUID, membershipId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update memberships
            set status = 'SUSPENDED',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and role = 'MEMBER'
              and status = 'ACTIVE'
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun restoreSuspendedMember(clubId: UUID, membershipId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update memberships
            set status = 'ACTIVE',
                joined_at = coalesce(joined_at, utc_timestamp(6)),
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and role = 'MEMBER'
              and status = 'SUSPENDED'
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun markMemberLeftByHost(clubId: UUID, membershipId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update memberships
            set status = 'LEFT',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and role = 'MEMBER'
              and status in ('ACTIVE', 'SUSPENDED')
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun markMembershipLeft(clubId: UUID, membershipId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update memberships
            set status = 'LEFT',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and status in ('ACTIVE', 'SUSPENDED')
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun findCurrentOpenSessionId(clubId: UUID): UUID? =
        jdbcTemplate().query(
            """
            select id
            from sessions
            where club_id = ?
              and state = 'OPEN'
            order by number desc
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
        ).firstOrNull()

    override fun addToCurrentSession(clubId: UUID, sessionId: UUID, membershipId: UUID) {
        jdbcTemplate().update(
            """
            insert into session_participants (
              id,
              club_id,
              session_id,
              membership_id,
              rsvp_status,
              attendance_status,
              participation_status
            )
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
            on duplicate key update
              participation_status = 'ACTIVE',
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            membershipId.dbString(),
        )
    }

    override fun markRemovedFromCurrentSession(clubId: UUID, sessionId: UUID, membershipId: UUID) {
        jdbcTemplate().update(
            """
            insert into session_participants (
              id,
              club_id,
              session_id,
              membership_id,
              rsvp_status,
              attendance_status,
              participation_status
            )
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'REMOVED')
            on duplicate key update
              participation_status = 'REMOVED',
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            membershipId.dbString(),
        )
    }

    override fun findMembershipInClubForUpdate(clubId: UUID, membershipId: UUID): LifecycleMembershipRow? =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              memberships.club_id,
              users.email,
              users.name as display_name,
              memberships.short_name,
              users.profile_image_url,
              memberships.role,
              memberships.status
            from memberships
            join users on users.id = memberships.user_id
            where memberships.id = ?
              and memberships.club_id = ?
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.toLifecycleMembershipRow() },
            membershipId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    override fun lockActiveHostRows(clubId: UUID) {
        jdbcTemplate().query(
            """
            select id
            from memberships
            where club_id = ?
              and role = 'HOST'
              and status = 'ACTIVE'
            order by id
            for update
            """.trimIndent(),
            { _, _ -> Unit },
            clubId.dbString(),
        )
    }

    override fun activeHostCount(clubId: UUID): Int =
        jdbcTemplate().queryForObject(
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

    override fun findHostMemberListItem(clubId: UUID, membershipId: UUID): HostMemberListRow? =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as display_name,
              memberships.short_name,
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

    private fun ResultSet.toLifecycleMembershipRow(): LifecycleMembershipRow =
        LifecycleMembershipRow(
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
                "Member lifecycle storage is unavailable",
            )
}
