package com.readmates.auth.application.service

import com.readmates.auth.application.GoogleLoginException
import com.readmates.auth.application.InvitationDomainError
import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.model.HostInvitationLinkStatus
import com.readmates.auth.application.port.`in`.AcceptGoogleInvitationUseCase
import com.readmates.auth.application.port.`in`.ManageHostInvitationsUseCase
import com.readmates.auth.application.port.`in`.PreviewInvitationUseCase
import com.readmates.auth.application.port.out.ActiveMembershipUpsertResult
import com.readmates.auth.application.port.out.AuthPublicProjectionLock
import com.readmates.auth.application.port.out.AuthPublicProjectionMutation
import com.readmates.auth.application.port.out.AuthPublicProjectionMutationPort
import com.readmates.auth.application.port.out.CreateHostInvitationCommand
import com.readmates.auth.application.port.out.GoogleAccountStorePort
import com.readmates.auth.application.port.out.HostInvitationLinkStorePort
import com.readmates.auth.application.port.out.HostInvitationListRow
import com.readmates.auth.application.port.out.HostInvitationStorePort
import com.readmates.auth.application.port.out.InvitationTokenRow
import com.readmates.auth.application.port.out.MemberAccountDuplicateException
import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.StoredHostInvitationLink
import com.readmates.auth.application.port.out.StoredHostInvitationLinkEvent
import com.readmates.auth.domain.InvitationStatus
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.infrastructure.security.InviteTokenFormat
import com.readmates.auth.infrastructure.security.InviteTokenKind
import com.readmates.shared.db.dbString
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.security.MessageDigest
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.HexFormat
import java.util.Locale
import java.util.UUID

private const val MAX_EMAIL_LENGTH = 320

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
    val invitationType: String,
    val clubName: String,
    val clubSlug: String,
    val canonicalPath: String,
    val email: String?,
    val name: String?,
    val emailHint: String?,
    val status: InvitationStatus,
    val expiresAt: String,
    val canAccept: Boolean,
)

@Service
class InvitationService(
    private val invitationStore: HostInvitationStorePort,
    private val tokenService: InvitationTokenService,
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val googleAccountStore: GoogleAccountStorePort,
    private val avatarAllocation: MemberAvatarAllocationPort,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
    private val publicProjection: AuthPublicProjectionMutationPort = AuthPublicProjectionMutationPort.Noop(),
    private val hostInvitationLinkStore: HostInvitationLinkStorePort? = null,
    private val clock: Clock = Clock.systemUTC(),
) : ManageHostInvitationsUseCase,
    PreviewInvitationUseCase,
    AcceptGoogleInvitationUseCase {
    @Transactional
    override fun createInvitation(
        host: ClubActor,
        email: String,
        name: String,
        applyToCurrentSession: Boolean,
    ): HostInvitationResponse {
        requireInvitationManager(host)
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

        val created = findHostInvitationRow(host.clubId, invitationId)
        return toHostInvitationResponse(created).copy(acceptUrl = acceptUrl(created.clubSlug, token, created.primaryHost))
    }

    override fun listHostInvitations(
        host: ClubActor,
        pageRequest: PageRequest,
    ): CursorPage<HostInvitationResponse> {
        requireInvitationManager(host)
        val page = invitationStore.listHostInvitations(host.clubId, pageRequest)
        return CursorPage(
            items = page.items.map(::toHostInvitationResponse),
            nextCursor = page.nextCursor,
        )
    }

    override fun previewInvitation(
        rawToken: String,
        clubSlug: String?,
    ): InvitationPreviewResponse {
        val parsed = InviteTokenFormat.parse(rawToken) ?: invitationNotFound()
        if (parsed.kind == InviteTokenKind.NAMED_LINK) return previewNamedLink(parsed.value, clubSlug)
        val invitation = findInvitationByToken(rawToken)
        if (clubSlug != null && invitation.clubSlug != clubSlug) {
            throw InvitationDomainException("INVITATION_CLUB_MISMATCH", InvitationDomainError.NOT_FOUND, "Invitation not found")
        }
        val effectiveStatus = effectiveStatus(invitation.status, invitation.expiresAt)
        return InvitationPreviewResponse(
            invitationType = "EMAIL",
            clubName = invitation.clubName,
            clubSlug = invitation.clubSlug,
            canonicalPath = invitePath(invitation.clubSlug, rawToken),
            email = invitation.email,
            name = invitation.name,
            emailHint = maskEmail(invitation.email),
            status = effectiveStatus,
            expiresAt = invitation.expiresAt.toString(),
            canAccept = effectiveStatus == InvitationStatus.PENDING,
        )
    }

    @Transactional
    @Suppress("LongMethod", "ThrowsCount")
    override fun acceptGoogleInvitation(
        rawToken: String,
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        expectedClubSlug: String?,
    ): CurrentMember {
        val parsed = InviteTokenFormat.parse(rawToken) ?: invitationNotFound()
        if (parsed.kind == InviteTokenKind.NAMED_LINK) {
            return acceptNamedLink(parsed.value, googleSubjectId, email, displayName, profileImageUrl, expectedClubSlug)
        }
        val unlockedInvitation = queryInvitationByToken(rawToken, forUpdate = false)
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(unlockedInvitation.clubId)
        val invitation = queryInvitationByToken(rawToken, forUpdate = true)
        if (invitation.id != unlockedInvitation.id || invitation.clubId != unlockedInvitation.clubId) {
            throw InvitationDomainException(
                "INVITATION_NOT_FOUND",
                InvitationDomainError.NOT_FOUND,
                "Invitation not found",
            )
        }
        if (expectedClubSlug != null && invitation.clubSlug != expectedClubSlug) {
            throw InvitationDomainException("INVITATION_CLUB_MISMATCH", InvitationDomainError.NOT_FOUND, "Invitation not found")
        }
        val effectiveStatus = effectiveStatus(invitation.status, invitation.expiresAt)
        if (effectiveStatus != InvitationStatus.PENDING) {
            throw InvitationDomainException(
                "INVITATION_${effectiveStatus.name}",
                InvitationDomainError.CONFLICT,
                "Invitation is not pending",
            )
        }

        val normalizedEmail = normalizeEmail(email)
        if (!invitation.email.equals(normalizedEmail, ignoreCase = true)) {
            throw InvitationDomainException(
                "INVITATION_EMAIL_MISMATCH",
                InvitationDomainError.FORBIDDEN,
                "Invitation email does not match authenticated Google email",
            )
        }

        val normalizedSubject =
            googleSubjectId.trim().takeIf { it.isNotEmpty() }
                ?: throw GoogleLoginException("Google subject is required")
        val userId =
            connectOrCreateInvitedGoogleUser(
                googleSubjectId = normalizedSubject,
                normalizedEmail = normalizedEmail,
                displayName = displayName ?: invitation.name,
                profileImageUrl = profileImageUrl,
            )
        val avatarKey = avatarAllocation.allocate(invitation.clubId, userId)
        val membership = invitationStore.upsertActiveMembership(invitation.clubId, userId, invitation.role, avatarKey)

        if (!invitationStore.acceptInvitation(invitation.id, userId)) {
            throw InvitationDomainException(
                "INVITATION_NOT_PENDING",
                InvitationDomainError.CONFLICT,
                "Invitation is not pending",
            )
        }

        googleAccountStore.recordLastLogin(userId)
        if (membership.becameActive) {
            publicProjection.record(
                projectionLock,
                AuthPublicProjectionMutation(
                    invitation.clubId,
                    actorMembershipId = null,
                    subjectMembershipId = membership.membershipId,
                    operation = "INVITATION_ACCEPTED",
                    clubBodyChanged = true,
                ),
            )
        }
        return invitationStore.findCurrentMember(membership.membershipId)
            ?: throw InvitationDomainException(
                "MEMBERSHIP_NOT_FOUND",
                InvitationDomainError.CONFLICT,
                "Accepted membership not found",
            )
    }

    private fun previewNamedLink(
        rawToken: String,
        clubSlug: String?,
    ): InvitationPreviewResponse {
        val link =
            hostInvitationLinkStore?.findByTokenHash(tokenService.hashToken(rawToken), false)
                ?: invitationNotFound()
        if (clubSlug != null && link.clubSlug != clubSlug) invitationNotFound("INVITATION_CLUB_MISMATCH")
        val status = effectiveNamedStatus(link)
        return InvitationPreviewResponse(
            invitationType = "NAMED_LINK",
            clubName = link.clubName,
            clubSlug = link.clubSlug,
            canonicalPath = invitePath(link.clubSlug, rawToken),
            email = null,
            name = null,
            emailHint = null,
            status =
                if (status ==
                    HostInvitationLinkStatus.ACTIVE
                ) {
                    InvitationStatus.PENDING
                } else if (status ==
                    HostInvitationLinkStatus.PAUSED
                ) {
                    InvitationStatus.REVOKED
                } else {
                    InvitationStatus.EXPIRED
                },
            expiresAt = link.expiresAt.toString(),
            canAccept = status == HostInvitationLinkStatus.ACTIVE,
        )
    }

    private fun acceptNamedLink(
        rawToken: String,
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        expectedClubSlug: String?,
    ): CurrentMember {
        val normalizedEmail = normalizeEmail(email)
        val normalizedSubject =
            googleSubjectId.trim().takeIf(String::isNotEmpty)
                ?: throw GoogleLoginException("Google subject is required")
        val context = lockNamedLink(rawToken, expectedClubSlug)
        val existing = findExistingNamedMembership(context.link.clubId, normalizedSubject)
        return existing ?: acceptNewNamedMembership(
            context,
            normalizedSubject,
            normalizedEmail,
            displayName,
            profileImageUrl,
        )
    }

    private fun lockNamedLink(
        rawToken: String,
        expectedClubSlug: String?,
    ): LockedNamedLink {
        val linkStore = hostInvitationLinkStore ?: invitationNotFound()
        val tokenHash = tokenService.hashToken(rawToken)
        val unlocked = linkStore.findByTokenHash(tokenHash, false) ?: invitationNotFound()
        val projectionLock = publicProjection.lockPotentiallyAffectedSessions(unlocked.clubId)
        val link = linkStore.findByTokenHash(tokenHash, true) ?: invitationNotFound()
        if (link.id != unlocked.id || link.clubId != unlocked.clubId) invitationNotFound()
        if (expectedClubSlug != null && link.clubSlug != expectedClubSlug) {
            invitationNotFound("INVITATION_CLUB_MISMATCH")
        }
        when (effectiveNamedStatus(link)) {
            HostInvitationLinkStatus.PAUSED -> conflict("INVITATION_LINK_PAUSED", "Invitation link is paused")
            HostInvitationLinkStatus.EXPIRED -> conflict("INVITATION_LINK_EXPIRED", "Invitation link is expired")
            HostInvitationLinkStatus.EXHAUSTED,
            HostInvitationLinkStatus.ACTIVE,
            -> Unit
        }
        return LockedNamedLink(linkStore, link, projectionLock)
    }

    private fun findExistingNamedMembership(
        clubId: UUID,
        googleSubjectId: String,
    ): CurrentMember? {
        val userId = googleAccountStore.findUserIdByGoogleSubject(googleSubjectId) ?: return null
        val existing = invitationStore.findActiveMembership(clubId, userId)
        if (existing != null) googleAccountStore.recordLastLogin(userId)
        return existing
    }

    private fun acceptNewNamedMembership(
        context: LockedNamedLink,
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember {
        val link = context.link
        if (effectiveNamedStatus(link) == HostInvitationLinkStatus.EXHAUSTED) {
            conflict("INVITATION_LINK_EXHAUSTED", "Invitation link is exhausted")
        }
        val userId = connectOrCreateInvitedGoogleUser(googleSubjectId, email, displayName, profileImageUrl)
        findExistingMembershipForNamedLink(link.clubId, userId)?.let { return it }
        val avatarKey = avatarAllocation.allocate(link.clubId, userId)
        val membership =
            invitationStore.upsertActiveMembership(
                link.clubId,
                userId,
                MembershipRole.MEMBER,
                avatarKey,
            )
        consumeNamedLink(context, membership)
        googleAccountStore.recordLastLogin(userId)
        return invitationStore.findCurrentMember(membership.membershipId)
            ?: throw InvitationDomainException(
                "MEMBERSHIP_NOT_FOUND",
                InvitationDomainError.CONFLICT,
                "Accepted membership not found",
            )
    }

    private fun consumeNamedLink(
        context: LockedNamedLink,
        membership: ActiveMembershipUpsertResult,
    ) {
        val link = context.link
        val now = OffsetDateTime.now(clock)
        val nextUsed = link.usedCount + 1
        val nextStatus =
            if (nextUsed >= link.maxUses) {
                HostInvitationLinkStatus.EXHAUSTED
            } else {
                HostInvitationLinkStatus.ACTIVE
            }
        val before = namedEventSettings(link)
        val after = before + mapOf("usedCount" to nextUsed.toString(), "status" to nextStatus.name)
        val operationId = UUID.randomUUID().toString()
        context.store.consume(
            link.id,
            link.revision,
            StoredHostInvitationLinkEvent(
                receiptId = UUID.randomUUID(),
                linkId = link.id,
                clubId = link.clubId,
                revision = link.revision + 1,
                action = "ACCEPTED",
                beforeSettings = before,
                afterSettings = after,
                actorMembershipId = null,
                idempotencyKeyHash = tokenService.hashToken("named-accept-operation:$operationId"),
                requestHash = tokenService.hashToken("named-accept-event:${link.id}:${link.revision + 1}:$operationId"),
                occurredAt = now,
            ),
        )
        if (membership.becameActive) {
            publicProjection.record(
                context.projectionLock,
                AuthPublicProjectionMutation(
                    link.clubId,
                    null,
                    membership.membershipId,
                    "INVITATION_LINK_ACCEPTED",
                    true,
                ),
            )
        }
    }

    private fun findExistingMembershipForNamedLink(
        clubId: UUID,
        userId: UUID,
    ): CurrentMember? {
        val existing = invitationStore.findActiveMembership(clubId, userId)
        if (existing != null) googleAccountStore.recordLastLogin(userId)
        return existing
    }

    private fun effectiveNamedStatus(link: StoredHostInvitationLink): HostInvitationLinkStatus =
        when {
            link.status == HostInvitationLinkStatus.PAUSED -> HostInvitationLinkStatus.PAUSED
            !link.expiresAt.isAfter(OffsetDateTime.now(clock)) -> HostInvitationLinkStatus.EXPIRED
            link.usedCount >= link.maxUses -> HostInvitationLinkStatus.EXHAUSTED
            else -> HostInvitationLinkStatus.ACTIVE
        }

    private fun namedEventSettings(link: StoredHostInvitationLink): Map<String, String?> =
        linkedMapOf(
            "status" to link.status.name,
            "maxUses" to link.maxUses.toString(),
            "usedCount" to link.usedCount.toString(),
            "expiresAt" to link.expiresAt.toString(),
        )

    private fun invitationNotFound(code: String = "INVITATION_NOT_FOUND"): Nothing =
        throw InvitationDomainException(code, InvitationDomainError.NOT_FOUND, "Invitation not found")

    private fun conflict(
        code: String,
        message: String,
    ): Nothing = throw InvitationDomainException(code, InvitationDomainError.CONFLICT, message)

    @Transactional
    override fun revokeInvitation(
        host: ClubActor,
        invitationId: UUID,
    ): HostInvitationResponse {
        requireInvitationManager(host)
        invitationStore.revokePendingInvitation(host.clubId, invitationId)
        return findHostInvitation(host.clubId, invitationId)
    }

    private fun findHostInvitation(
        clubId: UUID,
        invitationId: UUID,
    ): HostInvitationResponse = toHostInvitationResponse(findHostInvitationRow(clubId, invitationId))

    private fun findHostInvitationRow(
        clubId: UUID,
        invitationId: UUID,
    ): HostInvitationListRow =
        invitationStore.findHostInvitation(clubId, invitationId)
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", InvitationDomainError.NOT_FOUND, "Invitation not found")

    private fun findInvitationByToken(rawToken: String): InvitationTokenRow = queryInvitationByToken(rawToken, forUpdate = false)

    private fun queryInvitationByToken(
        rawToken: String,
        forUpdate: Boolean,
    ): InvitationTokenRow =
        invitationStore.findInvitationByTokenHash(tokenService.hashToken(rawToken), forUpdate)
            ?: throw InvitationDomainException("INVITATION_NOT_FOUND", InvitationDomainError.NOT_FOUND, "Invitation not found")

    private fun connectOrCreateInvitedGoogleUser(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ): UUID {
        val ownerEmail = googleAccountStore.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }

        val existingUserId = memberIdentityLookup.findAnyUserIdByEmail(normalizedEmail)
        if (existingUserId != null) {
            val connected =
                googleAccountStore.connectGoogleSubject(
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
            googleAccountStore.createGoogleUser(
                googleSubjectId = googleSubjectId,
                email = normalizedEmail,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
            )
        } catch (_: MemberAccountDuplicateException) {
            val racedUserId =
                memberIdentityLookup.findAnyUserIdByEmail(normalizedEmail)
                    ?: throw GoogleLoginException("Google account is already connected")
            val connected =
                googleAccountStore.connectGoogleSubject(
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

    private fun rejectActiveMember(
        clubId: UUID,
        email: String,
    ) {
        val count = invitationStore.activeMemberCountByEmail(clubId, email)
        if (count > 0) {
            throw InvitationDomainException("MEMBER_ALREADY_ACTIVE", InvitationDomainError.CONFLICT, "Member is already active")
        }
    }

    private fun normalizeEmail(email: String): String {
        val normalized = email.trim().lowercase(Locale.ROOT)
        if (normalized.isEmpty()) {
            throw InvitationDomainException("INVALID_INVITATION_EMAIL", InvitationDomainError.BAD_REQUEST, "Email is required")
        }
        if (normalized.length > MAX_EMAIL_LENGTH) {
            throw InvitationDomainException(
                "INVALID_INVITATION_EMAIL",
                InvitationDomainError.BAD_REQUEST,
                "Email must be 320 characters or less",
            )
        }
        return normalized
    }

    private fun normalizeInvitedName(name: String): String =
        name.trim().takeIf { it.isNotEmpty() }?.take(120)
            ?: throw InvitationDomainException("INVALID_INVITATION_NAME", InvitationDomainError.BAD_REQUEST, "Name is required")

    private fun invitationLockKey(
        clubId: UUID,
        email: String,
    ): String = "invitation:${sha256Short("${clubId.dbString()}:${normalizeEmail(email)}")}"

    private fun effectiveStatus(
        status: InvitationStatus,
        expiresAt: OffsetDateTime,
    ): InvitationStatus =
        if (status == InvitationStatus.PENDING && expiresAt.isBefore(OffsetDateTime.now(ZoneOffset.UTC))) {
            InvitationStatus.EXPIRED
        } else {
            status
        }

    private fun canRevoke(
        status: InvitationStatus,
        expiresAt: OffsetDateTime,
    ): Boolean = status == InvitationStatus.PENDING && !expiresAt.isBefore(OffsetDateTime.now(ZoneOffset.UTC))

    private fun canReissue(
        effectiveStatus: InvitationStatus,
        hasActiveMembership: Boolean,
    ): Boolean = effectiveStatus != InvitationStatus.ACCEPTED && !hasActiveMembership

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

    private fun requireInvitationManager(actor: ClubActor) {
        if (!actor.can(ClubCapability.MANAGE_INVITATIONS)) throw existingHostRequiredFailure()
    }

    private fun existingHostRequiredFailure(): InvitationDomainException =
        InvitationDomainException("HOST_REQUIRED", InvitationDomainError.FORBIDDEN, "Host role required")

    private fun acceptUrl(
        clubSlug: String,
        token: String,
        primaryHost: String?,
    ): String =
        if (primaryHost != null) {
            "https://$primaryHost/invite/$token"
        } else {
            "${appBaseUrl.trimEnd('/')}${invitePath(clubSlug, token)}"
        }

    private fun invitePath(
        clubSlug: String,
        token: String,
    ): String = "/clubs/$clubSlug/invite/$token"

    private fun sha256Short(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return HexFormat.of().formatHex(digest).take(16)
    }
}

private data class LockedNamedLink(
    val store: HostInvitationLinkStorePort,
    val link: StoredHostInvitationLink,
    val projectionLock: AuthPublicProjectionLock,
)
