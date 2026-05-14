package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface GoogleAccountStorePort {
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

    fun createViewerGoogleMember(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember

    fun recordLastLogin(userId: UUID)
}
