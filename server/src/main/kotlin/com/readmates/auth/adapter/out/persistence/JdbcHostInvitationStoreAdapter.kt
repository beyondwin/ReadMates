package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.port.out.CreateHostInvitationCommand
import com.readmates.auth.application.port.out.HostInvitationListRow
import com.readmates.auth.application.port.out.HostInvitationStorePort
import com.readmates.auth.application.port.out.InvitationTokenRow
import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.ObjectProvider
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.sql.Connection
import java.sql.ResultSet
import java.util.Locale
import java.util.UUID

@Repository
class JdbcHostInvitationStoreAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : HostInvitationStorePort {
    override fun acquireInvitationCreateLock(lockKey: String) {
        jdbcTemplate().execute(ConnectionCallback<Unit> { connection ->
            connection.prepareStatement("select get_lock(?, 5)").use { statement ->
                statement.setString(1, lockKey)
                statement.executeQuery().use { resultSet ->
                    resultSet.next()
                    if (resultSet.getInt(1) != 1) {
                        throw InvitationDomainException(
                            "INVITATION_LOCK_TIMEOUT",
                            HttpStatus.CONFLICT,
                            "Could not acquire invitation lock",
                        )
                    }
                }
            }
            TransactionSynchronizationManager.registerSynchronization(
                object : TransactionSynchronization {
                    override fun afterCompletion(status: Int) {
                        releaseInvitationLock(connection, lockKey)
                    }
                },
            )
        })
    }

    override fun activeMemberCountByEmail(clubId: UUID, email: String): Int =
        jdbcTemplate().queryForObject(
            """
            select count(*)
            from users
            join memberships on memberships.user_id = users.id
            where memberships.club_id = ?
              and lower(users.email) = ?
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
            email,
        ) ?: 0

    override fun revokeLivePendingInvitation(clubId: UUID, email: String) {
        jdbcTemplate().update(
            """
            update invitations
            set status = 'REVOKED',
                updated_at = utc_timestamp(6)
            where club_id = ?
              and lower(invited_email) = ?
              and status = 'PENDING'
              and expires_at >= utc_timestamp(6)
            """.trimIndent(),
            clubId.dbString(),
            email,
        )
    }

    override fun createInvitation(command: CreateHostInvitationCommand) {
        jdbcTemplate().update(
            """
            insert into invitations (
              id,
              club_id,
              invited_by_membership_id,
              invited_email,
              invited_name,
              role,
              token_hash,
              status,
              apply_to_current_session,
              expires_at
            )
            values (?, ?, ?, ?, ?, 'MEMBER', ?, 'PENDING', ?, ?)
            """.trimIndent(),
            command.invitationId.dbString(),
            command.clubId.dbString(),
            command.invitedByMembershipId.dbString(),
            command.email,
            command.name,
            command.tokenHash,
            command.applyToCurrentSession,
            command.expiresAt.toUtcLocalDateTime(),
        )
    }

    override fun listHostInvitations(clubId: UUID): List<HostInvitationListRow> =
        jdbcTemplate().query(
            """
            select
              invitations.id,
              clubs.slug as club_slug,
              invitations.invited_email,
              invitations.invited_name,
              invitations.role,
              invitations.status,
              invitations.expires_at,
              invitations.accepted_at,
              invitations.created_at,
              invitations.apply_to_current_session,
              primary_domains.hostname as primary_host,
              exists (
                select 1
                from users
                join memberships on memberships.user_id = users.id
                where memberships.club_id = invitations.club_id
                  and lower(users.email) = lower(invitations.invited_email)
                and memberships.status = 'ACTIVE'
              ) as has_active_membership
            from invitations
            join clubs on clubs.id = invitations.club_id
            left join (
              select club_id, min(hostname) as hostname
              from club_domains
              where status = 'ACTIVE'
                and is_primary = true
              group by club_id
            ) primary_domains on primary_domains.club_id = invitations.club_id
            where invitations.club_id = ?
            order by invitations.created_at desc
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostInvitationListRow() },
            clubId.dbString(),
        )

    override fun findHostInvitation(clubId: UUID, invitationId: UUID): HostInvitationListRow? =
        jdbcTemplate().query(
            """
            select
              invitations.id,
              clubs.slug as club_slug,
              invitations.invited_email,
              invitations.invited_name,
              invitations.role,
              invitations.status,
              invitations.expires_at,
              invitations.accepted_at,
              invitations.created_at,
              invitations.apply_to_current_session,
              primary_domains.hostname as primary_host,
              exists (
                select 1
                from users
                join memberships on memberships.user_id = users.id
                where memberships.club_id = invitations.club_id
                  and lower(users.email) = lower(invitations.invited_email)
                and memberships.status = 'ACTIVE'
              ) as has_active_membership
            from invitations
            join clubs on clubs.id = invitations.club_id
            left join (
              select club_id, min(hostname) as hostname
              from club_domains
              where status = 'ACTIVE'
                and is_primary = true
              group by club_id
            ) primary_domains on primary_domains.club_id = invitations.club_id
            where invitations.club_id = ?
              and invitations.id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostInvitationListRow() },
            clubId.dbString(),
            invitationId.dbString(),
        ).firstOrNull()

    override fun revokePendingInvitation(clubId: UUID, invitationId: UUID) {
        jdbcTemplate().update(
            """
            update invitations
            set status = 'REVOKED',
                updated_at = utc_timestamp(6)
            where id = ?
              and club_id = ?
              and status = 'PENDING'
              and expires_at >= utc_timestamp(6)
            """.trimIndent(),
            invitationId.dbString(),
            clubId.dbString(),
        )
    }

    override fun findInvitationByTokenHash(tokenHash: String, forUpdate: Boolean): InvitationTokenRow? {
        val lockClause = if (forUpdate) "for update" else ""
        return jdbcTemplate().query(
            """
            select
              invitations.id,
              invitations.club_id,
              clubs.slug as club_slug,
              clubs.name as club_name,
              invitations.invited_email,
              invitations.invited_name,
              invitations.role,
              invitations.status,
              invitations.expires_at,
              invitations.apply_to_current_session
            from invitations
            join clubs on clubs.id = invitations.club_id
            where invitations.token_hash = ?
            $lockClause
            """.trimIndent(),
            { resultSet, _ ->
                InvitationTokenRow(
                    id = resultSet.uuid("id"),
                    clubId = resultSet.uuid("club_id"),
                    clubSlug = resultSet.getString("club_slug"),
                    clubName = resultSet.getString("club_name"),
                    email = resultSet.getString("invited_email"),
                    name = resultSet.getString("invited_name"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = InvitationStatus.valueOf(resultSet.getString("status")),
                    expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                    applyToCurrentSession = resultSet.getBoolean("apply_to_current_session"),
                )
            },
            tokenHash,
        ).firstOrNull()
    }

    override fun upsertActiveMembership(clubId: UUID, userId: UUID, role: MembershipRole): UUID {
        val jdbcTemplate = jdbcTemplate()
        val existingMembershipId = jdbcTemplate.query(
            """
            select id
            from memberships
            where club_id = ?
              and user_id = ?
            limit 1
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            clubId.dbString(),
            userId.dbString(),
        ).firstOrNull()

        if (existingMembershipId != null) {
            jdbcTemplate.update(
                """
                update memberships
                set role = ?,
                    status = 'ACTIVE',
                    joined_at = coalesce(joined_at, utc_timestamp(6)),
                    updated_at = utc_timestamp(6)
                where id = ?
                """.trimIndent(),
                role.name,
                existingMembershipId.dbString(),
            )
            return existingMembershipId
        }

        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            select ?, ?, users.id, ?, 'ACTIVE', utc_timestamp(6), users.short_name
            from users
            where users.id = ?
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
            role.name,
            userId.dbString(),
        )
        return membershipId
    }

    override fun acceptInvitation(invitationId: UUID, acceptedUserId: UUID): Boolean =
        jdbcTemplate().update(
            """
            update invitations
            set status = 'ACCEPTED',
                accepted_at = utc_timestamp(6),
                accepted_user_id = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'PENDING'
              and expires_at >= utc_timestamp(6)
            """.trimIndent(),
            acceptedUserId.dbString(),
            invitationId.dbString(),
        ) == 1

    override fun addToCurrentOpenSessionIfSafe(clubId: UUID, membershipId: UUID) {
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
              and sessions.question_deadline_at > utc_timestamp(6)
              and sessions.session_date >= date(date_add(utc_timestamp(6), interval 9 hour))
            order by sessions.number desc
            limit 1
            on duplicate key update
              participation_status = 'ACTIVE',
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            membershipId.dbString(),
            clubId.dbString(),
        )
    }

    override fun findCurrentMember(membershipId: UUID): CurrentMember? =
        jdbcTemplate().query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              clubs.slug as club_slug,
              users.email,
              users.name as account_name,
              coalesce(memberships.short_name, users.name) as display_name,
              memberships.role,
              memberships.status as membership_status
            from memberships
            join users on users.id = memberships.user_id
            join clubs on clubs.id = memberships.club_id
            where memberships.id = ?
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ ->
                CurrentMember(
                    userId = resultSet.uuid("user_id"),
                    membershipId = resultSet.uuid("membership_id"),
                    clubId = resultSet.uuid("club_id"),
                    clubSlug = resultSet.getString("club_slug"),
                    email = resultSet.getString("email").lowercase(Locale.ROOT),
                    displayName = resultSet.getString("display_name"),
                    accountName = resultSet.getString("account_name"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    membershipStatus = MembershipStatus.valueOf(resultSet.getString("membership_status")),
                )
            },
            membershipId.dbString(),
        ).firstOrNull()

    private fun ResultSet.toHostInvitationListRow(): HostInvitationListRow =
        HostInvitationListRow(
            invitationId = uuid("id"),
            clubSlug = getString("club_slug"),
            email = getString("invited_email"),
            name = getString("invited_name"),
            role = MembershipRole.valueOf(getString("role")),
            status = InvitationStatus.valueOf(getString("status")),
            expiresAt = utcOffsetDateTime("expires_at"),
            acceptedAt = utcOffsetDateTimeOrNull("accepted_at"),
            createdAt = utcOffsetDateTime("created_at"),
            applyToCurrentSession = getBoolean("apply_to_current_session"),
            hasActiveMembership = getBoolean("has_active_membership"),
            primaryHost = getString("primary_host"),
        )

    private fun releaseInvitationLock(connection: Connection, lockKey: String) {
        try {
            connection.prepareStatement("select release_lock(?)").use { statement ->
                statement.setString(1, lockKey)
                statement.executeQuery().use { resultSet ->
                    if (!resultSet.next()) {
                        logger.warn("MySQL invitation lock release returned no result for {}", lockKey)
                        return
                    }
                    val releaseResult = resultSet.getObject(1)
                    if ((releaseResult as? Number)?.toInt() != 1) {
                        logger.warn("MySQL invitation lock release for {} returned {}", lockKey, releaseResult)
                    }
                }
            }
        } catch (error: Exception) {
            logger.warn("Failed to release MySQL invitation lock {}", lockKey, error)
        }
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw InvitationDomainException(
                "INVITATION_STORAGE_UNAVAILABLE",
                HttpStatus.SERVICE_UNAVAILABLE,
                "Invitation storage is unavailable",
            )

    private companion object {
        private val logger = LoggerFactory.getLogger(JdbcHostInvitationStoreAdapter::class.java)
    }
}
