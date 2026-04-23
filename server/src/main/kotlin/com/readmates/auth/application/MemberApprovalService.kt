package com.readmates.auth.application

import com.readmates.auth.domain.MembershipStatus
import com.readmates.auth.application.port.`in`.ManageMemberApprovalsUseCase
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.server.ResponseStatusException
import java.sql.ResultSet
import java.util.UUID

data class ViewerMemberResponse(
    val membershipId: String,
    val userId: String,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val status: MembershipStatus,
    val createdAt: String,
)

@Service
class MemberApprovalService(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : ManageMemberApprovalsUseCase {
    override fun listViewers(host: CurrentMember): List<ViewerMemberResponse> {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        return jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as display_name,
              users.short_name,
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
            host.clubId.dbString(),
        )
    }

    @Transactional
    override fun activateViewer(host: CurrentMember, membershipId: UUID): ViewerMemberResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val updated = jdbcTemplate.update(
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
            host.clubId.dbString(),
        )
        if (updated != 1) {
            throw viewerMemberNotFound()
        }

        addToCurrentOpenSession(jdbcTemplate, host.clubId, membershipId)
        return findForHost(jdbcTemplate, host.clubId, membershipId)
    }

    @Transactional
    override fun deactivateViewer(host: CurrentMember, membershipId: UUID): ViewerMemberResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val updated = jdbcTemplate.update(
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
            host.clubId.dbString(),
        )
        if (updated != 1) {
            throw viewerMemberNotFound()
        }

        return findForHost(jdbcTemplate, host.clubId, membershipId)
    }

    private fun addToCurrentOpenSession(jdbcTemplate: JdbcTemplate, clubId: UUID, membershipId: UUID) {
        jdbcTemplate.update(
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

    private fun findForHost(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        membershipId: UUID,
    ): ViewerMemberResponse =
        jdbcTemplate.query(
            """
            select
              memberships.id as membership_id,
              users.id as user_id,
              users.email,
              users.name as display_name,
              users.short_name,
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
        ).firstOrNull() ?: throw viewerMemberNotFound()

    private fun mapViewerMember(resultSet: ResultSet, @Suppress("UNUSED_PARAMETER") rowNumber: Int) =
        ViewerMemberResponse(
            membershipId = resultSet.uuid("membership_id").toString(),
            userId = resultSet.uuid("user_id").toString(),
            email = resultSet.getString("email"),
            displayName = resultSet.getString("display_name"),
            shortName = resultSet.getString("short_name"),
            profileImageUrl = resultSet.getString("profile_image_url"),
            status = MembershipStatus.valueOf(resultSet.getString("status")),
            createdAt = resultSet.utcOffsetDateTime("created_at").toString(),
        )

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Host role required")
        }
    }

    private fun viewerMemberNotFound(): ResponseStatusException =
        ResponseStatusException(HttpStatus.NOT_FOUND, "Viewer member not found")

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Member approval storage is unavailable",
            )
}
