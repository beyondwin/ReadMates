package com.readmates.auth.application

import com.readmates.shared.security.CurrentMember
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ResponseStatus
import java.util.Locale

@ResponseStatus(HttpStatus.UNAUTHORIZED)
class GoogleLoginException(message: String) : RuntimeException(message)

@Service
class GoogleLoginService(
    private val memberAccountRepository: MemberAccountRepository,
) {
    @Transactional(isolation = Isolation.READ_COMMITTED)
    fun loginVerifiedGoogleUser(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember = connectOrCreate(
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
    ): CurrentMember {
        val memberBySubject = memberAccountRepository.findMemberByGoogleSubject(googleSubjectId)
        if (memberBySubject != null) {
            if (memberBySubject.email != normalizedEmail) {
                throw GoogleLoginException("Google account is already connected")
            }
            return memberBySubject
        }

        return connectExistingEmailUser(googleSubjectId, normalizedEmail, profileImageUrl)
            ?: createPendingGoogleMember(googleSubjectId, normalizedEmail, displayName, profileImageUrl)
    }

    private fun createPendingGoogleMember(
        googleSubjectId: String,
        normalizedEmail: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember {
        return try {
            memberAccountRepository.createPendingGoogleMember(
                googleSubjectId = googleSubjectId,
                email = normalizedEmail,
                displayName = displayName,
                profileImageUrl = profileImageUrl,
            )
        } catch (exception: DuplicateKeyException) {
            resolveDuplicatePendingGoogleMember(googleSubjectId, normalizedEmail, profileImageUrl, exception)
        }
    }

    private fun resolveDuplicatePendingGoogleMember(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
        exception: DuplicateKeyException,
    ): CurrentMember {
        val memberBySubject = memberAccountRepository.findMemberByGoogleSubject(googleSubjectId)
        if (memberBySubject != null) {
            if (memberBySubject.email != normalizedEmail) {
                throw GoogleLoginException("Google account is already connected")
            }
            return memberBySubject
        }

        return connectExistingEmailUser(googleSubjectId, normalizedEmail, profileImageUrl)
            ?: throw exception
    }

    private fun connectExistingEmailUser(
        googleSubjectId: String,
        normalizedEmail: String,
        profileImageUrl: String?,
    ): CurrentMember? {
        val ownerEmail = memberAccountRepository.googleSubjectOwnerEmail(googleSubjectId)
        if (ownerEmail != null && ownerEmail != normalizedEmail) {
            throw GoogleLoginException("Google account is already connected")
        }

        val userId = memberAccountRepository.findAnyUserIdByEmail(normalizedEmail) ?: return null
        val connected = memberAccountRepository.connectGoogleSubject(
            userId = userId,
            googleSubjectId = googleSubjectId,
            profileImageUrl = profileImageUrl,
        )
        if (!connected) {
            throw GoogleLoginException("Existing user is connected to a different Google account")
        }
        return memberAccountRepository.findMemberByUserIdIncludingPending(userId)
            ?: throw GoogleLoginException("Connected user has no membership")
    }
}
