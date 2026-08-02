package com.readmates.auth.application.port.out

import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface GoogleAccountStorePort {
    fun findUserIdByGoogleSubject(googleSubjectId: String): UUID?

    fun findMemberByGoogleSubject(googleSubjectId: String): CurrentMember?

    fun googleSubjectOwnerEmail(googleSubjectId: String): String?

    fun connectGoogleSubject(
        userId: UUID,
        googleSubjectId: String,
        profileImageUrl: String?,
    ): Boolean

    fun createGoogleUser(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): UUID

    fun findActivePublicClubIdBySlug(clubSlug: String): UUID?

    fun createViewerMembershipForExistingUser(
        userId: UUID,
        clubSlug: String,
        avatarKey: BookClubAvatarKey,
    ): CurrentMember?

    fun recordLastLogin(userId: UUID)
}

class MembershipDuplicateException(
    cause: Throwable,
) : RuntimeException(cause)
