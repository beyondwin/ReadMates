package com.readmates.auth.application

import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.application.port.`in`.ManageHostInvitationsUseCase
import com.readmates.auth.application.port.`in`.PreviewInvitationUseCase
import com.readmates.auth.application.port.out.CreateHostInvitationCommand
import com.readmates.auth.application.port.out.HostInvitationListRow
import com.readmates.auth.application.port.out.HostInvitationStorePort
import com.readmates.auth.application.port.out.InvitationTokenRow
import com.readmates.auth.application.port.out.MemberAccountDuplicateException
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
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

@ResponseStatus(HttpStatus.CONFLICT)
class InvitationDomainException(
    val code: String,
    val status: HttpStatus,
    message: String,
) : RuntimeException(message)

@Service
class InvitationService(
    private val invitationStore: HostInvitationStorePort,
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
        val normalizedEmail = normalizeEmail(email)
        val normalizedName = normalizeInvitedName(name)
        invitationStore.acquireInvitationCreateLock(invitationLockKey(host.clubId, normalizedEmail))
        rejectActiveMember(host.clubId, normalizedEmail)
        invitationStore.revokeLivePendingInvitation(host.clubId, normalizedEmail)

        val token = tokenService.generateToken()
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val expiresAt = now.plusDays(30)
        val invitationId = UUID.randomUUID()

        invitationStore.createInvitation(
            CreateHostInvitationCommand(
                invitationId = invitationId,
                clubId = host.clubId,
                invitedByMembershipId = host.membershipId,
                email = normalizedEmail,
                name = normalizedName,
                tokenHash = tokenService.hashToken(token),
                applyToCurrentSession = applyToCurrentSession,
                expiresAt = expiresAt,
            ),
        )

        return findHostInvitation(host.clubId, invitationId).copy(acceptUrl = acceptUrl(token))
    }

    override fun listHostInvitations(host: CurrentMember): List<HostInvitationResponse> {
        requireHost(host)
        return invitationStore.listHostInvitations(host.clubId).map(::toHostInvitationResponse)
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
        val membershipId = invitationStore.upsertActiveMembership(invitation.clubId, userId, invitation.role)

        if (!invitationStore.acceptInvitation(invitation.id, userId)) {
            throw InvitationDomainException(
                "INVITATION_NOT_PENDING",
                HttpStatus.CONFLICT,
                "Invitation is not pending",
            )
        }

        if (invitation.applyToCurrentSession) {
            invitationStore.addToCurrentOpenSessionIfSafe(invitation.clubId, membershipId)
        }
        memberAccountStore.recordLastLogin(userId)
        return invitationStore.findCurrentMember(membershipId)
            ?: throw InvitationDomainException("MEMBERSHIP_NOT_FOUND", HttpStatus.CONFLICT, "Accepted membership not found")
    }

    @Transactional
    override fun revokeInvitation(host: CurrentMember, invitationId: UUID): HostInvitationResponse {
        requireHost(host)
        invitationStore.revokePendingInvitation(host.clubId, invitationId)
        return findHostInvitation(host.clubId, invitationId)
    }

    private fun findHostInvitation(
        clubId: UUID,
        invitationId: UUID,
    ): HostInvitationResponse =
        invitationStore.findHostInvitation(clubId, invitationId)?.let(::toHostInvitationResponse)
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found")

    private fun findInvitationByToken(rawToken: String): InvitationTokenRow =
        queryInvitationByToken(rawToken, forUpdate = false)

    private fun queryInvitationByToken(rawToken: String, forUpdate: Boolean): InvitationTokenRow =
        invitationStore.findInvitationByTokenHash(tokenService.hashToken(rawToken), forUpdate)
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", HttpStatus.NOT_FOUND, "Invitation not found")

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
        } catch (_: MemberAccountDuplicateException) {
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

    private fun rejectActiveMember(clubId: UUID, email: String) {
        val count = invitationStore.activeMemberCountByEmail(clubId, email)
        if (count > 0) {
            throw InvitationDomainException("MEMBER_ALREADY_ACTIVE", HttpStatus.CONFLICT, "Member is already active")
        }
    }

    private fun normalizeEmail(email: String): String =
        email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
            ?: throw InvitationDomainException("INVALID_INVITATION_EMAIL", HttpStatus.BAD_REQUEST, "Email is required")

    private fun normalizeInvitedName(name: String): String =
        name.trim().takeIf { it.isNotEmpty() }?.take(120)
            ?: throw InvitationDomainException("INVALID_INVITATION_NAME", HttpStatus.BAD_REQUEST, "Name is required")

    private fun invitationLockKey(clubId: UUID, email: String): String =
        "invitation:${sha256Short("${clubId.dbString()}:${normalizeEmail(email)}")}"

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

    private fun toHostInvitationResponse(row: HostInvitationListRow): HostInvitationResponse {
        val effectiveStatus = effectiveStatus(row.status, row.expiresAt)
        return HostInvitationResponse(
            invitationId = row.invitationId.toString(),
            email = row.email,
            name = row.name,
            role = row.role,
            status = row.status,
            effectiveStatus = effectiveStatus,
            expiresAt = row.expiresAt.toString(),
            acceptedAt = row.acceptedAt?.toString(),
            createdAt = row.createdAt.toString(),
            applyToCurrentSession = row.applyToCurrentSession,
            canRevoke = canRevoke(row.status, row.expiresAt),
            canReissue = canReissue(effectiveStatus, row.hasActiveMembership),
        )
    }

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

}
