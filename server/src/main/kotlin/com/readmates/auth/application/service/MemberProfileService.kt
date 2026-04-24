package com.readmates.auth.application.service

import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.model.MemberProfile
import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.auth.application.port.`in`.UpdateHostMemberProfileUseCase
import com.readmates.auth.application.port.`in`.UpdateOwnMemberProfileUseCase
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.auth.application.toHostMemberListItem
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.util.Locale
import java.util.UUID

@Service
class MemberProfileService(
    private val memberProfileStore: MemberProfileStorePort,
) : UpdateOwnMemberProfileUseCase, UpdateHostMemberProfileUseCase {
    @Transactional
    override fun updateOwnProfile(
        authenticationEmail: String?,
        command: UpdateMemberProfileCommand,
    ): MemberProfile {
        val email = authenticationEmail
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.lowercase(Locale.ROOT)
            ?: throw MemberProfileException(MemberProfileError.AUTHENTICATION_REQUIRED)
        val member = memberProfileStore.findProfileMemberByEmail(email)
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        val currentMember = member.toCurrentMember()
        if (!currentMember.canEditOwnProfile) {
            throw MemberProfileException(MemberProfileError.MEMBERSHIP_NOT_ALLOWED)
        }

        val shortName = validateShortName(command.shortName)
        updateOwnShortName(member.clubId, member.membershipId, shortName)
        return memberProfileStore.findProfileMemberByEmail(email)
            ?.toMemberProfile()
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
    }

    @Transactional
    override fun updateMemberProfile(
        authenticationEmail: String?,
        membershipId: UUID,
        command: UpdateMemberProfileCommand,
    ): HostMemberListItem {
        val email = authenticationEmail
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
            ?.lowercase(Locale.ROOT)
            ?: throw MemberProfileException(MemberProfileError.AUTHENTICATION_REQUIRED)
        val host = memberProfileStore.findProfileMemberByEmail(email)
            ?.toCurrentMember()
            ?: throw MemberProfileException(MemberProfileError.AUTHENTICATION_REQUIRED)
        if (!host.isHost) {
            throw MemberProfileException(MemberProfileError.HOST_ROLE_REQUIRED)
        }

        val shortName = validateShortName(command.shortName)
        updateHostShortName(host.clubId, membershipId, shortName)
        return memberProfileStore.findHostMemberListItem(host.clubId, membershipId)
            ?.toHostMemberListItem(host.membershipId)
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
    }

    private fun updateHostShortName(clubId: UUID, membershipId: UUID, shortName: String) {
        if (!memberProfileStore.lockClubProfileNames(clubId)) {
            throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        }
        val target = memberProfileStore.findProfileMemberInClubForUpdate(clubId, membershipId)
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        if (target.status !in PROFILE_EDIT_TARGET_STATUSES) {
            throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        }
        if (memberProfileStore.shortNameExistsInClub(clubId, shortName, membershipId)) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_DUPLICATE)
        }
        if (!memberProfileStore.updateShortName(clubId, membershipId, shortName)) {
            throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        }
    }

    private fun updateOwnShortName(clubId: UUID, membershipId: UUID, shortName: String) {
        if (!memberProfileStore.lockClubProfileNames(clubId)) {
            throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        }
        val currentMember = memberProfileStore.findProfileMemberInClubForUpdate(clubId, membershipId)
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        if (!currentMember.toCurrentMember().canEditOwnProfile) {
            throw MemberProfileException(MemberProfileError.MEMBERSHIP_NOT_ALLOWED)
        }
        if (memberProfileStore.shortNameExistsInClub(clubId, shortName, membershipId)) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_DUPLICATE)
        }
        if (!memberProfileStore.updateOwnShortName(clubId, membershipId, shortName)) {
            val updatedMember = memberProfileStore.findProfileMemberInClubForUpdate(clubId, membershipId)
                ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
            if (!updatedMember.toCurrentMember().canEditOwnProfile) {
                throw MemberProfileException(MemberProfileError.MEMBERSHIP_NOT_ALLOWED)
            }
            throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        }
    }

    private fun validateShortName(rawShortName: String?): String {
        val shortName = rawShortName?.trim()
            ?: throw MemberProfileException(MemberProfileError.SHORT_NAME_REQUIRED)
        if (shortName.isEmpty()) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_REQUIRED)
        }
        if (shortName.any { it.isISOControl() } ||
            EMAIL_SHAPED.matches(shortName) ||
            URL_PREFIX.containsMatchIn(shortName) ||
            DOMAIN_LIKE.matches(shortName)
        ) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_INVALID)
        }
        if (shortName.length > 20) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_TOO_LONG)
        }
        if (shortName in RESERVED_SHORT_NAMES) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_RESERVED)
        }
        return shortName
    }

    private fun MemberProfileRow.toCurrentMember(): CurrentMember =
        CurrentMember(
            userId = userId,
            membershipId = membershipId,
            clubId = clubId,
            email = email.lowercase(Locale.ROOT),
            displayName = displayName,
            shortName = shortName,
            role = role,
            membershipStatus = status,
        )

    private fun MemberProfileRow.toMemberProfile(): MemberProfile =
        MemberProfile(
            membershipId = membershipId,
            displayName = displayName,
            shortName = shortName,
            profileImageUrl = profileImageUrl,
        )

    private companion object {
        val PROFILE_EDIT_TARGET_STATUSES = setOf(
            MembershipStatus.VIEWER,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
            MembershipStatus.LEFT,
            MembershipStatus.INACTIVE,
        )
        val RESERVED_SHORT_NAMES = setOf("탈퇴한 멤버", "관리자", "호스트", "운영자")
        val EMAIL_SHAPED = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")
        val URL_PREFIX = Regex("^https?://", RegexOption.IGNORE_CASE)
        val DOMAIN_LIKE = Regex(
            "^(?i)(www\\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:[:/].*)?$",
        )
    }
}

class MemberProfileException(val error: MemberProfileError) : RuntimeException(error.code)

enum class MemberProfileError {
    AUTHENTICATION_REQUIRED,
    HOST_ROLE_REQUIRED,
    MEMBERSHIP_NOT_ALLOWED,
    MEMBER_NOT_FOUND,
    SHORT_NAME_REQUIRED,
    SHORT_NAME_TOO_LONG,
    SHORT_NAME_INVALID,
    SHORT_NAME_RESERVED,
    SHORT_NAME_DUPLICATE,
    ;

    val code: String
        get() = name
}
