package com.readmates.auth.application.service

import com.readmates.auth.application.GoogleLoginException
import com.readmates.auth.application.model.GoogleLoginResult
import com.readmates.auth.application.port.`in`.LoginVerifiedGoogleUserUseCase
import com.readmates.auth.application.port.out.GoogleAccountStorePort
import com.readmates.auth.application.port.out.MemberAccountDuplicateException
import com.readmates.auth.application.port.out.MemberAvatarAllocationPort
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.MembershipDuplicateException
import com.readmates.auth.application.port.out.PlatformAdminLookupPort
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.ClubSlug
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.util.Locale
import java.util.UUID

@Service
class GoogleLoginService(
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val googleAccountStore: GoogleAccountStorePort,
    private val platformAdminLookup: PlatformAdminLookupPort,
    private val avatarAllocation: MemberAvatarAllocationPort,
) : LoginVerifiedGoogleUserUseCase {
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun loginVerifiedGoogleUser(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember {
        val result =
            loginVerifiedGoogleUserForSession(
                googleSubjectId = googleSubjectId,
                email = email,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
                targetClubSlug = null,
            )
        return result.currentMember ?: throwBlockedOrMissingMembership(result.userId)
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    override fun loginVerifiedGoogleUserForSession(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
        targetClubSlug: String?,
    ): GoogleLoginResult {
        val normalizedSubject = requiredGoogleSubject(googleSubjectId)
        val normalizedEmail = requiredGoogleEmail(email)
        val normalizedTarget = normalizedTargetClubSlug(targetClubSlug)
        val userId =
            connectOrCreateIdentity(
                googleSubjectId = normalizedSubject,
                normalizedEmail = normalizedEmail,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
            )

        return if (normalizedTarget == null) {
            existingSessionResult(userId)
        } else {
            joinTargetClub(userId, normalizedTarget)
        }
    }

    private fun connectOrCreateIdentity(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ): UUID {
        val subjectOwnerEmail = googleAccountStore.googleSubjectOwnerEmail(googleSubjectId)
        val existingUserId = memberIdentityLookup.findAnyUserIdByEmail(normalizedEmail)
        return when {
            subjectOwnerEmail != null -> {
                if (subjectOwnerEmail != normalizedEmail) {
                    throw GoogleLoginException("Google account is already connected")
                }
                googleAccountStore.findUserIdByGoogleSubject(googleSubjectId)
                    ?: throw GoogleLoginException("Connected Google user is missing")
            }

            existingUserId != null -> {
                connectExistingUser(existingUserId, googleSubjectId, profileImageUrl)
                existingUserId
            }

            else ->
                try {
                    googleAccountStore.createGoogleUser(
                        googleSubjectId = googleSubjectId,
                        email = normalizedEmail,
                        displayName = displayName,
                        profileImageUrl = profileImageUrl,
                    )
                } catch (exception: MemberAccountDuplicateException) {
                    resolveDuplicateIdentity(googleSubjectId, normalizedEmail, profileImageUrl, exception)
                }
        }
    }

    private fun connectExistingUser(
        userId: UUID,
        googleSubjectId: String,
        profileImageUrl: String?,
    ) {
        if (!googleAccountStore.connectGoogleSubject(userId, googleSubjectId, profileImageUrl)) {
            throw GoogleLoginException("Existing user is connected to a different Google account")
        }
    }

    private fun resolveDuplicateIdentity(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
        exception: MemberAccountDuplicateException,
    ): UUID {
        val ownerEmail = googleAccountStore.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }
        val existingUserId =
            if (ownerEmail != null) {
                googleAccountStore.findUserIdByGoogleSubject(googleSubjectId)
            } else {
                memberIdentityLookup.findAnyUserIdByEmail(normalizedEmail)
            } ?: throw exception
        if (ownerEmail == null) connectExistingUser(existingUserId, googleSubjectId, profileImageUrl)
        return existingUserId
    }

    private fun existingSessionResult(userId: UUID): GoogleLoginResult {
        val member = memberIdentityLookup.findMemberByUserIdIncludingViewer(userId)
        return when {
            member != null -> member.toLoginResult()
            platformAdminLookup.findPlatformAdmin(userId) != null -> GoogleLoginResult(userId, null)
            else ->
                when (memberIdentityLookup.findMembershipStatusByUserId(userId)) {
                    MembershipStatus.LEFT -> throwMembershipLeft()
                    null -> GoogleLoginResult(userId, null)
                    else -> throw GoogleLoginException("Connected user has no active membership")
                }
        }
    }

    private fun joinTargetClub(
        userId: UUID,
        clubSlug: String,
    ): GoogleLoginResult {
        val clubId = googleAccountStore.findActivePublicClubIdBySlug(clubSlug) ?: targetClubUnavailable()
        val existingStatus = memberIdentityLookup.findMembershipStatusByUserIdAndClubId(userId, clubId)
        return if (existingStatus != null) {
            resolveExistingTargetMembership(userId, clubId, existingStatus)
        } else {
            val avatarKey = avatarAllocation.allocateForClubSlug(clubSlug, null)
            try {
                googleAccountStore
                    .createViewerMembershipForExistingUser(userId, clubSlug, avatarKey)
                    ?.toLoginResult()
                    ?: targetClubUnavailable()
            } catch (_: MembershipDuplicateException) {
                val racedStatus =
                    memberIdentityLookup.findMembershipStatusByUserIdAndClubId(userId, clubId)
                        ?: throw GoogleLoginException("Target membership could not be resolved")
                resolveExistingTargetMembership(userId, clubId, racedStatus)
            }
        }
    }

    private fun resolveExistingTargetMembership(
        userId: UUID,
        clubId: UUID,
        status: MembershipStatus,
    ): GoogleLoginResult =
        when (status) {
            MembershipStatus.VIEWER,
            MembershipStatus.ACTIVE,
            ->
                memberIdentityLookup.findMemberByUserIdAndClubId(userId, clubId)?.toLoginResult()
                    ?: throw GoogleLoginException("Target membership could not be resolved")

            MembershipStatus.LEFT -> throwMembershipLeft()
            MembershipStatus.SUSPENDED,
            MembershipStatus.INACTIVE,
            MembershipStatus.INVITED,
            -> throw GoogleLoginException("Target membership is blocked")
        }

    private fun targetClubUnavailable(): Nothing = throw GoogleLoginException("Target club is unavailable")

    private fun throwBlockedOrMissingMembership(userId: UUID): Nothing {
        if (memberIdentityLookup.findMembershipStatusByUserId(userId) == MembershipStatus.LEFT) throwMembershipLeft()
        throw GoogleLoginException("Connected user has no membership")
    }

    private fun throwMembershipLeft(): Nothing =
        throw GoogleLoginException(
            message = "Membership has left",
            redirectError = "membership-left",
        )
}

private fun CurrentMember.toLoginResult(): GoogleLoginResult = GoogleLoginResult(userId = userId, currentMember = this)

private fun requiredGoogleSubject(rawValue: String): String =
    rawValue.trim().takeIf { it.isNotEmpty() }
        ?: throw GoogleLoginException("Google subject is required")

private fun requiredGoogleEmail(rawValue: String): String =
    rawValue.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
        ?: throw GoogleLoginException("Google email is required")

private fun normalizedTargetClubSlug(rawValue: String?): String? =
    rawValue
        ?.trim()
        ?.lowercase(Locale.ROOT)
        ?.takeIf { it.isNotEmpty() }
        ?.let {
            runCatching { ClubSlug.parse(it).value }
                .getOrElse { throw GoogleLoginException("Target club is invalid") }
        }
