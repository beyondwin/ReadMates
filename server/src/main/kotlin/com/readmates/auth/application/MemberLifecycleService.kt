package com.readmates.auth.application

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.domain.SessionParticipationStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
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

private data class LifecycleMembershipRow(
    val membershipId: UUID,
    val userId: UUID,
    val clubId: UUID,
    val email: String,
    val displayName: String,
    val shortName: String,
    val profileImageUrl: String?,
    val role: MembershipRole,
    val status: MembershipStatus,
)

@Service
class MemberLifecycleService(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) {
    fun listMembers(host: CurrentMember): List<HostMemberListItem> {
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
            { resultSet, _ -> resultSet.toHostMemberListItem(host.membershipId) },
            host.clubId.dbString(),
        )
    }

    @Transactional
    fun suspend(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val membership = ensureMutableMembership(jdbcTemplate, host, membershipId)
        if (membership.status != MembershipStatus.ACTIVE) {
            throw lifecycleConflict("Only active members can be suspended")
        }

        val updated = jdbcTemplate.update(
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
            host.clubId.dbString(),
        )
        if (updated != 1) {
            throw lifecycleConflict("Member could not be suspended")
        }

        val policyResult = applyCurrentSessionPolicy(jdbcTemplate, host.clubId, membershipId, request.currentSessionPolicy)
        return MemberLifecycleResponse(
            member = findHostMemberListItem(jdbcTemplate, host, membershipId),
            currentSessionPolicyResult = policyResult,
        )
    }

    @Transactional
    fun restore(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val membership = ensureMutableMembership(jdbcTemplate, host, membershipId)
        if (membership.status != MembershipStatus.SUSPENDED) {
            throw lifecycleConflict("Only suspended members can be restored")
        }

        val updated = jdbcTemplate.update(
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
            host.clubId.dbString(),
        )
        if (updated != 1) {
            throw lifecycleConflict("Member could not be restored")
        }

        return MemberLifecycleResponse(
            member = findHostMemberListItem(jdbcTemplate, host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
        )
    }

    @Transactional
    fun deactivate(host: CurrentMember, membershipId: UUID, request: MemberLifecycleRequest): MemberLifecycleResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val membership = ensureMutableMembership(jdbcTemplate, host, membershipId)
        if (membership.status !in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)) {
            throw lifecycleConflict("Only active or suspended members can leave")
        }

        val updated = jdbcTemplate.update(
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
            host.clubId.dbString(),
        )
        if (updated != 1) {
            throw lifecycleConflict("Member could not be deactivated")
        }

        val policyResult = applyCurrentSessionPolicy(jdbcTemplate, host.clubId, membershipId, request.currentSessionPolicy)
        return MemberLifecycleResponse(
            member = findHostMemberListItem(jdbcTemplate, host, membershipId),
            currentSessionPolicyResult = policyResult,
        )
    }

    @Transactional
    fun addToCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val membership = ensureMutableMembership(jdbcTemplate, host, membershipId)
        if (membership.status != MembershipStatus.ACTIVE) {
            throw lifecycleConflict("Only active members can be added to current session")
        }

        val openSessionId = findCurrentOpenSessionId(jdbcTemplate, host.clubId)
            ?: return MemberLifecycleResponse(
                member = findHostMemberListItem(jdbcTemplate, host, membershipId),
                currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
            )
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
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'ACTIVE')
            on duplicate key update
              participation_status = 'ACTIVE',
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            host.clubId.dbString(),
            openSessionId.dbString(),
            membershipId.dbString(),
        )

        return MemberLifecycleResponse(
            member = findHostMemberListItem(jdbcTemplate, host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.APPLIED,
        )
    }

    @Transactional
    fun removeFromCurrentSession(host: CurrentMember, membershipId: UUID): MemberLifecycleResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        ensureMutableMembership(jdbcTemplate, host, membershipId)
        val openSessionId = findCurrentOpenSessionId(jdbcTemplate, host.clubId)
            ?: return MemberLifecycleResponse(
                member = findHostMemberListItem(jdbcTemplate, host, membershipId),
                currentSessionPolicyResult = CurrentSessionPolicyResult.NOT_APPLICABLE,
            )
        markRemoved(jdbcTemplate, host.clubId, openSessionId, membershipId)

        return MemberLifecycleResponse(
            member = findHostMemberListItem(jdbcTemplate, host, membershipId),
            currentSessionPolicyResult = CurrentSessionPolicyResult.APPLIED,
        )
    }

    @Transactional
    fun leave(member: CurrentMember, request: MemberLifecycleRequest): MemberLifecycleResponse {
        val jdbcTemplate = jdbcTemplate()
        if (member.role == MembershipRole.HOST) {
            lockActiveHostRows(jdbcTemplate, member.clubId)
        }
        val membership = findMembershipInClubForUpdate(jdbcTemplate, member.clubId, member.membershipId)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required")
        if (membership.role == MembershipRole.HOST && activeHostCount(jdbcTemplate, member.clubId) <= 1) {
            throw lifecycleConflict("Last active host cannot leave")
        }
        if (membership.status !in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED)) {
            throw lifecycleConflict("Only active or suspended members can leave")
        }

        jdbcTemplate.update(
            """
            update memberships
            set status = 'LEFT',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and status in ('ACTIVE', 'SUSPENDED')
            """.trimIndent(),
            member.membershipId.dbString(),
            member.clubId.dbString(),
        )

        val policyResult = applyCurrentSessionPolicy(
            jdbcTemplate,
            member.clubId,
            member.membershipId,
            request.currentSessionPolicy,
        )
        return MemberLifecycleResponse(
            member = findHostMemberListItem(jdbcTemplate, member, member.membershipId),
            currentSessionPolicyResult = policyResult,
        )
    }

    private fun ensureMutableMembership(
        jdbcTemplate: JdbcTemplate,
        host: CurrentMember,
        membershipId: UUID,
    ): LifecycleMembershipRow {
        val membership = findMembershipInClubForUpdate(jdbcTemplate, host.clubId, membershipId)
            ?: throw lifecycleNotFound()
        if (membership.membershipId == host.membershipId) {
            throw lifecycleConflict("Hosts cannot mutate their own membership")
        }
        if (membership.role == MembershipRole.HOST) {
            if (membership.status == MembershipStatus.ACTIVE && activeHostCount(jdbcTemplate, host.clubId) <= 1) {
                throw lifecycleConflict("Last active host cannot be mutated")
            }
            throw lifecycleConflict("Host membership cannot be managed through member lifecycle")
        }
        return membership
    }

    private fun applyCurrentSessionPolicy(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        membershipId: UUID,
        policy: CurrentSessionPolicy,
    ): CurrentSessionPolicyResult {
        val openSessionId = findCurrentOpenSessionId(jdbcTemplate, clubId)
            ?: return CurrentSessionPolicyResult.NOT_APPLICABLE
        if (policy == CurrentSessionPolicy.NEXT_SESSION) {
            return CurrentSessionPolicyResult.DEFERRED
        }
        markRemoved(jdbcTemplate, clubId, openSessionId, membershipId)
        return CurrentSessionPolicyResult.APPLIED
    }

    private fun markRemoved(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        openSessionId: UUID,
        membershipId: UUID,
    ) {
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
            values (?, ?, ?, ?, 'NO_RESPONSE', 'UNKNOWN', 'REMOVED')
            on duplicate key update
              participation_status = 'REMOVED',
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            clubId.dbString(),
            openSessionId.dbString(),
            membershipId.dbString(),
        )
    }

    private fun findCurrentOpenSessionId(jdbcTemplate: JdbcTemplate, clubId: UUID): UUID? =
        jdbcTemplate.query(
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

    private fun findMembershipInClubForUpdate(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        membershipId: UUID,
    ): LifecycleMembershipRow? =
        jdbcTemplate.query(
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
            for update
            """.trimIndent(),
            { resultSet, _ -> resultSet.toLifecycleMembershipRow() },
            membershipId.dbString(),
            clubId.dbString(),
        ).firstOrNull()

    private fun lockActiveHostRows(jdbcTemplate: JdbcTemplate, clubId: UUID) {
        jdbcTemplate.query(
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

    private fun findHostMemberListItem(
        jdbcTemplate: JdbcTemplate,
        currentMember: CurrentMember,
        membershipId: UUID,
    ): HostMemberListItem =
        jdbcTemplate.query(
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
            { resultSet, _ -> resultSet.toHostMemberListItem(currentMember.membershipId) },
            membershipId.dbString(),
            currentMember.clubId.dbString(),
        ).firstOrNull() ?: throw lifecycleNotFound()

    private fun activeHostCount(jdbcTemplate: JdbcTemplate, clubId: UUID): Int =
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

    private fun ResultSet.toHostMemberListItem(currentMembershipId: UUID): HostMemberListItem {
        val status = MembershipStatus.valueOf(getString("status"))
        val role = MembershipRole.valueOf(getString("role"))
        val currentSessionId = getString("current_session_id")
        val participationStatus = getString("participation_status")
            ?.let { SessionParticipationStatus.valueOf(it) }
        val isSelf = uuid("membership_id") == currentMembershipId
        val isMutableMember = role == MembershipRole.MEMBER && !isSelf
        return HostMemberListItem(
            membershipId = uuid("membership_id").toString(),
            userId = uuid("user_id").toString(),
            email = getString("email"),
            displayName = getString("display_name"),
            shortName = getString("short_name"),
            profileImageUrl = getString("profile_image_url"),
            role = role,
            status = status,
            joinedAt = utcOffsetDateTimeOrNull("joined_at")?.toString(),
            createdAt = utcOffsetDateTime("created_at").toString(),
            currentSessionParticipationStatus = participationStatus,
            canSuspend = isMutableMember && status == MembershipStatus.ACTIVE,
            canRestore = isMutableMember && status == MembershipStatus.SUSPENDED,
            canDeactivate = isMutableMember &&
                status in setOf(MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED, MembershipStatus.VIEWER),
            canAddToCurrentSession = isMutableMember &&
                currentSessionId != null &&
                status == MembershipStatus.ACTIVE &&
                participationStatus != SessionParticipationStatus.ACTIVE,
            canRemoveFromCurrentSession = isMutableMember &&
                currentSessionId != null &&
                status == MembershipStatus.ACTIVE &&
                participationStatus == SessionParticipationStatus.ACTIVE,
        )
    }

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Host role required")
        }
    }

    private fun lifecycleNotFound(): ResponseStatusException =
        ResponseStatusException(HttpStatus.NOT_FOUND, "Member not found")

    private fun lifecycleConflict(message: String): ResponseStatusException =
        ResponseStatusException(HttpStatus.CONFLICT, message)

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw ResponseStatusException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Member lifecycle storage is unavailable",
            )
}
