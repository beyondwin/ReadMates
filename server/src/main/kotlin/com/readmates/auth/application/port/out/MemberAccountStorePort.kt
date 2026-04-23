package com.readmates.auth.application.port.out

import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface MemberAccountStorePort {
    fun findActiveMemberByEmail(email: String): CurrentMember?
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?
    fun findActiveMemberByUserId(userId: String): CurrentMember?
    fun findMemberByGoogleSubject(googleSubjectId: String): CurrentMember?
    fun findAnyUserIdByEmail(email: String): UUID?
    fun connectGoogleSubject(userId: UUID, googleSubjectId: String, profileImageUrl: String?): Boolean

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

    fun findMemberByUserIdIncludingViewer(userId: UUID): CurrentMember?
    fun googleSubjectOwnerEmail(googleSubjectId: String): String?
    fun recordLastLogin(userId: UUID)

    fun createDevGoogleMember(
        googleSubjectId: String,
        email: String,
        displayName: String?,
        profileImageUrl: String?,
    ): CurrentMember?
}
