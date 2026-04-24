package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberApprovalStorePort
import com.readmates.auth.application.port.out.ViewerMemberRow
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.util.UUID

@Repository
class JdbcMemberApprovalStoreAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : MemberApprovalStorePort {
    override fun listPendingViewers(clubId: UUID): List<ViewerMemberRow> =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
              users.profile_image_url,
              memberships.status,
              memberships.created_at
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = ?
              and memberships.role = 'MEMBER'
              and memberships.status = 'VIEWER'
            order by memberships.created_at desc, memberships.id desc
            """.trimIndent(),
            ::mapViewerMember,
            clubId.dbString(),
        )

    override fun activateViewer(clubId: UUID, membershipId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update memberships
            set status = 'ACTIVE',
                joined_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and role = 'MEMBER'
              and status = 'VIEWER'
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun deactivateViewer(clubId: UUID, membershipId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update memberships
            set status = 'INACTIVE',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and role = 'MEMBER'
              and status = 'VIEWER'
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
        ) == 1

    override fun addToCurrentOpenSession(clubId: UUID, membershipId: UUID) {
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
            select ?, sessions.club_id, sessions.id, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE'
            from sessions
            where sessions.club_id = ?
              and sessions.state = 'OPEN'
            order by sessions.number desc
            limit 1
            on duplicate key update
              rsvp_status = session_participants.rsvp_status,
              attendance_status = session_participants.attendance_status,
              participation_status = 'ACTIVE',
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            membershipId.dbString(),
            clubId.dbString(),
        )
    }

    override fun findMemberForHost(clubId: UUID, membershipId: UUID): ViewerMemberRow? =
        jdbcTemplate().query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
              users.profile_image_url,
              memberships.status,
              memberships.created_at
            from memberships
            join users on users.id = memberships.user_id
            where memberships.id = ?
              and memberships.club_id = ?
              and memberships.role = 'MEMBER'
            """.trimIndent(),
            ::mapViewerMember,
            membershipId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    private fun mapViewerMember(resultSet: ResultSet, @Suppress("UNUSED_PARAMETER") rowNumber: Int) =
        ViewerMemberRow(
            membershipId = resultSet.uuid("membership_id"),
            userId = resultSet.uuid("user_id"),
            email = resultSet.getString("email"),
            displayName = resultSet.getString("display_name"),
            accountName = resultSet.getString("account_name"),
            profileImageUrl = resultSet.getString("profile_image_url"),
            status = MembershipStatus.valueOf(resultSet.getString("status")),
            createdAt = resultSet.utcOffsetDateTime("created_at"),
        )

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Member approval storage is unavailable",
            )
}
