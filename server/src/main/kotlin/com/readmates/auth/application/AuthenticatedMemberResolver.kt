package com.readmates.auth.application

import com.readmates.auth.application.port.out.MemberAccountStorePort
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.emailOrNull
import org.springframework.security.core.Authentication
import org.springframework.stereotype.Component
import java.util.Locale
import java.util.UUID

@Component
class AuthenticatedMemberResolver(
    private val memberAccountStore: MemberAccountStorePort,
    private val memberProfileStore: MemberProfileStorePort,
) {
    fun resolve(authentication: Authentication?): CurrentMember? {
        val email = authentication.emailOrNull() ?: return null
        return memberAccountStore.findActiveMemberByEmail(email)
    }

    fun resolve(authentication: Authentication?, clubContext: ResolvedClubContext?): CurrentMember? {
        val email = authentication.emailOrNull() ?: return null
        return if (clubContext != null) {
            memberAccountStore.findMemberByEmailAndClubId(email, clubContext.clubId)
        } else {
            memberAccountStore.findActiveMemberByEmail(email)
        }
    }

    fun resolveByUserId(userId: String): CurrentMember? =
        memberAccountStore.findActiveMemberByUserId(userId)

    fun resolveByUserId(userId: String, clubContext: ResolvedClubContext?): CurrentMember? =
        if (clubContext != null) {
            runCatching { UUID.fromString(userId) }
                .getOrNull()
                ?.let { memberAccountStore.findMemberByUserIdAndClubId(it, clubContext.clubId) }
        } else {
            memberAccountStore.findActiveMemberByUserId(userId)
        }

    fun resolveUserById(userId: String): CurrentUser? =
        runCatching { UUID.fromString(userId) }
            .getOrNull()
            ?.let(memberAccountStore::findUserById)

    fun resolveProfileByUserId(userId: String): CurrentMember? =
        runCatching { UUID.fromString(userId) }
            .getOrNull()
            ?.let(memberProfileStore::findProfileMemberByUserId)
            ?.toCurrentMember()

    private fun MemberProfileRow.toCurrentMember(): CurrentMember =
        CurrentMember(
            userId = userId,
            membershipId = membershipId,
            clubId = clubId,
            clubSlug = clubSlug,
            email = email.lowercase(Locale.ROOT),
            displayName = displayName,
            accountName = accountName,
            role = role,
            membershipStatus = status,
        )
}
