package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.auth.application.port.`in`.ManageHostInvitationsUseCase
import com.readmates.auth.application.port.`in`.PreviewInvitationUseCase
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.ConnectionCallback
import org.springframework.jdbc.core.JdbcTemplate
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.bind.annotation.ResponseStatus
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.HexFormat
import java.util.Locale
import java.util.UUID

data class HostInvitationResponse(
    val invitationId: String,
    val email: String,
    val name: String,
    val role: MembershipRole,
    val status: InvitationStatus,
    val effectiveStatus: InvitationStatus,
    val expiresAt: String,
    val acceptedAt: String?,
    val createdAt: String,
    val applyToCurrentSession: Boolean,
    val canRevoke: Boolean,
    val canReissue: Boolean,
    val acceptUrl: String? = null,
)

data class InvitationPreviewResponse(
    val clubName: String,
    val email: String,
    val name: String,
    val emailHint: String,
    val status: InvitationStatus,
    val expiresAt: String,
    val canAccept: Boolean,
)

private data class InvitationRow(
    val id: UUID,
    val clubId: UUID,
    val clubName: String,
    val email: String,
    val name: String,
    val role: MembershipRole,
    val status: InvitationStatus,
    val expiresAt: OffsetDateTime,
    val applyToCurrentSession: Boolean,
)

@ResponseStatus(HttpStatus.CONFLICT)
class InvitationDomainException(
    val code: String,
    val status: HttpStatus,
    message: String,
) : RuntimeException(message)

@Service
class InvitationService(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
    private val tokenService: InvitationTokenService,
    private val memberAccountStore: MemberAccountStorePort,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) : ManageHostInvitationsUseCase, PreviewInvitationUseCase {
    @Transactional
    override fun createInvitation(
        host: CurrentMember,
        email: String,
        name: String,
        applyToCurrentSession: Boolean,
    ): HostInvitationResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        val normalizedEmail = normalizeEmail(email)
        val normalizedName = normalizeInvitedName(name)
        acquireInvitationCreateLock(jdbcTemplate, host.clubId, normalizedEmail)
        rejectActiveMember(jdbcTemplate, host.clubId, normalizedEmail)
        revokeLivePendingInvitation(jdbcTemplate, host.clubId, normalizedEmail)

        val token = tokenService.generateToken()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plusDays(30)
        val invitationId = UUID.randomUUID()

        jdbcTemplate.update(
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
            invitationId.dbString(),
            host.clubId.dbString(),
            host.membershipId.dbString(),
            normalizedEmail,
            normalizedName,
            tokenService.hashToken(token),
            applyToCurrentSession,
            expiresAt.toUtcLocalDateTime(),
        )

        return findHostInvitation(jdbcTemplate, host.clubId, invitationId).copy(acceptUrl = acceptUrl(token))
    }

    override fun listHostInvitations(host: CurrentMember): List<HostInvitationResponse> {
        requireHost(host)
        return listHostInvitations(jdbcTemplate(), host.clubId)
    }

    override fun previewInvitation(rawToken: String): InvitationPreviewResponse {
        val invitation = findInvitationByToken(rawToken)
        val effectiveStatus = effectiveStatus(invitation.status, invitation.expiresAt)
        return InvitationPreviewResponse(
            clubName = invitation.clubName,
            email = invitation.email,
            name = invitation.name,
            emailHint = maskEmail(invitation.email),
            status = effectiveStatus,
            expiresAt = invitation.expiresAt.toString(),
            canAccept = effectiveStatus == InvitationStatus.PENDING,
        )
    }

    @Transactional
    fun acceptGoogleInvitation(
        rawToken: String,
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember {
        val jdbcTemplate = jdbcTemplate()
        val invitation = queryInvitationByToken(rawToken, forUpdate = true)
        val effectiveStatus = effectiveStatus(invitation.status, invitation.expiresAt)
        if (effectiveStatus != InvitationStatus.PENDING) {
            throw InvitationDomainException(
                "INVITATION_${effectiveStatus.name}",
                HttpStatus.CONFLICT,
                "Invitation is not pending",
            )
        }

        val normalizedEmail = normalizeEmail(email)
        if (!invitation.email.equals(normalizedEmail, ignoreCase = true)) {
            throw InvitationDomainException(
                "INVITATION_EMAIL_MISMATCH",
                HttpStatus.FORBIDDEN,
                "Invitation email does not match authenticated Google email",
            )
        }

        val normalizedSubject = googleSubjectId.trim().takeIf { it.isNotEmpty() }
            ?: throw GoogleLoginException("Google subject is required")
        val userId = connectOrCreateInvitedGoogleUser(
            googleSubjectId = normalizedSubject,
            normalizedEmail = normalizedEmail,
            displayName = displayName ?: invitation.name,
            profileImageUrl = profileImageUrl,
        )
        val membershipId = upsertActiveMembership(jdbcTemplate, invitation.clubId, userId, invitation.role)

        val accepted = jdbcTemplate.update(
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
            userId.dbString(),
            invitation.id.dbString(),
        )
        if (accepted != 1) {
            throw InvitationDomainException(
                "INVITATION_NOT_PENDING",
                HttpStatus.CONFLICT,
                "Invitation is not pending",
            )
        }

        if (invitation.applyToCurrentSession) {
            addToCurrentOpenSessionIfSafe(jdbcTemplate, invitation.clubId, membershipId)
        }
        memberAccountStore.recordLastLogin(userId)
        return findCurrentMember(jdbcTemplate, membershipId)
    }

    private fun listHostInvitations(jdbcTemplate: JdbcTemplate, clubId: UUID): List<HostInvitationResponse> {
        return jdbcTemplate.query(
            """
            select
              invitations.id,
              invitations.invited_email,
              invitations.invited_name,
              invitations.role,
              invitations.status,
              invitations.expires_at,
              invitations.accepted_at,
              invitations.created_at,
              invitations.apply_to_current_session,
              exists (
                select 1
                from users
                join memberships on memberships.user_id = users.id
                where memberships.club_id = invitations.club_id
                  and lower(users.email) = lower(invitations.invited_email)
                  and memberships.status = 'ACTIVE'
              ) as has_active_membership
            from invitations
            where invitations.club_id = ?
            order by invitations.created_at desc
            """.trimIndent(),
            { resultSet, _ ->
                val status = InvitationStatus.valueOf(resultSet.getString("status"))
                val expiresAt = resultSet.utcOffsetDateTime("expires_at")
                val effectiveStatus = effectiveStatus(status, expiresAt)
                HostInvitationResponse(
                    invitationId = resultSet.uuid("id").toString(),
                    email = resultSet.getString("invited_email"),
                    name = resultSet.getString("invited_name"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = status,
                    effectiveStatus = effectiveStatus,
                    expiresAt = expiresAt.toString(),
                    acceptedAt = resultSet.utcOffsetDateTimeOrNull("accepted_at")?.toString(),
                    createdAt = resultSet.utcOffsetDateTime("created_at").toString(),
                    applyToCurrentSession = resultSet.getBoolean("apply_to_current_session"),
                    canRevoke = canRevoke(status, expiresAt),
                    canReissue = canReissue(effectiveStatus, resultSet.getBoolean("has_active_membership")),
                )
            },
            clubId.dbString(),
        )
    }

    @Transactional
    override fun revokeInvitation(host: CurrentMember, invitationId: UUID): HostInvitationResponse {
        requireHost(host)
        val jdbcTemplate = jdbcTemplate()
        jdbcTemplate.update(
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
            host.clubId.dbString(),
        )
        return findHostInvitation(jdbcTemplate, host.clubId, invitationId)
    }

    private fun findHostInvitation(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        invitationId: UUID,
    ): HostInvitationResponse =
        listHostInvitationsForId(jdbcTemplate, clubId, invitationId).firstOrNull()
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found")

    private fun listHostInvitationsForId(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        invitationId: UUID,
    ): List<HostInvitationResponse> =
        jdbcTemplate.query(
            """
            select
              invitations.id,
              invitations.invited_email,
              invitations.invited_name,
              invitations.role,
              invitations.status,
              invitations.expires_at,
              invitations.accepted_at,
              invitations.created_at,
              invitations.apply_to_current_session,
              exists (
                select 1
                from users
                join memberships on memberships.user_id = users.id
                where memberships.club_id = invitations.club_id
                  and lower(users.email) = lower(invitations.invited_email)
                  and memberships.status = 'ACTIVE'
              ) as has_active_membership
            from invitations
            where invitations.club_id = ?
              and invitations.id = ?
            """.trimIndent(),
            { resultSet, _ ->
                val status = InvitationStatus.valueOf(resultSet.getString("status"))
                val expiresAt = resultSet.utcOffsetDateTime("expires_at")
                val effectiveStatus = effectiveStatus(status, expiresAt)
                HostInvitationResponse(
                    invitationId = resultSet.uuid("id").toString(),
                    email = resultSet.getString("invited_email"),
                    name = resultSet.getString("invited_name"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = status,
                    effectiveStatus = effectiveStatus,
                    expiresAt = expiresAt.toString(),
                    acceptedAt = resultSet.utcOffsetDateTimeOrNull("accepted_at")?.toString(),
                    createdAt = resultSet.utcOffsetDateTime("created_at").toString(),
                    applyToCurrentSession = resultSet.getBoolean("apply_to_current_session"),
                    canRevoke = canRevoke(status, expiresAt),
                    canReissue = canReissue(effectiveStatus, resultSet.getBoolean("has_active_membership")),
                )
            },
            clubId.dbString(),
            invitationId.dbString(),
        )

    private fun findInvitationByToken(rawToken: String): InvitationRow =
        queryInvitationByToken(rawToken, forUpdate = false)

    private fun queryInvitationByToken(rawToken: String, forUpdate: Boolean): InvitationRow {
        val lockClause = if (forUpdate) "for update" else ""
        return jdbcTemplate().query(
            """
            select
              invitations.id,
              invitations.club_id,
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
                InvitationRow(
                    id = resultSet.uuid("id"),
                    clubId = resultSet.uuid("club_id"),
                    clubName = resultSet.getString("club_name"),
                    email = resultSet.getString("invited_email"),
                    name = resultSet.getString("invited_name"),
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    status = InvitationStatus.valueOf(resultSet.getString("status")),
                    expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                    applyToCurrentSession = resultSet.getBoolean("apply_to_current_session"),
                )
            },
            tokenService.hashToken(rawToken),
        ).firstOrNull()
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found")
    }

    private fun connectOrCreateInvitedGoogleUser(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ): UUID {
        val ownerEmail = memberAccountStore.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }

        val existingUserId = memberAccountStore.findAnyUserIdByEmail(normalizedEmail)
        if (existingUserId != null) {
            val connected = memberAccountStore.connectGoogleSubject(
                userId = existingUserId,
                googleSubjectId = googleSubjectId,
                profileImageUrl = profileImageUrl,
            )
            if (!connected) {
                throw GoogleLoginException("Existing user is connected to a different Google account")
            }
            return existingUserId
        }

        return try {
            memberAccountStore.createGoogleUser(
                googleSubjectId = googleSubjectId,
                email = normalizedEmail,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
            )
        } catch (exception: DuplicateKeyException) {
            val racedUserId = memberAccountStore.findAnyUserIdByEmail(normalizedEmail)
                ?: throw GoogleLoginException("Google account is already connected")
            val connected = memberAccountStore.connectGoogleSubject(
                userId = racedUserId,
                googleSubjectId = googleSubjectId,
                profileImageUrl = profileImageUrl,
            )
            if (!connected) {
                throw GoogleLoginException("Existing user is connected to a different Google account")
            }
            racedUserId
        }
    }

    private fun upsertActiveMembership(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        userId: UUID,
        role: MembershipRole,
    ): UUID {
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
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, ?, ?, ?, 'ACTIVE', utc_timestamp(6))
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
            userId.dbString(),
            role.name,
        )
        return membershipId
    }

    private fun addToCurrentOpenSessionIfSafe(jdbcTemplate: JdbcTemplate, clubId: UUID, membershipId: UUID) {
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

    private fun findCurrentMember(jdbcTemplate: JdbcTemplate, membershipId: UUID): CurrentMember =
        jdbcTemplate.query(
            """
            select
              users.id as user_id,
              memberships.id as membership_id,
              clubs.id as club_id,
              users.email,
              users.name as display_name,
              users.short_name,
              memberships.role,
              memberships.status as membership_status
            from memberships
            join users on users.id = memberships.user_id
            join clubs on clubs.id = memberships.club_id
            where memberships.id = ?
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ ->
                val displayName = resultSet.getString("display_name")
                CurrentMember(
                    userId = resultSet.uuid("user_id"),
                    membershipId = resultSet.uuid("membership_id"),
                    clubId = resultSet.uuid("club_id"),
                    email = resultSet.getString("email").lowercase(Locale.ROOT),
                    displayName = displayName,
                    shortName = resultSet.getString("short_name") ?: displayName,
                    role = MembershipRole.valueOf(resultSet.getString("role")),
                    membershipStatus = MembershipStatus.valueOf(resultSet.getString("membership_status")),
                )
            },
            membershipId.dbString(),
        ).firstOrNull()
            ?: throw InvitationDomainException("MEMBERSHIP_NOT_FOUND", HttpStatus.CONFLICT, "Accepted membership not found")

    private fun rejectActiveMember(jdbcTemplate: JdbcTemplate, clubId: UUID, email: String) {
        val count = jdbcTemplate.queryForObject(
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
        if (count > 0) {
            throw InvitationDomainException("MEMBER_ALREADY_ACTIVE", HttpStatus.CONFLICT, "Member is already active")
        }
    }

    private fun revokeLivePendingInvitation(jdbcTemplate: JdbcTemplate, clubId: UUID, email: String) {
        jdbcTemplate.update(
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

    private fun acquireInvitationCreateLock(jdbcTemplate: JdbcTemplate, clubId: UUID, email: String) {
        val lockKey = invitationLockKey(clubId, email)
        jdbcTemplate.execute(ConnectionCallback<Unit> { connection ->
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

    private fun normalizeEmail(email: String): String =
        email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
            ?: throw InvitationDomainException("INVALID_INVITATION_EMAIL", HttpStatus.BAD_REQUEST, "Email is required")

    private fun normalizeInvitedName(name: String): String =
        name.trim().takeIf { it.isNotEmpty() }?.take(120)
            ?: throw InvitationDomainException("INVALID_INVITATION_NAME", HttpStatus.BAD_REQUEST, "Name is required")

    private fun invitationLockKey(clubId: UUID, email: String): String =
        "invitation:${sha256Short("${clubId.dbString()}:${normalizeEmail(email)}")}"

    private fun releaseInvitationLock(connection: java.sql.Connection, lockKey: String) {
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

    private fun effectiveStatus(status: InvitationStatus, expiresAt: OffsetDateTime): InvitationStatus =
        if (status == InvitationStatus.PENDING && expiresAt.isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            InvitationStatus.EXPIRED
        } else {
            status
        }

    private fun canRevoke(status: InvitationStatus, expiresAt: OffsetDateTime): Boolean =
        status == InvitationStatus.PENDING && !expiresAt.isBefore(OffsetDateTime.now(ZoneOffset.UTC))

    private fun canReissue(effectiveStatus: InvitationStatus, hasActiveMembership: Boolean): Boolean =
        effectiveStatus != InvitationStatus.ACCEPTED && !hasActiveMembership

    private fun maskEmail(email: String): String {
        val normalized = email.trim().lowercase(Locale.ROOT)
        val local = normalized.substringBefore("@")
        val domain = normalized.substringAfter("@", "")
        val prefix = local.take(2).padEnd(2, '*')
        return "$prefix****@$domain"
    }

    private fun requireHost(member: CurrentMember) {
        if (!member.isHost) {
            throw InvitationDomainException("HOST_REQUIRED", HttpStatus.FORBIDDEN, "Host role required")
        }
    }

    private fun acceptUrl(token: String): String {
        return "${appBaseUrl.trimEnd('/')}/invite/$token"
    }

    private fun sha256Short(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest).take(16)
    }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw InvitationDomainException(
                "INVITATION_STORAGE_UNAVAILABLE",
                HttpStatus.SERVICE_UNAVAILABLE,
                "Invitation storage is unavailable",
            )

    private companion object {
        private val logger = LoggerFactory.getLogger(InvitationService::class.java)
    }
}
