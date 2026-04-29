package com.readmates.auth.application

import com.readmates.auth.application.port.out.MemberAccountDuplicateException
import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ResponseStatus
import java.util.Locale
import java.util.UUID

data class GoogleLoginResult(
    val userId: UUID,
    val currentMember: CurrentMember?,
)

@ResponseStatus(HttpStatus.UNAUTHORIZED)
class GoogleLoginException(
    message: String,
    val redirectError: String = "google",
) : RuntimeException(message)

@Service
class GoogleLoginService(
    private val memberAccountStore: MemberAccountStorePort,
) {
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun loginVerifiedGoogleUser(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember {
        val result = loginVerifiedGoogleUserForSession(
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
    ): GoogleLoginResult = connectOrCreate(
        googleSubjectId = googleSubjectId.trim().takeIf { it.isNotEmpty() }
            ?: throw GoogleLoginException("Google subject is required"),
        normalizedEmail = email.trim().lowercase(Locale.ROOT).takeIf { it.isNotEmpty() }
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
        val memberBySubject = memberAccountStore.findMemberByGoogleSubject(googleSubjectId)
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
    ): CurrentMember {
        return try {
            memberAccountStore.createViewerGoogleMember(
                googleSubjectId = googleSubjectId,
                email = normalizedEmail,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
            )
        } catch (exception: MemberAccountDuplicateException) {
            resolveDuplicateViewerGoogleMember(googleSubjectId, normalizedEmail, profileImageUrl, exception)
        }
    }

    private fun resolveDuplicateViewerGoogleMember(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
        exception: MemberAccountDuplicateException,
    ): CurrentMember {
        val memberBySubject = memberAccountStore.findMemberByGoogleSubject(googleSubjectId)
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
        val ownerEmail = memberAccountStore.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }

        val userId = memberAccountStore.findAnyUserIdByEmail(normalizedEmail) ?: return null
        val connected = memberAccountStore.connectGoogleSubject(
            userId = userId,
            googleSubjectId = googleSubjectId,
            profileImageUrl = profileImageUrl,
        )
        if (!connected) {
            throw GoogleLoginException("Existing user is connected to a different Google account")
        }
        val member = memberAccountStore.findMemberByUserIdIncludingViewer(userId)
        if (member != null) {
            return member.toLoginResult()
        }
        if (memberAccountStore.findPlatformAdmin(userId) != null) {
            return GoogleLoginResult(userId = userId, currentMember = null)
        }
        throwBlockedOrMissingMembership(userId)
    }

    private fun throwBlockedOrMissingMembership(userId: UUID): Nothing {
        if (memberAccountStore.findMembershipStatusByUserId(userId) == MembershipStatus.LEFT) {
            throw GoogleLoginException(
                message = "Membership has left",
                redirectError = "membership-left",
            )
        }
        throw GoogleLoginException("Connected user has no membership")
    }

    private fun CurrentMember.toLoginResult(): GoogleLoginResult =
        GoogleLoginResult(userId = userId, currentMember = this)
}
