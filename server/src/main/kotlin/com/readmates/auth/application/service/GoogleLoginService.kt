package com.readmates.auth.application.service

import com.readmates.auth.application.port.out.GoogleAccountStorePort
import com.readmates.auth.application.port.out.MemberAccountDuplicateException
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.PlatformAdminLookupPort
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.util.Locale
import java.util.UUID

data class GoogleLoginResult(
    val userId: UUID,
    val currentMember: CurrentMember?,
)

class GoogleLoginException(
    message: String,
    val redirectError: String = "google",
) : RuntimeException(message)

@Service
class GoogleLoginService(
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val googleAccountStore: GoogleAccountStorePort,
    private val platformAdminLookup: PlatformAdminLookupPort,
) {
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
            )
        return result.currentMember ?: throwBlockedOrMissingMembership(result.userId)
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun loginVerifiedGoogleUserForSession(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): GoogleLoginResult =
        connectOrCreate(
            googleSubjectId =
                googleSubjectId.trim().takeIf { it.isNotEmpty() }
                    ?: throw GoogleLoginException("Google subject is required"),
            normalizedEmail =
                email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
                    ?: throw GoogleLoginException("Google email is required"),
            displayName = displayName,
            profileImageUrl = profileImageUrl,
        )

    private fun connectOrCreate(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ): GoogleLoginResult {
        val memberBySubject = googleAccountStore.findMemberByGoogleSubject(googleSubjectId)
        if (memberBySubject != null) {
            if (memberBySubject.email != normalizedEmail) {
                throw GoogleLoginException("Google account is already connected")
            }
            return memberBySubject.toLoginResult()
        }

        return connectExistingEmailUser(googleSubjectId, normalizedEmail, profileImageUrl)
            ?: createViewerGoogleMember(googleSubjectId, normalizedEmail, displayName, profileImageUrl)
                .toLoginResult()
    }

    private fun createViewerGoogleMember(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember =
        try {
            googleAccountStore.createViewerGoogleMember(
                googleSubjectId = googleSubjectId,
                email = normalizedEmail,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
            )
        } catch (exception: MemberAccountDuplicateException) {
            resolveDuplicateViewerGoogleMember(googleSubjectId, normalizedEmail, profileImageUrl, exception)
        }

    private fun resolveDuplicateViewerGoogleMember(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
        exception: MemberAccountDuplicateException,
    ): CurrentMember {
        val memberBySubject = googleAccountStore.findMemberByGoogleSubject(googleSubjectId)
        if (memberBySubject != null) {
            if (memberBySubject.email != normalizedEmail) {
                throw GoogleLoginException("Google account is already connected")
            }
            return memberBySubject
        }

        return connectExistingEmailUser(googleSubjectId, normalizedEmail, profileImageUrl)?.currentMember
            ?: throw exception
    }

    private fun connectExistingEmailUser(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
    ): GoogleLoginResult? {
        val ownerEmail = googleAccountStore.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }

        val userId = memberIdentityLookup.findAnyUserIdByEmail(normalizedEmail) ?: return null
        val connected =
            googleAccountStore.connectGoogleSubject(
                userId = userId,
                googleSubjectId = googleSubjectId,
                profileImageUrl = profileImageUrl,
            )
        if (!connected) {
            throw GoogleLoginException("Existing user is connected to a different Google account")
        }
        val member = memberIdentityLookup.findMemberByUserIdIncludingViewer(userId)
        if (member != null) {
            return member.toLoginResult()
        }
        if (platformAdminLookup.findPlatformAdmin(userId) != null) {
            return GoogleLoginResult(userId = userId, currentMember = null)
        }
        throwBlockedOrMissingMembership(userId)
    }

    private fun throwBlockedOrMissingMembership(userId: UUID): Nothing {
        if (memberIdentityLookup.findMembershipStatusByUserId(userId) == MembershipStatus.LEFT) {
            throw GoogleLoginException(
                message = "Membership has left",
                redirectError = "membership-left",
            )
        }
        throw GoogleLoginException("Connected user has no membership")
    }

    private fun CurrentMember.toLoginResult(): GoogleLoginResult = GoogleLoginResult(userId = userId, currentMember = this)
}
