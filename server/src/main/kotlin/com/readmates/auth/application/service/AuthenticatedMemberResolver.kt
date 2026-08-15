package com.readmates.auth.application.service

import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase
import com.readmates.auth.application.port.out.MemberIdentityLookupPort
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.toClubActor
import org.springframework.stereotype.Component
import java.util.Locale
import java.util.UUID

@Component
class AuthenticatedMemberResolver(
    private val memberIdentityLookup: MemberIdentityLookupPort,
    private val memberProfileStore: MemberProfileStorePort,
) : ResolveAuthenticatedPrincipalUseCase {
    override fun resolveByEmail(
        email: String?,
        clubContext: ResolvedClubContext?,
    ): AuthenticatedMemberSnapshot? {
        val normalizedEmail =
            email
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?.lowercase(Locale.ROOT)
                ?: return null
        val member =
            if (clubContext != null) {
                memberIdentityLookup.findMemberByEmailAndClubId(normalizedEmail, clubContext.clubId)
            } else {
                memberIdentityLookup.findActiveMemberByEmail(normalizedEmail)
            }
        return member?.toSnapshot()
    }

    override fun resolveByUserId(
        userId: String,
        clubContext: ResolvedClubContext?,
    ): AuthenticatedMemberSnapshot? =
        if (clubContext != null) {
            runCatching { UUID.fromString(userId) }
                .getOrNull()
                ?.let { memberIdentityLookup.findMemberByUserIdAndClubId(it, clubContext.clubId) }
        } else {
            memberIdentityLookup.findActiveMemberByUserId(userId)
        }?.toSnapshot()

    override fun resolveUserById(userId: String): CurrentUser? =
        runCatching { UUID.fromString(userId) }
            .getOrNull()
            ?.let(memberIdentityLookup::findUserById)

    override fun resolveProfileByUserId(userId: String): AuthenticatedMemberSnapshot? =
        runCatching { UUID.fromString(userId) }
            .getOrNull()
            ?.let(memberProfileStore::findProfileMemberByUserId)
            ?.toCurrentMember()
            ?.toSnapshot()

    private fun CurrentMember.toSnapshot(): AuthenticatedMemberSnapshot =
        AuthenticatedMemberSnapshot(
            actor = toClubActor(),
            email = email,
            displayName = displayName,
            accountName = accountName,
            clubName = clubName,
            avatarKey = avatarKey,
            role = role,
            membershipStatus = membershipStatus,
        )

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
            avatarKey = avatarKey,
        )
}
