package com.readmates.auth.application.port.out

import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.CurrentUser
import java.util.UUID

class MemberAccountDuplicateException(cause: Throwable) : RuntimeException("Member account duplicate", cause)

interface MemberAccountStorePort {
    fun findActiveMemberByEmail(email: String): CurrentMember?
    fun findDevSeedActiveMemberByEmail(email: String): CurrentMember?
    fun findActiveMemberByUserId(userId: String): CurrentMember?
    fun findMemberByUserIdAndClubId(userId: UUID, clubId: UUID): CurrentMember?
    fun findMemberByEmailAndClubId(email: String, clubId: UUID): CurrentMember?
    fun listJoinedClubs(userId: UUID): List<JoinedClubSummary>
    fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin?
    fun findMemberByGoogleSubject(googleSubjectId: String): CurrentMember?
    fun findAnyUserIdByEmail(email: String): UUID?
    fun findUserById(userId: UUID): CurrentUser?
    fun findMembershipStatusByUserId(userId: UUID): MembershipStatus?
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
