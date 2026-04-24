package com.readmates.auth.application.service

import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.auth.application.port.`in`.UpdateHostMemberProfileUseCase
import com.readmates.auth.application.port.`in`.UpdateOwnMemberProfileUseCase
import com.readmates.auth.application.port.out.MemberProfileRow
import com.readmates.auth.application.port.out.MemberProfileStorePort
import com.readmates.auth.application.toHostMemberListItem
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
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
    ): CurrentMember {
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
        updateShortName(member.clubId, member.membershipId, shortName)
        return memberProfileStore.findProfileMemberByEmail(email)
            ?.toCurrentMember()
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
    }

    @Transactional
    override fun updateMemberProfile(
        host: CurrentMember,
        membershipId: UUID,
        command: UpdateMemberProfileCommand,
    ): HostMemberListItem {
        if (!host.isHost) {
            throw MemberProfileException(MemberProfileError.HOST_ROLE_REQUIRED)
        }

        val target = memberProfileStore.findProfileMemberInClubForUpdate(host.clubId, membershipId)
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        if (target.status !in PROFILE_EDIT_TARGET_STATUSES) {
            throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
        }

        val shortName = validateShortName(command.shortName)
        updateShortName(host.clubId, target.membershipId, shortName)
        return memberProfileStore.findHostMemberListItem(host.clubId, target.membershipId)
            ?.toHostMemberListItem(host.membershipId)
            ?: throw MemberProfileException(MemberProfileError.MEMBER_NOT_FOUND)
    }

    private fun updateShortName(clubId: UUID, membershipId: UUID, shortName: String) {
        if (memberProfileStore.shortNameExistsInClub(clubId, shortName, membershipId)) {
            throw MemberProfileException(MemberProfileError.SHORT_NAME_DUPLICATE)
        }
        if (!memberProfileStore.updateShortName(clubId, membershipId, shortName)) {
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

class MemberProfileException(val error: MemberProfileError) : RuntimeException(error.message)

enum class MemberProfileError(
    val status: HttpStatus,
    val code: String,
    val message: String,
) {
    AUTHENTICATION_REQUIRED(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Authentication required"),
    HOST_ROLE_REQUIRED(HttpStatus.FORBIDDEN, "HOST_ROLE_REQUIRED", "Host role required"),
    MEMBERSHIP_NOT_ALLOWED(
        HttpStatus.FORBIDDEN,
        "MEMBERSHIP_NOT_ALLOWED",
        "Membership is not allowed to edit profile",
    ),
    MEMBER_NOT_FOUND(HttpStatus.NOT_FOUND, "MEMBER_NOT_FOUND", "Member not found"),
    SHORT_NAME_REQUIRED(HttpStatus.BAD_REQUEST, "SHORT_NAME_REQUIRED", "Short name is required"),
    SHORT_NAME_TOO_LONG(HttpStatus.BAD_REQUEST, "SHORT_NAME_TOO_LONG", "Short name must be 20 characters or fewer"),
    SHORT_NAME_INVALID(HttpStatus.BAD_REQUEST, "SHORT_NAME_INVALID", "Short name is invalid"),
    SHORT_NAME_RESERVED(HttpStatus.BAD_REQUEST, "SHORT_NAME_RESERVED", "Short name is reserved"),
    SHORT_NAME_DUPLICATE(HttpStatus.CONFLICT, "SHORT_NAME_DUPLICATE", "Short name is already used in this club"),
}
